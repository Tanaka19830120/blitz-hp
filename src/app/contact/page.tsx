'use client'

import { useState } from 'react'

export default function ContactPage() {
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const form = e.currentTarget
    const data = {
      name:    (form.elements.namedItem('name') as HTMLInputElement)?.value ?? '',
      email:   (form.elements.namedItem('email') as HTMLInputElement)?.value ?? '',
      type:    (form.elements.namedItem('type') as HTMLSelectElement)?.value ?? 'other',
      message: (form.elements.namedItem('message') as HTMLTextAreaElement)?.value ?? '',
    }
    setSending(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || '送信に失敗しました')
      }
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '送信に失敗しました')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="pt-16 max-w-2xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-[#e2e8f0] mb-2">お問い合わせ</h1>
        <p className="text-[#64748b]">体験参加・入団希望など、お気軽にご連絡ください。</p>
      </div>

      {/* LINE で問い合わせ（メイン導線） */}
      <div className="glass-card rounded-2xl p-6 mb-6 text-center border border-[#06c755]/30">
        <h2 className="text-lg font-bold text-[#e2e8f0] mb-2">💬 LINE で問い合わせ</h2>
        <p className="text-sm text-[#94a3b8] mb-4">
          BLITZ の LINE 公式アカウントを友だち追加して、トークでお気軽にメッセージください。<br className="hidden sm:block" />
          そのまま担当者とやり取りできます（おすすめ）。
        </p>
        <a
          href="https://line.me/R/ti/p/@650qnnkf"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-white text-base"
          style={{ background: '#06c755' }}
        >
          ＋ LINE で友だち追加して問い合わせる
        </a>
        <p className="text-[10px] text-[#475569] mt-3">ID: @650qnnkf</p>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="h-px flex-1 bg-[#1e3a5f]" />
        <span className="text-xs text-[#475569]">または フォームで送信</span>
        <div className="h-px flex-1 bg-[#1e3a5f]" />
      </div>

      {sent ? (
        <div className="glass-card rounded-2xl p-10 text-center">
          <div className="text-4xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-[#e2e8f0] mb-2">送信完了</h2>
          <p className="text-[#64748b]">お問い合わせいただきありがとうございます。<br />担当者より折り返しご連絡いたします。</p>
          <button
            onClick={() => setSent(false)}
            className="mt-6 text-sm text-[#60a5fa] hover:underline"
          >
            別のお問い合わせをする
          </button>
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="grid gap-5">
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">お名前 *</label>
              <input name="name" type="text" required placeholder="山田 太郎" className="w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">メールアドレス *</label>
              <input name="email" type="email" required placeholder="yamada@example.com" className="w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">お問い合わせ種別</label>
              <select name="type" className="w-full">
                <option value="trial">体験参加について</option>
                <option value="join">入団希望</option>
                <option value="practice">練習試合の申し込み</option>
                <option value="other">その他</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">お問い合わせ内容 *</label>
              <textarea
                name="message"
                required
                rows={5}
                placeholder="お気軽にご記入ください"
                className="w-full bg-[#0d1b2a] border border-[#1e3a5f] rounded-lg px-4 py-3 text-[#e2e8f0] placeholder:text-[#334155] focus:outline-none focus:border-[#2563eb] resize-none"
              />
            </div>
            {error && <p className="text-sm text-[#ef4444]">⚠ {error}</p>}
            <div>
              <button type="submit" disabled={sending} className="btn-primary w-full py-3 text-base disabled:opacity-60">
                {sending ? '送信中…' : '送信する'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="mt-8 glass-card rounded-2xl p-6">
        <h2 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase mb-4">活動情報</h2>
        <dl className="space-y-2 text-sm">
          {[
            { label: '活動日', value: '土・日曜日（月2回程度）' },
            { label: '活動地域', value: '兵庫県 加古川・加古郡・明石エリア' },
            { label: '対象', value: 'ソフトボール経験者・未経験者問わず歓迎' },
          ].map(({ label, value }) => (
            <div key={label} className="flex gap-3">
              <dt className="text-[#64748b] w-20 shrink-0">{label}</dt>
              <dd className="text-[#94a3b8]">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
