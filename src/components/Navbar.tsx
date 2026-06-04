'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { useState } from 'react'

const navLinks = [
  { href: '/', label: 'ホーム' },
  { href: '/schedule', label: '日程・出欠' },
  { href: '/results', label: '試合結果' },
  { href: '/stats', label: '成績' },
  { href: '/album', label: '写真' },
  { href: '/members', label: 'メンバー' },
  { href: '/profile', label: 'チームプロフィール' },
  { href: '/help', label: '使い方' },
  { href: '/contact', label: 'お問い合わせ' },
]

export function Navbar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-card border-b border-[#1e3a5f]">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/blitz-logo.jpg" alt="BLITZ" width={36} height={36} className="rounded-full" />
          <span className="text-2xl font-black tracking-widest text-gradient">BLITZ</span>
          <span className="hidden sm:block text-xs text-[#64748b] font-medium">SOFTBALL</span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                (link.href === '/' ? pathname === '/' : pathname.startsWith(link.href))
                  ? 'bg-[#1a2744] text-[#60a5fa]'
                  : 'text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#0d1b2a]'
              }`}
            >
              {link.label}
            </Link>
          ))}
          {session?.user?.role === 'ADMIN' && (
            <Link
              href="/admin"
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                pathname.startsWith('/admin')
                  ? 'bg-[#1a2744] text-[#fbbf24]'
                  : 'text-[#fbbf24] hover:bg-[#0d1b2a]'
              }`}
            >
              管理
            </Link>
          )}
        </div>

        <div className="hidden md:flex items-center gap-3">
          {session ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-[#94a3b8]">{session.user?.name}</span>
              <button
                onClick={() => signOut()}
                className="text-sm text-[#64748b] hover:text-[#e2e8f0] transition-colors"
              >
                ログアウト
              </button>
            </div>
          ) : (
            <Link href="/login" className="btn-primary text-sm">
              ログイン
            </Link>
          )}
        </div>

        <button
          className="md:hidden p-2 text-[#94a3b8]"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t border-[#1e3a5f] px-4 py-3 flex flex-col gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                (link.href === '/' ? pathname === '/' : pathname.startsWith(link.href))
                  ? 'bg-[#1a2744] text-[#60a5fa]'
                  : 'text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#0d1b2a]'
              }`}
            >
              {link.label}
            </Link>
          ))}
          {session?.user?.role === 'ADMIN' && (
            <Link href="/admin" onClick={() => setMenuOpen(false)} className="px-3 py-2 rounded-lg text-sm font-medium text-[#fbbf24]">
              管理
            </Link>
          )}
          <div className="pt-2 border-t border-[#1e3a5f]">
            {session ? (
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#94a3b8]">{session.user?.name}</span>
                <button onClick={() => signOut()} className="text-sm text-[#64748b]">ログアウト</button>
              </div>
            ) : (
              <Link href="/login" onClick={() => setMenuOpen(false)} className="btn-primary text-sm block text-center">
                ログイン
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
