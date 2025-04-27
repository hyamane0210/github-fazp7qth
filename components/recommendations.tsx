import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { ExternalLink, ChevronRight, Search, Info } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useFavorites } from "@/contexts/favorites-context"
import { FavoriteIcon } from "./favorite-icon"
import { Button } from "@/components/ui/button"
import { ImageWithFallback } from "./ui/image-with-fallback"
import { Alert, AlertDescription } from "@/components/ui/alert"

export type RecommendationItem = {
  name: string
  reason: string
  features: string[]
  imageUrl: string
  officialUrl: string
}

export type RecommendationsData = {
  artists: RecommendationItem[]
  celebrities: RecommendationItem[]
  media: RecommendationItem[]
  fashion: RecommendationItem[]
}

type CategoryMapping = {
  artists: string
  celebrities: string
  media: string
  fashion: string
}

const categoryTitles: CategoryMapping = {
  artists: "アーティスト",
  celebrities: "芸能人/インフルエンサー",
  media: "映画/アニメ",
  fashion: "ファッションブランド",
}

export function Recommendations({
  data,
  searchTerm,
}: {
  data: RecommendationsData
  searchTerm: string
}) {
  const router = useRouter()
  const { isFavorite } = useFavorites()
  const [selectedItem, setSelectedItem] = useState<RecommendationItem | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [imageError, setImageError] = useState<Record<string, boolean>>({})

  const handleItemClick = (item: RecommendationItem) => {
    setSelectedItem(item)
    setIsDialogOpen(true)
  }

  const handleRecommendedSearch = () => {
    if (selectedItem) {
      setIsDialogOpen(false)
      router.push(`/search?q=${encodeURIComponent(selectedItem.name)}`)
    }
  }

  const handleImageError = (itemName: string) => {
    setImageError(prev => ({ ...prev, [itemName]: true }))
  }

  return (
    <div className="space-y-12">
      {(Object.keys(data) as Array<keyof RecommendationsData>).map((category) => {
        const items = data[category]

        return (
          <section key={category} className="space-y-6">
            <div className="border-b pb-2">
              <h2 className="text-2xl font-bold flex items-center">
                {categoryTitles[category]}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({items.length} / 15 件)
                </span>
              </h2>
              <p className="text-muted-foreground">
                「{searchTerm}」に関連する{categoryTitles[category]}の一覧
              </p>
            </div>

            {items.length === 0 ? (
              <Alert className="bg-muted/30 border-muted">
                <AlertDescription className="flex items-center">
                  <Info className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span className="text-sm">
                    「{searchTerm}」に関連する{categoryTitles[category]}が見つかりませんでした。
                  </span>
                </AlertDescription>
              </Alert>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {items.map((item, index) => (
                  <div
                    key={`${item.name}-${index}`}
                    className="cursor-pointer hover:shadow-lg transition-shadow rounded-lg overflow-hidden border bg-card"
                    onClick={() => handleItemClick(item)}
                  >
                    <div className="relative aspect-square">
                      <ImageWithFallback
                        src={imageError[item.name] ? "/placeholder.svg?height=400&width=400" : item.imageUrl}
                        alt={item.name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                        loading={index < 5 ? "eager" : "lazy"}
                        fallbackText={item.name.substring(0, 2)}
                        identifier={`${category}-${item.name}-${index}`}
                        onError={() => handleImageError(item.name)}
                      />
                      <div className="absolute top-2 right-2">
                        <FavoriteIcon item={item} />
                      </div>
                    </div>
                    <div className="p-3">
                      <h3 className="font-medium text-sm mb-1 line-clamp-1">{item.name}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 h-8">{item.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {items.length > 0 && (
              <div className="flex justify-end">
                <Button variant="outline" asChild>
                  <Link href={`/category/${category}?q=${encodeURIComponent(searchTerm)}`}>
                    すべて見る
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            )}
          </section>
        )
      })}

      {/* 詳細ダイアログ */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        {selectedItem && (
          <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle className="text-xl">{selectedItem.name}</DialogTitle>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto pr-4">
              <div className="space-y-4">
                <div className="relative w-full h-64 rounded-md overflow-hidden">
                  <ImageWithFallback
                    src={imageError[selectedItem.name] ? "/placeholder.svg?height=400&width=400" : selectedItem.imageUrl}
                    alt={selectedItem.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 500px"
                    fallbackText={selectedItem.name.substring(0, 2)}
                    identifier={selectedItem.name}
                    onError={() => handleImageError(selectedItem.name)}
                  />
                  <div className="absolute top-2 right-2">
                    <FavoriteIcon item={selectedItem} size="lg" />
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-lg">提案理由</h3>
                  <p className="text-muted-foreground">{selectedItem.reason}</p>
                </div>

                <div>
                  <h3 className="font-semibold text-lg">特徴</h3>
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {selectedItem.features.map((feature, index) => (
                      <li key={index}>{feature}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-lg">公式サイト</h3>
                  <a
                    href={selectedItem.officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center text-primary hover:underline"
                  >
                    {selectedItem.officialUrl.replace(/^https?:\/\//, "").split("/")[0]}
                    <ExternalLink className="ml-1 h-4 w-4" />
                  </a>
                </div>
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button onClick={handleRecommendedSearch} className="w-full bg-[#454545] hover:bg-[#454545]/90">
                <Search className="mr-2 h-4 w-4" />「{selectedItem.name}」で検索
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}