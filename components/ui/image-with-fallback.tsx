"use client"

import type React from "react"

import { useState, useEffect } from "react"
import Image, { type ImageProps } from "next/image"
import { cn } from "@/lib/utils"

// プレースホルダー画像のカラーバリエーション
const placeholderColors = [
  "bg-gray-200",
  "bg-blue-100",
  "bg-green-100",
  "bg-yellow-100",
  "bg-red-100",
  "bg-purple-100",
  "bg-pink-100",
  "bg-indigo-100",
  "bg-teal-100",
]

// 一貫したプレースホルダー画像を生成するための関数
const getPlaceholderColor = (id: string | number) => {
  // 文字列の場合は文字コードの合計を使用、数値の場合はそのまま使用
  const numericId = typeof id === "string" ? id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) : id

  return placeholderColors[numericId % placeholderColors.length]
}

interface ImageWithFallbackProps extends Omit<ImageProps, "onError"> {
  fallbackText?: string
  identifier?: string | number
  containerClassName?: string
  showLoadingEffect?: boolean
  renderFallback?: (fallbackText: string) => React.ReactNode
}

export function ImageWithFallback({
  src,
  alt,
  fallbackText,
  identifier,
  containerClassName,
  showLoadingEffect = true,
  renderFallback,
  className,
  ...props
}: ImageWithFallbackProps) {
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [retryCount, setRetryCount] = useState(0)
  const maxRetries = 2

  // 識別子がない場合は代替テキストまたはランダムな値を使用
  const id = identifier || alt || Math.floor(Math.random() * 100)
  const placeholderColor = getPlaceholderColor(id)

  // 表示するテキスト（デフォルトは代替テキストの最初の2文字）
  const displayText = fallbackText || (alt ? alt.substring(0, 2).toUpperCase() : "")

  // 画像の読み込みに失敗した場合、数回リトライする
  useEffect(() => {
    if (error && retryCount < maxRetries) {
      const timer = setTimeout(() => {
        setError(false)
        setLoading(true)
        setRetryCount((prev) => prev + 1)
      }, 2000) // 2秒後にリトライ

      return () => clearTimeout(timer)
    }
  }, [error, retryCount])

  return (
    <div className={cn("relative w-full h-full", containerClassName)}>
      {/* ローディング中またはエラー時のプレースホルダー */}
      {(loading || error) && (
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center",
            placeholderColor,
            showLoadingEffect && loading && !error && "animate-pulse",
          )}
        >
          {renderFallback ? (
            renderFallback(displayText)
          ) : (
            <span className="text-gray-500 font-semibold text-lg">{displayText}</span>
          )}
        </div>
      )}

      {/* 実際の画像（エラー時は非表示） */}
      {!error && (
        <Image
          src={src || "/placeholder.svg"}
          alt={alt}
          className={cn(loading ? "opacity-0" : "opacity-100", "transition-opacity duration-300", className)}
          onLoadingComplete={() => setLoading(false)}
          onError={() => {
            setError(true)
            setLoading(false)
          }}
          {...props}
        />
      )}
    </div>
  )
}

