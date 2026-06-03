'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/**
 * URL の ?toast=メッセージ を検出して画面上部にトースト表示する。
 * 各サーバーアクションは成功後に redirect(`${path}?toast=${encodeURIComponent('○○しました')}`) するだけでよい。
 * ルートレイアウトに常設。
 */
export function Toast() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [msg, setMsg] = useState<string | null>(null)

  // ① URL の toast パラメータを検出 → 表示してURLから除去
  useEffect(() => {
    const t = params.get('toast')
    if (!t) return
    setMsg(t)
    const next = new URLSearchParams(params.toString())
    next.delete('toast')
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  // ② 表示中のトーストを一定時間後に消す（params変化の影響を受けない独立タイマー）
  useEffect(() => {
    if (!msg) return
    const timer = setTimeout(() => setMsg(null), 2800)
    return () => clearTimeout(timer)
  }, [msg])

  if (!msg) return null

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] px-5 py-2.5 rounded-xl shadow-lg text-sm font-bold bg-[#16a34a] text-white">
      ✅ {msg}
    </div>
  )
}
