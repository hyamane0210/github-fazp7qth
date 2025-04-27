import { type RecommendationItem } from "@/types/recommendations"
import SpotifyWebApi from "spotify-web-api-node"
import OpenAI from "openai"
import { backOff } from "exponential-backoff"

const TMDB_API_KEY = "98d2add5cfdecc71d15e7e7881a2600f"
const TMDB_BASE_URL = "https://api.themoviedb.org/3"
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p"

const SPOTIFY_CLIENT_ID = "c8924afcde704bbcae6dd93643238522"
const SPOTIFY_CLIENT_SECRET = "e799fef0aa984804a6c18e80baf80fef"

// Initialize Spotify client
const spotifyApi = new SpotifyWebApi({
  clientId: SPOTIFY_CLIENT_ID,
  clientSecret: SPOTIFY_CLIENT_SECRET,
})

let spotifyTokenExpirationTime = 0
let tokenRetryCount = 0
const MAX_TOKEN_RETRIES = 3
const TOKEN_RETRY_DELAY = 1000 // 1 second delay between retries
let tokenRefreshPromise: Promise<void> | null = null // For preventing concurrent token refreshes

// Get Wikipedia image with improved error handling and retries
async function getWikipediaImage(name: string): Promise<string | null> {
  const searchQueries = [
    name, // オリジナルの検索クエリ
    `${name} (アーティスト)`,
    `${name} (歌手)`,
    `${name} (俳優)`,
    `${name} (映画)`,
    `${name} (アニメ)`,
    `${name} (ブランド)`,
  ]

  // 検索クエリごとに試行
  for (const query of searchQueries) {
    try {
      // バックオフ設定
      const result = await backOff(
        async () => {
          // 記事の検索
          const searchResponse = await fetch(
            `https://ja.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(
              query,
            )}&origin=*`,
          )

          if (!searchResponse.ok) {
            throw new Error(`Wikipedia search failed: ${searchResponse.status}`)
          }

          const searchData = await searchResponse.json()
          const pageId = searchData.query?.search?.[0]?.pageid

          if (!pageId) {
            return null
          }

          // 画像情報の取得（複数サイズを試行）
          const sizes = [800, 500, 300] // 大きいサイズから試行
          for (const size of sizes) {
            const imageResponse = await fetch(
              `https://ja.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages|info&pithumbsize=${size}&inprop=url&pageids=${pageId}&origin=*`,
            )

            if (!imageResponse.ok) {
              throw new Error(`Wikipedia image fetch failed: ${imageResponse.status}`)
            }

            const imageData = await imageResponse.json()
            const thumbnail = imageData.query?.pages?.[pageId]?.thumbnail?.source

            if (thumbnail) {
              return thumbnail
            }
          }

          // 代替として記事の画像一覧を取得
          const imagesResponse = await fetch(
            `https://ja.wikipedia.org/w/api.php?action=query&format=json&prop=images&pageids=${pageId}&origin=*`,
          )

          if (!imagesResponse.ok) {
            throw new Error(`Wikipedia images list fetch failed: ${imagesResponse.status}`)
          }

          const imagesData = await imagesResponse.json()
          const images = imagesData.query?.pages?.[pageId]?.images

          if (images && images.length > 0) {
            // 最初の画像のURLを取得
            const firstImage = images[0]
            const imageInfoResponse = await fetch(
              `https://ja.wikipedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url&titles=${encodeURIComponent(
                firstImage.title,
              )}&origin=*`,
            )

            if (!imageInfoResponse.ok) {
              throw new Error(`Wikipedia image info fetch failed: ${imageInfoResponse.status}`)
            }

            const imageInfoData = await imageInfoResponse.json()
            const pages = imageInfoData.query?.pages
            const imageInfo = pages?.[Object.keys(pages)[0]]?.imageinfo?.[0]

            if (imageInfo?.url) {
              return imageInfo.url
            }
          }

          return null
        },
        {
          numOfAttempts: 3,
          startingDelay: 1000,
          timeMultiple: 2,
          maxDelay: 5000,
          jitter: true,
        },
      )

      if (result) {
        return result
      }
    } catch (error) {
      console.error(`Error getting Wikipedia image for query "${query}":`, error)
      // エラーログの詳細化
      if (error instanceof Error) {
        console.error("Error name:", error.name)
        console.error("Error message:", error.message)
        console.error("Error stack:", error.stack)
      }
      // 次のクエリを試行するため、このエラーは無視
      continue
    }
  }

  // すべての試行が失敗した場合
  console.warn(`Failed to get Wikipedia image for all queries of "${name}"`)
  return null
}

