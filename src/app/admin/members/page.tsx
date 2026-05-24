import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
import Link from 'next/link'

async function createMember(formData: FormData) {
  'use server'
  const password = await bcrypt.hash(String(formData.get('password')), 10)
  await prisma.user.create({
    data: {
      name: String(formData.get('name')),
      email: String(formData.get('email')),
      password,
      role: String(formData.get('role')) as 'ADMIN' | 'PLAYER',
      number: parseInt(String(formData.get('number') || '')) || null,
      position: String(formData.get('position') || ''),
    },
  })
  revalidatePath('/members')
  revalidatePath('/admin')
  redirect('/admin/members')
}

async function deleteMember(formData: FormData) {
  'use server'
  const id = String(formData.get('id'))
  await prisma.user.delete({ where: { id } })
  revalidatePath('/members')
  revalidatePath('/admin')
}

export default async function AdminMembersPage() {
  const members = await prisma.user.findMany({
    orderBy: [{ role: 'asc' }, { number: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, email: true, number: true, position: true, role: true },
  })

  return (
    <div className="pt-16 max-w-4xl mx-auto px-4 py-12">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin" className="text-[#64748b] hover:text-[#94a3b8]">← 管理</Link>
        <h1 className="text-2xl font-black text-[#e2e8f0]">メンバー管理</h1>
      </div>

      {/* Add form */}
      <div className="glass-card rounded-2xl p-6 mb-8">
        <h2 className="text-sm font-bold text-[#94a3b8] mb-4">メンバーを追加</h2>
        <form action={createMember} className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-[#64748b] mb-1.5">名前 *</label>
            <input type="text" name="name" required placeholder="山田 太郎" />
          </div>
          <div>
            <label className="block text-xs text-[#64748b] mb-1.5">メールアドレス *</label>
            <input type="email" name="email" required placeholder="yamada@example.com" />
          </div>
          <div>
            <label className="block text-xs text-[#64748b] mb-1.5">パスワード *</label>
            <input type="password" name="password" required placeholder="8文字以上" minLength={6} />
          </div>
          <div>
            <label className="block text-xs text-[#64748b] mb-1.5">権限</label>
            <select name="role">
              <option value="PLAYER">選手</option>
              <option value="ADMIN">管理者</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#64748b] mb-1.5">背番号</label>
            <input type="number" name="number" placeholder="例: 7" min="0" max="99" />
          </div>
          <div>
            <label className="block text-xs text-[#64748b] mb-1.5">ポジション</label>
            <input type="text" name="position" placeholder="例: ショート" />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary w-full py-2.5">追加する</button>
          </div>
        </form>
      </div>

      {/* Member list */}
      <h2 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase mb-4">
        登録メンバー ({members.length}名)
      </h2>
      <div className="flex flex-col gap-2">
        {members.map((m) => (
          <div key={m.id} className="glass-card rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {m.number != null && (
                <span className="text-sm font-bold text-[#60a5fa] w-8 shrink-0">#{m.number}</span>
              )}
              <div className="min-w-0">
                <div className="font-medium text-[#e2e8f0] flex items-center gap-2">
                  {m.name}
                  {m.role === 'ADMIN' && <span className="text-xs text-[#fbbf24]">管理者</span>}
                </div>
                <div className="text-xs text-[#64748b] truncate">{m.email}</div>
              </div>
              {m.position && (
                <span className="text-xs text-[#94a3b8] hidden sm:block">{m.position}</span>
              )}
            </div>
            <form action={deleteMember}>
              <input type="hidden" name="id" value={m.id} />
              <button
                type="submit"
                className="text-xs text-[#ef4444]/50 hover:text-[#ef4444] transition-colors shrink-0"
              >
                削除
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  )
}
