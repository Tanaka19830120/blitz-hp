'use client'
import { useState } from 'react'

export function ContactForm() {
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

  if (sent) {
    return (
      <div className="glass-card rounded-2xl p-10 text-center">
        <div className="text-4xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-[#e2e8f0] mb-2">送信完了</h2>
        <p className="text-[#64748b]">お問い合わせいただきありがとうございます。<br />担当者より折り返しご連絡いたします。</p>
        <button onClick={() => setSent(false)} className="mt-6 text-sm text-[#60a5fa] hover:underline">
          別のお問い合わせをする
        </button>
      </div>
    )
  }

  return (
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
        <button type="submit" disabled={sending} className="btn-primary w-full py-3 text-base disabled:opacity-60">
          {sending ? '送信中…' : '送信する'}
        </button>
      </form>
    </div>
  )
}
