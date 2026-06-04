import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
import Link from 'next/link'
import { PhotoUploader } from '@/components/PhotoUploader'
import { SubmitButton } from '@/components/SubmitButton'

async function createMember(formData: FormData) {
  'use server'
  const name    = String(formData.get('name'))
  const numberRaw = formData.get('number')
  const number  = numberRaw && String(numberRaw).trim() !== '' ? parseInt(String(numberRaw)) : null
  // ログインID: 背番号があればそのまま文字列、なければ名前からフォールバック
  const loginId = number != null ? String(number) : name.toLowerCase().replace(/\s+/g, '')
  const email   = `${loginId}@b`
  const password = await bcrypt.hash(`${loginId}${loginId}`, 10)

  await prisma.user.create({
    data: {
      name,
      email,
      password,
      role: String(formData.get('role')) as 'ADMIN' | 'PLAYER',
      number,
      position: String(formData.get('position') || '') || null,
      photoUrl: String(formData.get('photoUrl') || '') || null,
    },
  })
  revalidatePath('/members')
  revalidatePath('/admin')
  redirect(`/admin/members?toast=${encodeURIComponent('メンバーを追加しました')}`)
}

async function toggleRole(formData: FormData) {
  'use server'
  const id      = String(formData.get('id'))
  const current = String(formData.get('current'))
  const next    = current === 'ADMIN' ? 'PLAYER' : 'ADMIN'
  await prisma.user.update({ where: { id }, data: { role: next } })
  revalidatePath('/admin/members')
  redirect(`/admin/members?toast=${encodeURIComponent('権限を変更しました')}`)
}

async function updateMember(formData: FormData) {
  'use server'
  const id        = String(formData.get('id'))
  const numberRaw = formData.get('number')
  const number    = numberRaw && String(numberRaw).trim() !== '' ? parseInt(String(numberRaw)) : null
  const name      = String(formData.get('name'))

  // 背番号が変わった場合はログインID（email）とパスワードも更新
  const existing = await prisma.user.findUnique({ where: { id }, select: { number: true } })
  const numberChanged = number !== existing?.number

  const loginId  = number != null ? String(number) : name.toLowerCase().replace(/\s+/g, '')
  const newEmail = `${loginId}@b`
  const newPwHash = numberChanged ? await bcrypt.hash(`${loginId}${loginId}`, 10) : undefined

  await prisma.user.update({
    where: { id },
    data: {
      name,
      role:     String(formData.get('role')) as 'ADMIN' | 'PLAYER',
      number,
      position: String(formData.get('position') || '') || null,
      photoUrl: String(formData.get('photoUrl') || '') || null,
      ...(numberChanged ? { email: newEmail, password: newPwHash } : {}),
    },
  })
  revalidatePath('/members')
  revalidatePath(`/members/${id}`)
  revalidatePath('/stats')
  redirect(`/admin/members?toast=${encodeURIComponent('メンバーを更新しました')}`)
}

async function resetPassword(formData: FormData) {
  'use server'
  const id = String(formData.get('id'))
  const user = await prisma.user.findUnique({ where: { id }, select: { email: true } })
  if (!user) return
  const loginId = user.email.replace(/@b$/, '')
  const hash = await bcrypt.hash(`${loginId}${loginId}`, 10)
  await prisma.user.update({ where: { id }, data: { password: hash } })
  revalidatePath('/admin/members')
  redirect(`/admin/members?toast=${encodeURIComponent('パスワードをリセットしました')}`)
}

