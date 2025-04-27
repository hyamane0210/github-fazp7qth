import { NextResponse } from 'next/server'
import OpenAI from 'openai'

// Add Redis-like in-memory cache
const CACHE_DURATION = 1000 * 60 * 60 // 1 hour
const recommendationsCache = new Map<string, { data: any; timestamp: number }>()

const openai = new OpenAI({
  apiKey: "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",
})

export async function POST(request: Request) {
  try {
    const { query, category } = await request.json()
    
    // Generate cache key
    const cacheKey = `${query}-${category}`
    
    // Check cache
    const cached = recommendationsCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return NextResponse.json(cached.data)
    }

    const prompt = `
以下のアイテムに関連する${category}を10個提案してください。
${category === "音楽アーティスト" ? "※必ず音楽アーティストのみを提案してください。バンド、ソロアーティスト、グループなど、音楽活動を主とする方々に限定します。" : ""}

関連性の基準:
- 同じ雰囲気やスタイル
- 共通のファン層
- コラボレーション経験
- 同時期の活動や影響関係
- 同じジャンルやカテゴリー

アイテム: ${query}

注意事項:
- 必ず日本語で回答してください
- 日本語名が一般的な場合は日本語表記を優先してください
- 海外アーティストや作品でも、日本での一般的な呼び方がある場合はそちらを使用してください

回答は以下のJSON形式で提供してください:
{
  "items": [
    {
      "name": "アイテム名",
      "reason": "関連性の説明（200文字以内）",
      "features": ["特徴1", "特徴2", "特徴3"]
    }
  ]
}
`

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "あなたはエンターテインメントと文化に関する専門家です。日本のユーザー向けに情報を提供します。",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
    })

    const result = JSON.parse(response.choices[0].message.content)
    
    // Cache the result
    recommendationsCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error in recommendations API:", error)
    return NextResponse.json({ error: "Failed to get recommendations" }, { status: 500 })
  }
}