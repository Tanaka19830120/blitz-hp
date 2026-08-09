'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { useState, useRef, useEffect } from 'react'

// ─ PC で常時表示するメインリンク ─
const mainLinks = [
  { href: '/', label: 'ホーム' },
  { href: '/schedule', label: '日程・出欠' },
  { href: '/results', label: '試合結果' },
  { href: '/stats', label: '個人成績' },
  { href: '/members', label: 'メンバー' },
  { href: '/album', label: '写真' },
]

// ─ 「…」ドロップダウンに入るサブリンク ─
const subLinks = [
  { href: '/profile', label: 'チームプロフィール' },
  { href: '/links', label: 'リンク集' },
  { href: '/help', label: '使い方' },
  { href: '/contact', label: 'お問い合わせ' },
]

const allLinks = [...mainLinks, ...subLinks]

export function Navbar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const [dropOpen, setDropOpen] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  // ドロップダウン外クリックで閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  const linkClass = (href: string, activeColor = 'text-[#60a5fa]') =>
    `px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
      isActive(href)
        ? `bg-[#1a2744] ${activeColor}`
        : 'text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#0d1b2a]'
    }`

  // サブリンクのどれかがアクティブなら「…」をハイライト
  const subActive = subLinks.some(l => isActive(l.href))

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass-card border-b border-[#1e3a5f]">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-2">

        {/* ロゴ */}
        <Link href="/" className="flex items-center gap-2 shrink-0 mr-2">
          <Image src="/blitz-logo.jpg" alt="BLITZ" width={34} height={34} className="rounded-full" />
          <span className="text-xl font-black tracking-widest text-gradient">BLITZ</span>
          <span className="hidden lg:block text-xs text-[#64748b] font-medium">SOFTBALL</span>
        </Link>

        {/* PC: メインリンク */}
        <div className="hidden md:flex items-center gap-0.5 flex-1">
          {mainLinks.map(link => (
            <Link key={link.href} href={link.href} className={linkClass(link.href)}>
              {link.label}
            </Link>
          ))}

          {/* 「…」ドロップダウン */}
          <div ref={dropRef} className="relative">
            <button
              onClick={() => setDropOpen(v => !v)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                subActive ? 'bg-[#1a2744] text-[#60a5fa]' : 'text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#0d1b2a]'
              }`}
            >
              •••
            </button>
            {dropOpen && (
              <div className="absolute top-full left-0 mt-1 w-48 glass-card border border-[#1e3a5f] rounded-xl py-1 shadow-2xl z-10">
                {subLinks.map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setDropOpen(false)}
                    className={`block px-4 py-2 text-sm transition-all ${
                      isActive(link.href)
                        ? 'text-[#60a5fa] bg-[#1a2744]'
                        : 'text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#0d1b2a]'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* 管理 */}
          {session?.user?.role === 'ADMIN' && (
            <Link href="/admin" className={linkClass('/admin', 'text-[#fbbf24]').replace('text-[#60a5fa]', 'text-[#fbbf24]')}>
              管理
            </Link>
          )}
        </div>

        {/* PC: ユーザー情報 */}
        <div className="hidden md:flex items-center gap-3 shrink-0 ml-auto">
          {session ? (
            <>
              <Link href="/account" className="text-sm text-[#94a3b8] hover:text-[#e2e8f0] transition-colors whitespace-nowrap">
                {session.user?.name}
              </Link>
              <button
                onClick={() => signOut()}
                className="text-sm text-[#64748b] hover:text-[#e2e8f0] transition-colors whitespace-nowrap"
              >
                ログアウト
              </button>
            </>
          ) : (
            <Link href="/login" className="btn-primary text-sm">ログイン</Link>
          )}
        </div>

        {/* スマホ: ハンバーガー */}
        <button
          className="md:hidden p-2 text-[#94a3b8] ml-auto"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>

      {/* スマホ: 展開メニュー */}
      {menuOpen && (
        <div className="md:hidden border-t border-[#1e3a5f] px-4 py-3 flex flex-col gap-1">
          {allLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive(link.href) ? 'bg-[#1a2744] text-[#60a5fa]' : 'text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#0d1b2a]'
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
                <Link href="/account" onClick={() => setMenuOpen(false)} className="text-sm text-[#94a3b8]">{session.user?.name}（アカウント）</Link>
                <button onClick={() => signOut()} className="text-sm text-[#64748b]">ログアウト</button>
              </div>
            ) : (
              <Link href="/login" onClick={() => setMenuOpen(false)} className="btn-primary text-sm block text-center">ログイン</Link>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