async function deleteMember(formData: FormData) {
  'use server'
  const id = String(formData.get('id'))
  await prisma.user.delete({ where: { id } })
  revalidatePath('/members')
  revalidatePath('/admin')
  redirect(`/admin/members?toast=${encodeURIComponent('メンバーを削除しました')}`)
}

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>
}) {
  const sp = await searchParams
  const editId = sp.edit

  const allUsers = await prisma.user.findMany({
    orderBy: [{ role: 'asc' }, { number: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, email: true, number: true, position: true, role: true, photoUrl: true, isGuest: true },
  })

  // 表示優先度: 現メンバー(@bログイン) → 元メンバー(取込・脱退) → 助っ人
  // 現メンバー = 正式ログインアカウント(email が @b)かつ助っ人でない
  const tier = (m: typeof allUsers[number]) =>
    m.isGuest ? 2 : (m.email.endsWith('@b') ? 0 : 1)
  const members = [...allUsers].sort((a, b) => tier(a) - tier(b))  // 同tier内は元の並び維持

  const editMember = editId ? members.find((m) => m.id === editId) : null

  return (
    <div className="pt-16 max-w-4xl mx-auto px-4 py-12">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin" className="text-[#64748b] hover:text-[#94a3b8]">← 管理</Link>
        <h1 className="text-2xl font-black text-[#e2e8f0]">メンバー管理</h1>
      </div>

      {/* Edit form */}
      {editMember ? (
        <div className="glass-card rounded-2xl p-6 mb-8 border border-[#2563eb]/30">
          <h2 className="text-sm font-bold text-[#60a5fa] mb-4">✏️ {editMember.name} を編集</h2>

          {/* 現在のログイン情報 */}
          {(() => {
            const loginId = editMember.email.replace(/@b$/, '')
            return (
              <div className="flex items-center justify-between mb-4 px-3 py-2 rounded-lg bg-[#0f172a] border border-[#1e3a5f] text-xs">
                <span className="text-[#64748b]">
                  現在のログイン: <span className="text-[#e2e8f0] font-mono">{loginId}</span>
                  　PW: <span className="text-[#e2e8f0] font-mono">{loginId}{loginId}</span>
                </span>
                <form action={resetPassword}>
                  <input type="hidden" name="id" value={editMember.id} />
                  <SubmitButton pendingLabel="リセット中…" className="text-[#fbbf24] hover:text-[#fbbf24]/80 ml-3"
                    confirm="パスワードを初期値にリセットしますか？">
                    PW リセット
                  </SubmitButton>
                </form>
              </div>
            )
          })()}

          <form action={updateMember} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={editMember.id} />
            <div>
              <label className="block text-xs text-[#64748b] mb-1.5">名前 *</label>
              <input type="text" name="name" required defaultValue={editMember.name} />
            </div>
            <div>
              <label className="block text-xs text-[#64748b] mb-1.5">権限</label>
              <select name="role" defaultValue={editMember.role}>
                <option value="PLAYER">選手</option>
                <option value="ADMIN">管理者</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#64748b] mb-1.5">背番号 <span className="text-[#475569]">（変更でログインIDも更新）</span></label>
              <input type="number" name="number" defaultValue={editMember.number ?? ''} placeholder="例: 7" min="0" max="99" />
            </div>
            <div>
              <label className="block text-xs text-[#64748b] mb-1.5">ポジション</label>
              <input type="text" name="position" defaultValue={editMember.position ?? ''} placeholder="例: ショート" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-[#64748b] mb-1.5">写真</label>
              <PhotoUploader defaultUrl={editMember.photoUrl ?? ''} />
            </div>
            <div className="sm:col-span-2 flex gap-3">
              <SubmitButton pendingLabel="保存中…" className="btn-primary flex-1 py-2.5">保存する</SubmitButton>
              <Link href="/admin/members" className="btn-secondary flex-1 py-2.5 text-center">キャンセル</Link>
            </div>
          </form>
        </div>
      ) : (
        /* Add form */
        <div className="glass-card rounded-2xl p-6 mb-8">
          <h2 className="text-sm font-bold text-[#94a3b8] mb-1">メンバーを追加</h2>
          <p className="text-[11px] text-[#475569] mb-4">ログインID＝背番号、パスワード＝背番号×2（例: 28 / 2828）で自動設定されます。</p>
          <form action={createMember} className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-[#64748b] mb-1.5">名前 *</label>
              <input type="text" name="name" required placeholder="山田 太郎" />
            </div>
            <div>
              <label className="block text-xs text-[#64748b] mb-1.5">背番号</label>
              <input type="number" name="number" placeholder="例: 7" min="0" max="99" />
            </div>
            <div>
              <label className="block text-xs text-[#64748b] mb-1.5">ポジション</label>
              <input type="text" name="position" placeholder="例: ショート" />
            </div>
            <div>
              <label className="block text-xs text-[#64748b] mb-1.5">権限</label>
              <select name="role">
                <option value="PLAYER">選手</option>
                <option value="ADMIN">管理者</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-[#64748b] mb-1.5">写真</label>
              <PhotoUploader />
            </div>
            <div className="sm:col-span-2">
              <SubmitButton pendingLabel="追加中…" className="btn-primary w-full py-2.5">追加する</SubmitButton>
            </div>
          </form>
        </div>
      )}

      {/* Member list */}
      <h2 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase mb-4">
        登録メンバー ({members.length}名)
      </h2>
      <div className="flex flex-col gap-2">
        {members.map((m) => (
          <div
            key={m.id}
            className={`glass-card rounded-xl px-4 py-3 flex items-center justify-between gap-3 ${
              m.id === editId ? 'border border-[#2563eb]/40' : ''
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 bg-[#1e3a5f] flex items-center justify-center">
                {m.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.photoUrl} alt={m.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs font-bold text-[#60a5fa]">
                    {m.number != null ? `#${m.number}` : m.name[0]}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="font-medium text-[#e2e8f0] flex items-center gap-2">
                  {m.name}
                  {m.role === 'ADMIN' && <span className="text-xs text-[#fbbf24]">管理者</span>}
                  {m.isGuest && <span className="text-[10px] text-[#a78bfa] border border-[#a78bfa]/40 rounded px-1">助っ人</span>}
                  {!m.isGuest && !m.email.endsWith('@b') && <span className="text-[10px] text-[#64748b] border border-[#334155] rounded px-1">元メンバー</span>}
                </div>
                <div className="text-xs text-[#64748b] truncate">{m.email}</div>
              </div>
              {m.position && (
                <span className="text-xs text-[#94a3b8] hidden sm:block">{m.position}</span>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {/* 管理者トグル */}
              <form action={toggleRole}>
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="current" value={m.role} />
                <button
                  type="submit"
                  title={m.role === 'ADMIN' ? '選手に戻す' : '管理者にする'}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                    m.role === 'ADMIN'
                      ? 'border-[#fbbf24]/40 text-[#fbbf24] hover:bg-[#fbbf24]/10'
                      : 'border-[#475569] text-[#475569] hover:border-[#fbbf24]/40 hover:text-[#fbbf24]'
                  }`}
                >
                  {m.role === 'ADMIN' ? '★管理者' : '☆選手'}
                </button>
              </form>
              <Link
                href={`/admin/members?edit=${m.id}`}
                className="text-xs text-[#60a5fa]/70 hover:text-[#60a5fa] transition-colors"
              >
                編集
              </Link>
              <form action={deleteMember}>
                <input type="hidden" name="id" value={m.id} />
                <SubmitButton
                  pendingLabel="削除中…"
                  confirm={`${m.name} を削除しますか？`}
                  className="text-xs text-[#ef4444]/50 hover:text-[#ef4444] transition-colors"
                >
                  削除
                </SubmitButton>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
