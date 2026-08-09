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
  const isGuest = String(formData.get('category')) === 'guest'

  if (isGuest) {
    // 助っ人: ログイン不要。@b でない一意メールで作成（成績/メンバー一覧からは除外される）
    const email = `guest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@guest`
    const password = await bcrypt.hash(Math.random().toString(36), 10)
    await prisma.user.create({
      data: {
        name, email, password,
        role: 'PLAYER',
        number,
        position: String(formData.get('position') || '') || null,
        isGuest: true,
      },
    })
    revalidatePath('/members'); revalidatePath('/admin')
    redirect(`/admin/members?toast=${encodeURIComponent('助っ人を追加しました')}`)
  }

  // 背番号重複チェック（現メンバーのみ対象）
  if (number != null) {
    const conflict = await prisma.user.findFirst({
      where: { number, email: { endsWith: '@b' }, isGuest: false },
      select: { name: true },
    })
    if (conflict) {
      redirect(`/admin/members?numberConflict=${encodeURIComponent(`#${number} はすでに「${conflict.name}」が使用中です。別の背番号を指定してください。`)}`)
    }
  }

  // 現メンバー: ログインID = 背番号（なければ名前）、初期PW = ログインID×2
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
  // ただし退団中（@retired）のメンバーはメールサフィックスを維持する
  const existing = await prisma.user.findUnique({ where: { id }, select: { number: true, email: true } })
  const numberChanged = number !== existing?.number
  const isRetired = existing?.email.endsWith('@retired') ?? false

  // 背番号変更時の重複チェック（現メンバーのみ・自分自身は除く）
  if (numberChanged && number != null && !isRetired) {
    const conflict = await prisma.user.findFirst({
      where: { number, email: { endsWith: '@b' }, isGuest: false, NOT: { id } },
      select: { name: true },
    })
    if (conflict) {
      redirect(`/admin/members?edit=${id}&numberConflict=${encodeURIComponent(`#${number} はすでに「${conflict.name}」が使用中です。別の背番号を指定してください。`)}`)
    }
  }

  const loginId   = number != null ? String(number) : name.toLowerCase().replace(/\s+/g, '')
  const suffix    = isRetired ? '@retired' : '@b'
  const newEmail  = `${loginId}${suffix}`
  const newPwHash = numberChanged && !isRetired ? await bcrypt.hash(`${loginId}${loginId}`, 10) : undefined

  await prisma.user.update({
    where: { id },
    data: {
      name,
      role:     String(formData.get('role')) as 'ADMIN' | 'PLAYER',
      number,
      position: String(formData.get('position') || '') || null,
      photoUrl: String(formData.get('photoUrl') || '') || null,
      ...(numberChanged ? { email: newEmail, ...(newPwHash ? { password: newPwHash } : {}) } : {}),
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

async function promoteMember(formData: FormData) {
  'use server'
  const id        = String(formData.get('id'))
  const numberRaw = formData.get('number')
  const number    = numberRaw && String(numberRaw).trim() !== '' ? parseInt(String(numberRaw)) : null

  const user = await prisma.user.findUnique({ where: { id }, select: { email: true, isGuest: true } })
  if (!user || !user.isGuest) return

  // 背番号重複チェック
  if (number != null) {
    const conflict = await prisma.user.findFirst({
      where: { number, email: { endsWith: '@b' }, isGuest: false },
      select: { name: true },
    })
    if (conflict) {
      redirect(`/admin/members?promote=${id}&numberConflict=${encodeURIComponent(`#${number} はすでに「${conflict.name}」が使用中です。別の背番号を指定してください。`)}`)
    }
  }

  const loginId = number != null ? String(number) : id.slice(-6)
  const email   = `${loginId}@b`
  const password = await bcrypt.hash(`${loginId}${loginId}`, 10)

  await prisma.user.update({
    where: { id },
    data: { isGuest: false, email, password, number },
  })
  revalidatePath('/members')
  revalidatePath('/stats')
  revalidatePath('/admin/members')
  revalidatePath('/admin/lineup')
  revalidatePath('/admin/game')
  redirect(`/admin/members?toast=${encodeURIComponent('メンバーに昇格しました（成績データはそのまま引き継がれます）')}`)
}

async function retireMember(formData: FormData) {
  'use server'
  const id = String(formData.get('id'))
  const user = await prisma.user.findUnique({ where: { id }, select: { email: true } })
  if (!user || !user.email.endsWith('@b')) return
  const loginId = user.email.replace(/@b$/, '')
  await prisma.user.update({
    where: { id },
    data: { email: `${loginId}@retired` },
  })
  revalidatePath('/members')
  revalidatePath('/stats')
  revalidatePath('/admin/members')
  redirect(`/admin/members?toast=${encodeURIComponent('退団処理しました（元メンバーに移動）')}`)
}

async function rejoinMember(formData: FormData) {
  'use server'
  const id        = String(formData.get('id'))
  const numberRaw = formData.get('number')
  const newNumber = numberRaw && String(numberRaw).trim() !== '' ? parseInt(String(numberRaw)) : null

  const user = await prisma.user.findUnique({ where: { id }, select: { email: true, number: true } })
  if (!user || !user.email.endsWith('@retired')) return

  const number  = newNumber ?? user.number

  // 背番号重複チェック（現メンバーと被っていないか）
  if (number != null) {
    const conflict = await prisma.user.findFirst({
      where: { number, email: { endsWith: '@b' }, isGuest: false },
      select: { name: true },
    })
    if (conflict) {
      redirect(`/admin/members?rejoin=${id}&toast=${encodeURIComponent(`⚠ 背番号 #${number} は ${conflict.name} が使用中です。別の番号を入力してください。`)}`)
    }
  }

  const loginId = number != null ? String(number) : user.email.replace(/@retired$/, '')
  const newHash = number !== user.number
    ? await bcrypt.hash(`${loginId}${loginId}`, 10)
    : undefined

  await prisma.user.update({
    where: { id },
    data: {
      email:    `${loginId}@b`,
      number,
      ...(newHash ? { password: newHash } : {}),
    },
  })
  revalidatePath('/members')
  revalidatePath('/stats')
  revalidatePath('/admin/members')
  revalidatePath('/admin/lineup')
  revalidatePath('/admin/game')
  redirect(`/admin/members?toast=${encodeURIComponent('復帰処理しました（現メンバーに移動）')}`)
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
  searchParams: Promise<{ edit?: string; rejoin?: string; promote?: string; numberConflict?: string }>
}) {
  const sp = await searchParams
  const editId         = sp.edit
  const rejoinId       = sp.rejoin
  const promoteId      = sp.promote
  const numberConflict = sp.numberConflict

  const allUsers = await prisma.user.findMany({
    orderBy: [{ role: 'asc' }, { number: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, email: true, number: true, position: true, role: true, photoUrl: true, isGuest: true },
  })

  // 表示優先度: 現メンバー(@bログイン) → 元メンバー(取込・脱退) → 助っ人
  // 現メンバー = 正式ログインアカウント(email が @b)かつ助っ人でない
  const tier = (m: typeof allUsers[number]) =>
    m.isGuest ? 2 : (m.email.endsWith('@b') ? 0 : 1)
  const members = [...allUsers].sort((a, b) => tier(a) - tier(b))  // 同tier内は元の並び維持

  const editMember       = editId    ? members.find((m) => m.id === editId)    : null
  const rejoinMemberData = rejoinId  ? members.find((m) => m.id === rejoinId)  : null
  const promoteMemberData = promoteId ? members.find((m) => m.id === promoteId) : null

  // 現メンバーの背番号セット（重複チェック用）
  const currentNumbers = new Set(
    members.filter(m => !m.isGuest && m.email.endsWith('@b')).map(m => m.number).filter(n => n != null)
  )
  const rejoinConflict = rejoinMemberData?.number != null && currentNumbers.has(rejoinMemberData.number)
    ? members.find(m => m.email.endsWith('@b') && m.number === rejoinMemberData.number)
    : null
  const promoteConflict = promoteMemberData?.number != null && currentNumbers.has(promoteMemberData.number)
    ? members.find(m => m.email.endsWith('@b') && m.number === promoteMemberData.number)
    : null

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin" className="text-[#64748b] hover:text-[#94a3b8]">← 管理</Link>
        <h1 className="text-2xl font-black text-[#e2e8f0]">メンバー管理</h1>
      </div>

      {/* 背番号重複警告 */}
      {numberConflict && (
        <div className="mb-6 p-4 rounded-xl bg-[#f59e0b]/10 border border-[#f59e0b]/40 text-sm text-[#fbbf24] flex items-start gap-2">
          <span className="shrink-0 text-base">⚠</span>
          <span>{numberConflict}</span>
        </div>
      )}

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
              <input type="number" name="number" defaultValue={editMember.number ?? ''} placeholder="例: 7" min="0" max="999" />
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
          <h2 className="text-sm font-bold text-[#94a3b8] mb-1">メンバー / 助っ人を追加</h2>
          <p className="text-[11px] text-[#475569] mb-4">
            現メンバーはログインID＝背番号、パスワード＝背番号×2（例: 28 / 2828）で自動設定。<br />
            助っ人はログイン不可で、メンバー一覧・個人成績ランキングには出ません（試合結果には表示）。
          </p>
          <form action={createMember} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-xs text-[#64748b] mb-1.5">種別 *</label>
              <select name="category">
                <option value="member">現メンバー</option>
                <option value="guest">助っ人</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#64748b] mb-1.5">名前 *</label>
              <input type="text" name="name" required placeholder="山田 太郎" />
            </div>
            <div>
              <label className="block text-xs text-[#64748b] mb-1.5">背番号 <span className="text-[#475569]">（助っ人は任意）</span></label>
              <input type="number" name="number" placeholder="例: 7" min="0" max="999" />
            </div>
            <div>
              <label className="block text-xs text-[#64748b] mb-1.5">ポジション</label>
              <input type="text" name="position" placeholder="例: ショート" />
            </div>
            <div>
              <label className="block text-xs text-[#64748b] mb-1.5">権限 <span className="text-[#475569]">（現メンバーのみ）</span></label>
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

      {/* 復帰確認パネル */}
      {rejoinMemberData && rejoinMemberData.email.endsWith('@retired') && (
        <div className={`glass-card rounded-2xl p-6 mb-8 border ${rejoinConflict ? 'border-[#f59e0b]/50' : 'border-[#22c55e]/30'}`}>
          <h2 className="text-sm font-bold text-[#22c55e] mb-1">🔄 {rejoinMemberData.name} を現メンバーに復帰</h2>

          {rejoinConflict && (
            <div className="mb-4 p-3 rounded-lg bg-[#f59e0b]/10 border border-[#f59e0b]/30 text-sm text-[#fbbf24]">
              ⚠ 背番号 #{rejoinMemberData.number} は現在 <span className="font-bold">{rejoinConflict.name}</span> が使用中です。
              別の背番号を指定して復帰してください。
            </div>
          )}

          <form action={rejoinMember} className="flex flex-wrap items-end gap-3 mt-3">
            <input type="hidden" name="id" value={rejoinMemberData.id} />
            <div>
              <label className="block text-xs text-[#64748b] mb-1.5">
                背番号{rejoinConflict ? <span className="text-[#f59e0b] ml-1">（変更必須）</span> : <span className="text-[#475569] ml-1">（変更する場合のみ入力）</span>}
              </label>
              <input
                type="number"
                name="number"
                min="0" max="999"
                defaultValue={rejoinMemberData.number ?? ''}
                className={rejoinConflict ? 'border-[#f59e0b]/50' : ''}
                placeholder="背番号"
                style={{ width: '100px' }}
              />
            </div>
            <div className="flex gap-2">
              <SubmitButton pendingLabel="処理中…" className="btn-primary py-2 px-4 text-sm">
                復帰する
              </SubmitButton>
              <Link href="/admin/members" className="py-2 px-4 text-sm rounded-lg border border-[#1e3a5f] text-[#64748b] hover:text-[#94a3b8] transition-colors">
                キャンセル
              </Link>
            </div>
          </form>
        </div>
      )}

      {/* 助っ人昇格確認パネル */}
      {promoteMemberData && promoteMemberData.isGuest && (
        <div className={`glass-card rounded-2xl p-6 mb-8 border ${promoteConflict ? 'border-[#f59e0b]/50' : 'border-[#22c55e]/30'}`}>
          <h2 className="text-sm font-bold text-[#22c55e] mb-1">➕ {promoteMemberData.name} をメンバーに追加</h2>
          <p className="text-xs text-[#64748b] mb-3">成績データはそのまま引き継がれます。ログインIDと初期パスワードは背番号×2になります。</p>

          {promoteConflict && (
            <div className="mb-4 p-3 rounded-lg bg-[#f59e0b]/10 border border-[#f59e0b]/30 text-sm text-[#fbbf24]">
              ⚠ 背番号 #{promoteMemberData.number} は現在 <span className="font-bold">{promoteConflict.name}</span> が使用中です。
              別の背番号を指定してください。
            </div>
          )}

          <form action={promoteMember} className="flex flex-wrap items-end gap-3 mt-3">
            <input type="hidden" name="id" value={promoteMemberData.id} />
            <div>
              <label className="block text-xs text-[#64748b] mb-1.5">
                背番号{promoteConflict ? <span className="text-[#f59e0b] ml-1">（変更必須）</span> : ''}
              </label>
              <input
                type="number" name="number" min="0" max="999"
                defaultValue={promoteMemberData.number ?? ''}
                className={promoteConflict ? 'border-[#f59e0b]/50' : ''}
                placeholder="例: 7"
                style={{ width: '100px' }}
              />
            </div>
            <div className="flex gap-2">
              <SubmitButton pendingLabel="処理中…" className="btn-primary py-2 px-4 text-sm">
                メンバーに追加する
              </SubmitButton>
              <Link href="/admin/members" className="py-2 px-4 text-sm rounded-lg border border-[#1e3a5f] text-[#64748b] hover:text-[#94a3b8] transition-colors">
                キャンセル
              </Link>
            </div>
          </form>
        </div>
      )}

      {/* Member list */}
      {[
        { label: '現メンバー', color: 'text-[#60a5fa]', filter: (m: typeof members[number]) => !m.isGuest && m.email.endsWith('@b') },
        { label: '元メンバー', color: 'text-[#8b5cf6]', filter: (m: typeof members[number]) => !m.isGuest && !m.email.endsWith('@b') },
        { label: '助っ人',     color: 'text-[#94a3b8]', filter: (m: typeof members[number]) => m.isGuest },
      ].map(({ label, color, filter }) => {
        const group = members.filter(filter)
        if (group.length === 0) return null
        return (
          <div key={label} className="mb-6">
            <h2 className={`text-xs font-bold tracking-[0.3em] ${color} uppercase mb-3`}>
              {label} ({group.length}名)
            </h2>
            <div className="flex flex-col gap-2">
              {group.map((m) => (
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
                <div className="font-medium text-[#e2e8f0] flex items-center gap-2 flex-wrap">
                  {m.number != null && (
                    <span className="text-xs font-bold text-[#60a5fa] bg-[#1e3a5f] px-1.5 py-0.5 rounded shrink-0">#{m.number}</span>
                  )}
                  {m.name}
                  {m.role === 'ADMIN' && <span className="text-xs text-[#fbbf24]">管理者</span>}
                  {m.isGuest && <span className="text-[10px] text-[#a78bfa] border border-[#a78bfa]/40 rounded px-1">助っ人</span>}
                  {!m.isGuest && !m.email.endsWith('@b') && <span className="text-[10px] text-[#64748b] border border-[#334155] rounded px-1">元メンバー</span>}
                </div>
                <div className="text-xs text-[#475569] truncate">{m.position || m.email}</div>
              </div>
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
              {/* 退団 / 復帰 */}
              {m.email.endsWith('@b') && (
                <form action={retireMember}>
                  <input type="hidden" name="id" value={m.id} />
                  <SubmitButton
                    pendingLabel="処理中…"
                    confirm={`${m.name} を退団処理しますか？\nログインできなくなりますが、成績データは元メンバーとして保持されます。`}
                    className="text-xs text-[#f59e0b]/60 hover:text-[#f59e0b] transition-colors"
                  >
                    退団
                  </SubmitButton>
                </form>
              )}
              {m.isGuest && (
                <Link
                  href={`/admin/members?promote=${m.id}`}
                  title="メンバーに追加します（成績データはそのまま引き継がれます）"
                  className="text-xs text-[#22c55e]/60 hover:text-[#22c55e] transition-colors"
                >
                  メンバーに追加
                </Link>
              )}
              {m.email.endsWith('@retired') && (
                <Link
                  href={`/admin/members?rejoin=${m.id}`}
                  className="text-xs text-[#22c55e]/60 hover:text-[#22c55e] transition-colors"
                >
                  復帰
                </Link>
              )}
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
      })}
    </div>
  )
}
