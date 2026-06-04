import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import bcrypt from 'bcryptjs'
import { SubmitButton } from '@/components/SubmitButton'

export const dynamic = 'force-dynamic'

async function changePassword(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const current = String(formData.get('current') || '')
  const next = String(formData.get('next') || '')
  const confirm = String(formData.get('confirm') || '')

  if (!current || !next || !confirm) {
    redirect(`/account?err=${encodeURIComponent('すべての項目を入力してください')}`)
  }
  if (next.length < 4) {
    redirect(`/account?err=${encodeURIComponent('新しいパスワードは4文字以上にしてください')}`)
  }
  if (next !== confirm) {
    redirect(`/account?err=${encodeURIComponent('新しいパスワード（確認）が一致しません')}`)
  }

  const user = await prisma.user.findUnique({ where: { id: session.user!.id! } })
  if (!user) redirect('/login')

  const valid = await bcrypt.compare(current, user!.password)
  if (!valid) {
    redirect(`/account?err=${encodeURIComponent('現在のパスワードが正しくありません')}`)
  }

  const hash = await bcrypt.hash(next, 10)
  await prisma.user.update({ where: { id: user!.id }, data: { password: hash } })
  revalidatePath('/account')
  redirect(`/account?toast=${encodeURIComponent('パスワードを変更しました')}`)
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>
}) {
  const session = await auth()
  if (!session?.user) {
    return (
      <div className="pt-16 max-w-md mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-black text-[#e2e8f0] mb-3">アカウント</h1>
        <p className="text-[#64748b] mb-6">ログインが必要です。</p>
        <Link href="/login" className="btn-primary">ログイン</Link>
      </div>
    )
  }
  const sp = await searchParams

  return (
    <div className="pt-16 max-w-md mx-auto px-4 py-12">
      <h1 className="text-2xl font-black text-[#e2e8f0] mb-2">アカウント</h1>
      <p className="text-sm text-[#64748b] mb-8">{session.user.name} さん</p>

      <div className="glass-card rounded-2xl p-6">
        <h2 className="text-sm font-bold text-[#60a5fa] mb-4">パスワードの変更</h2>
        {sp.err && (
          <p className="text-sm text-[#ef4444] mb-4">⚠ {sp.err}</p>
        )}
        <form action={changePassword} className="grid gap-4">
          <div>
            <label className="block text-xs text-[#64748b] mb-1.5">現在のパスワード</label>
            <input type="password" name="current" required autoComplete="current-password" className="w-full" />
          </div>
          <div>
            <label className="block text-xs text-[#64748b] mb-1.5">新しいパスワード（4文字以上）</label>
            <input type="password" name="next" required minLength={4} autoComplete="new-password" className="w-full" />
          </div>
          <div>
            <label className="block text-xs text-[#64748b] mb-1.5">新しいパスワード（確認）</label>
            <input type="password" name="confirm" required minLength={4} autoComplete="new-password" className="w-full" />
          </div>
          <SubmitButton pendingLabel="変更中…" className="btn-primary w-full py-2.5">パスワードを変更</SubmitButton>
        </form>
        <p className="text-[10px] text-[#475569] mt-4">
          ※ パスワードを忘れた場合は管理者に初期化（背番号×2）を依頼してください。
        </p>
      </div>
    </div>
  )
}