// Get Spotify token with improved error handling and retry logic
async function getSpotifyToken(): Promise<void> {
  const now = Date.now()

  // Check if token is still valid
  if (now < spotifyTokenExpirationTime && spotifyApi.getAccessToken()) {
    return
  }

  // If a token refresh is already in progress, wait for it
  if (tokenRefreshPromise) {
    try {
      await tokenRefreshPromise
      return
    } catch (error) {
      // If the existing refresh fails, continue with a new attempt
      tokenRefreshPromise = null
    }
  }

  // Create new token refresh promise
  tokenRefreshPromise = (async () => {
    try {
      tokenRetryCount = 0
      while (tokenRetryCount < MAX_TOKEN_RETRIES) {
        try {
          const data = await spotifyApi.clientCredentialsGrant()
          const accessToken = data.body["access_token"]
          
          if (!accessToken) {
            throw new Error("No access token received from Spotify")
          }

          // Set expiration time 1 minute before actual expiration
          spotifyTokenExpirationTime = now + (data.body["expires_in"] - 60) * 1000
          spotifyApi.setAccessToken(accessToken)
          console.log("Successfully obtained Spotify token")
          return
        } catch (error) {
          tokenRetryCount++
          console.warn(`Spotify token retry attempt ${tokenRetryCount}/${MAX_TOKEN_RETRIES}`)
          
          if (tokenRetryCount >= MAX_TOKEN_RETRIES) {
            throw new Error(`Failed to get Spotify token after ${MAX_TOKEN_RETRIES} attempts`)
          }
          
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, TOKEN_RETRY_DELAY * Math.pow(2, tokenRetryCount - 1)))
        }
      }
    } finally {
      tokenRefreshPromise = null
    }
  })()

  await tokenRefreshPromise
}

// Get Spotify artist image
async function getSpotifyArtistImage(name: string): Promise<string | null> {
  try {
    await getSpotifyToken()
    
    if (!spotifyApi.getAccessToken()) {
      throw new Error("No Spotify token available after token retrieval")
    }

    const searchResult = await spotifyApi.searchArtists(name, { limit: 1 })
    
    if (searchResult.body.artists?.items.length > 0) {
      const artist = searchResult.body.artists.items[0]
      if (artist.images && artist.images.length > 0) {
        return artist.images[0].url
      }
    }
    return null
  } catch (error) {
    console.error("Error getting Spotify artist image:", error)
    return null
  }
}

