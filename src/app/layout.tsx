import type { Metadata } from 'next'
import { Suspense } from 'react'
import Script from 'next/script'
import './globals.css'
import { Navbar } from '@/components/Navbar'
import { Providers } from '@/components/Providers'
import { Toast } from '@/components/Toast'
import { NightModeEffect } from '@/components/NightModeEffect'
import { NextGameCountdownServer } from '@/components/NextGameCountdownServer'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'

const GA_ID = process.env.NEXT_PUBLIC_GA_ID

export const metadata: Metadata = {
  title: 'BLITZ | ソフトボールチーム',
  description: 'BLITZソフトボールチームの公式ホームページ',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja" className="h-full">
      <head>
        {GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_ID}');
              `}
            </Script>
          </>
        )}
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>
          <Suspense fallback={null}>
            <Toast />
          </Suspense>
          <NightModeEffect />
          <Navbar />
          {/* h-16 spacer = fixed navbar (64px) の分を確保 */}
          <div className="h-16 shrink-0" />
          {/* 次の試合カウントダウン（常時表示） */}
          <Suspense fallback={null}>
            <NextGameCountdownServer />
          </Suspense>
          <main className="flex-1">{children}</main>
          <footer className="border-t border-[#1e3a5f] py-6 text-center text-[#64748b] text-sm">
            <p>© 2025 BLITZ Softball Team. All rights reserved.</p>
          </footer>
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
