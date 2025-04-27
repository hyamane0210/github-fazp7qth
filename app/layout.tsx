import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { FavoritesProvider } from "@/contexts/favorites-context"
import { OnboardingProvider } from "@/contexts/onboarding-context"
import { AuthProvider } from "@/contexts/auth-context"
import Header from "@/components/header"

const inter = Inter({ subsets: ["latin"] })

// メタデータのタイトルと説明を日本語に翻訳します
export const metadata: Metadata = {
  title: "My Project - あなた専用のコンテンツ体験",
  description: "アーティスト、映画、アニメ、ファッションなど、あなたの興味に合わせたおすすめを発見しましょう",
    generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AuthProvider>
            <FavoritesProvider>
              <OnboardingProvider>
                <div className="min-h-screen bg-background flex flex-col">
                  <Header />
                  <main className="flex-1">{children}</main>
                </div>
                <Toaster />
              </OnboardingProvider>
            </FavoritesProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}



import './globals.css'