// Get TMDB image
async function getTMDBImage(name: string, type: "person" | "media"): Promise<string | null> {
  try {
    const endpoint = type === "person" ? "person" : "multi"
    const response = await fetch(
      `${TMDB_BASE_URL}/search/${endpoint}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(name)}&language=ja-JP`,
    )
    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`)
    }
    const data = await response.json()
    const result = data.results[0]
    if (result) {
      const imagePath = type === "person" ? result.profile_path : result.poster_path
      if (imagePath) {
        return `${TMDB_IMAGE_BASE_URL}/w500${imagePath}`
      }
    }
    return null
  } catch (error) {
    console.error("Error getting TMDB image:", error)
    return null
  }
}

// Get artist image (Spotify → TMDB → Wikipedia → Default)
async function getArtistImage(name: string): Promise<string | null> {
  try {
    // 1. Try Spotify
    const spotifyImage = await getSpotifyArtistImage(name)
    if (spotifyImage) return spotifyImage

    // 2. Try TMDB
    const tmdbImage = await getTMDBImage(name, "person")
    if (tmdbImage) return tmdbImage

    // 3. Try Wikipedia
    const wikiImage = await getWikipediaImage(name)
    if (wikiImage) return wikiImage

    // 4. Default image
    return "/placeholder.svg?height=400&width=400"
  } catch (error) {
    console.error("Error getting artist image:", error)
    return "/placeholder.svg?height=400&width=400"
  }
}

// Get person image (TMDB → Spotify → Wikipedia → Default)
async function getPersonImage(name: string): Promise<string | null> {
  try {
    // 1. Try TMDB
    const tmdbImage = await getTMDBImage(name, "person")
    if (tmdbImage) return tmdbImage

    // 2. Try Spotify
    const spotifyImage = await getSpotifyArtistImage(name)
    if (spotifyImage) return spotifyImage

    // 3. Try Wikipedia
    const wikiImage = await getWikipediaImage(name)
    if (wikiImage) return wikiImage

    // 4. Default image
    return "/placeholder.svg?height=400&width=400"
  } catch (error) {
    console.error("Error getting person image:", error)
    return "/placeholder.svg?height=400&width=400"
  }
}

// Get media image (TMDB → Spotify → Wikipedia → Default)
async function getMediaImage(name: string): Promise<string | null> {
  try {
    // 1. Try TMDB
    const tmdbImage = await getTMDBImage(name, "media")
    if (tmdbImage) return tmdbImage

    // 2. Try Spotify
    const spotifyImage = await getSpotifyArtistImage(name)
    if (spotifyImage) return spotifyImage

    // 3. Try Wikipedia
    const wikiImage = await getWikipediaImage(name)
    if (wikiImage) return wikiImage

    // 4. Default image
    return "/placeholder.svg?height=400&width=400"
  } catch (error) {
    console.error("Error getting media image:", error)
    return "/placeholder.svg?height=400&width=400"
  }
}

// Get fashion brand image (Wikipedia → Default)
async function getFashionImage(name: string): Promise<string | null> {
  try {
    // 1. Try Wikipedia
    const wikiImage = await getWikipediaImage(name)
    if (wikiImage) return wikiImage

    // 2. Default image
    return "/placeholder.svg?height=400&width=400"
  } catch (error) {
    console.error("Error getting fashion image:", error)
    return "/placeholder.svg?height=400&width=400"
  }
}

// Add cache implementation
const CACHE_DURATION = 1000 * 60 * 60 // 1 hour
const imageCache = new Map<string, { url: string; timestamp: number }>()

// Modify getRecommendations function to implement caching and optimization
export async function getRecommendations(query: string) {
  try {
    // Get related items for each category using OpenAI
    const [artists, celebrities, media, fashion] = await Promise.all([
      getRelatedItems(query, "音楽アーティスト"),
      getRelatedItems(query, "芸能人/インフルエンサー"),
      getRelatedItems(query, "映画/アニメ作品"),
      getRelatedItems(query, "ファッションブランド"),
    ])

    // Limit each category to 10 items
    const limitedArtists = artists.slice(0, 10)
    const limitedCelebrities = celebrities.slice(0, 10)
    const limitedMedia = media.slice(0, 10)
    const limitedFashion = fashion.slice(0, 10)

    // Process items in batches to prevent too many concurrent requests
    const batchSize = 5
    const processItems = async <T extends { name: string }>(
      items: T[],
      getImage: (name: string) => Promise<string | null>,
      baseUrl: string
    ) => {
      const processed: (T & { imageUrl: string; officialUrl: string })[] = []
      
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize)
        const batchResults = await Promise.all(
          batch.map(async (item) => {
            // Check cache first
            const cacheKey = `${item.name}-${getImage.name}`
            const cached = imageCache.get(cacheKey)
            
            let imageUrl: string
            if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
              imageUrl = cached.url
            } else {
              imageUrl = await getImage(item.name) || "/placeholder.svg?height=400&width=400"
              imageCache.set(cacheKey, { url: imageUrl, timestamp: Date.now() })
            }

            return {
              ...item,
              imageUrl,
              officialUrl: `${baseUrl}${encodeURIComponent(item.name)}`,
            }
          })
        )
        processed.push(...batchResults)
      }
      
      return processed
    }

    // Process each category with optimized batch processing
    const [processedArtists, processedCelebrities, processedMedia, processedFashion] = await Promise.all([
      processItems(limitedArtists, getArtistImage, "https://open.spotify.com/search/"),
      processItems(limitedCelebrities, getPersonImage, "https://www.themoviedb.org/search?query="),
      processItems(limitedMedia, getMediaImage, "https://www.themoviedb.org/search?query="),
      processItems(limitedFashion, getFashionImage, "https://www.google.com/search?q="),
    ])

    return {
      artists: processedArtists,
      celebrities: processedCelebrities,
      media: processedMedia,
      fashion: processedFashion,
    }
  } catch (error) {
    console.error("Error fetching recommendations:", error)
    // Return default items for each category on error
    const defaultItems = Array(10).fill({
      name: "推奨アイテム",
      reason: "関連性のある推奨アイテムです",
      features: ["特徴1", "特徴2", "特徴3"],
      imageUrl: "/placeholder.svg?height=400&width=400",
      officialUrl: "https://example.com",
    })

    return {
      artists: defaultItems,
      celebrities: defaultItems,
      media: defaultItems,
      fashion: defaultItems,
    }
  }
}

// Get related items using OpenAI
async function getRelatedItems(query: string, category: string) {
  try {
    const response = await fetch("/api/recommendations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, category }),
    })

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }

    const data = await response.json()
    return data.items
  } catch (error) {
    console.error("Error getting related items:", error)
    return Array(10).fill({
      name: "推奨アイテム",
      reason: "関連性のある推奨アイテムです",
      features: ["特徴1", "特徴2", "特徴3"],
    })
  }
}