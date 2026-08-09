'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const form = new FormData(e.currentTarget)
    const result = await signIn('credentials', {
      number: form.get('number'),
      password: form.get('password'),
      redirect: false,
    })

    setLoading(false)
    if (result?.error) {
      setError('背番号またはパスワードが正しくありません')
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-gradient mb-2">BLITZ</h1>
          <p className="text-[#64748b]">チームメンバーログイン</p>
        </div>

        <div className="glass-card rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <label className="block text-sm font-medium text-[#94a3b8] mb-2">
                背番号
              </label>
              <input
                name="number"
                type="text"
                inputMode="numeric"
                required
                placeholder="28"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#94a3b8] mb-2">
                パスワード
              </label>
              <input
                name="password"
                type="password"
                required
                placeholder="パスワードを入力"
              />
            </div>

            {error && (
              <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3 text-sm text-[#ef4444]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-[#64748b] mt-6">
          ログイン情報は管理者から受け取ってください
        </p>
      </div>
    </div>
  )
}
