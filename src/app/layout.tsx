import type { Metadata } from 'next'
import './globals.css'
import { Navbar } from '@/components/Navbar'
import { Providers } from '@/components/Providers'

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
      <body className="min-h-full flex flex-col">
        <Providers>
          <Navbar />
          <main className="flex-1">{children}</main>
          <footer className="border-t border-[#1e3a5f] py-6 text-center text-[#64748b] text-sm">
            <p>© 2025 BLITZ Softball Team. All rights reserved.</p>
          </footer>
        </Providers>
      </body>
    </html>
  )
}
