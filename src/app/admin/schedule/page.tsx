import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { getMasterList, getGameTypeLabels } from '@/lib/settings'

export const dynamic = 'force-dynamic'

// ─── 新規追加 ──────────────────────────────────────────────────────
async function createSchedule(formData: FormData) {
  'use server'
  const date     = String(formData.get('date'))
  const dateTime = new Date(`${date}T00:00:00`)
  const meetTime  = String(formData.get('meetTime')  || '').trim()
  const startTime = String(formData.get('startTime') || '').trim()
  const typeRaw   = String(formData.get('type') || 'PRACTICE')
  const type = (['REGULAR', 'PRACTICE', 'TOURNAMENT', 'EVENT'].includes(typeRaw) ? typeRaw : 'REGULAR') as 'REGULAR' | 'PRACTICE' | 'TOURNAMENT' | 'EVENT'

  const opponentSelect = String(formData.get('opponentSelect') || '').trim()
  const opponentCustom = String(formData.get('opponentCustom') || '').trim()
  const opponent = (opponentSelect === '__custom__' ? opponentCustom : opponentSelect) || opponentCustom

  const locationSelect = String(formData.get('locationSelect') || '').trim()
  const locationCustom = String(formData.get('locationCustom') || '').trim()
  const location = (locationSelect === '__custom__' ? locationCustom : locationSelect) || locationCustom

  if (!opponent || !location) return

  await prisma.schedule.create({
    data: {
      date: dateTime, opponent, location, type,
      meetTime:  meetTime  || null,
      startTime: startTime || null,
      note:      String(formData.get('note') || '') || null,
    },
  })
  revalidatePath('/schedule')
  revalidatePath('/admin')
  redirect('/admin')
}

// ─── 編集・更新 ──────────────────────────────────────────────────────
async function updateSchedule(formData: FormData) {
  'use server'
  const id       = String(formData.get('id'))
  const date     = String(formData.get('date'))
  const dateTime = new Date(`${date}T00:00:00`)
  const meetTime  = String(formData.get('meetTime')  || '').trim()
  const startTime = String(formData.get('startTime') || '').trim()
  const typeRaw   = String(formData.get('type') || 'PRACTICE')
  const type = (['REGULAR', 'PRACTICE', 'TOURNAMENT', 'EVENT'].includes(typeRaw) ? typeRaw : 'REGULAR') as 'REGULAR' | 'PRACTICE' | 'TOURNAMENT' | 'EVENT'
  const opponent = String(formData.get('opponent') || '').trim()
  const location = String(formData.get('location') || '').trim()
  if (!opponent || !location) return

  await prisma.schedule.update({
    where: { id },
    data: {
      date: dateTime, opponent, location, type,
      meetTime:  meetTime  || null,
      startTime: startTime || null,
      note:      String(formData.get('note') || '') || null,
    },
  })
  revalidatePath('/schedule')
  revalidatePath('/admin')
  redirect('/admin/schedule')
}

// ─── 削除 ────────────────────────────────────────────────────────────
async function deleteSchedule(formData: FormData) {
  'use server'
  const id = String(formData.get('id'))
  await prisma.schedule.delete({ where: { id } })
  revalidatePath('/schedule')
  revalidatePath('/admin')
}

function toDateInput(d: Date) {
  const y  = d.getFullYear()
  const m  = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export default async function AdminSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>
}) {
  const sp = await searchParams

  const [schedules, opponents, locations, gameTypeLabels] = await Promise.all([
    prisma.schedule.findMany({
      orderBy: { date: 'desc' },
      take: 50,
      include: { game: { select: { id: true } } },
    }),
    getMasterList('opponentMaster'),
    getMasterList('locationMaster'),
    getGameTypeLabels(),
  ])

  const editId = sp.edit
  const editSchedule = editId
    ? (schedules.find(s => s.id === editId) ??
       await prisma.schedule.findUnique({ where: { id: editId }, include: { game: { select: { id: true } } } }))
    : null

  const TYPES = ['REGULAR', 'PRACTICE', 'TOURNAMENT', 'EVENT'] as const

  return (
    <div className="pt-16 max-w-4xl mx-auto px-4 py-12">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin" className="text-[#64748b] hover:text-[#94a3b8]">← 管理</Link>
        <h1 className="text-2xl font-black text-[#e2e8f0]">
          {editSchedule ? '日程を編集' : '日程を追加'}
        </h1>
        {editSchedule && (
          <Link href="/admin/schedule" className="text-xs text-[#64748b] hover:text-[#94a3b8] ml-auto">
            ＋ 新規追加に戻る
          </Link>
        )}
      </div>

      {/* ── 編集フォーム ── */}
      {editSchedule ? (
        <div className="glass-card rounded-2xl p-6 mb-8 border border-[#f59e0b]/30">
          <p className="text-xs text-[#f59e0b] mb-4">
            編集中: {new Date(editSchedule.date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
            　vs {editSchedule.opponent}
          </p>
          <form action={updateSchedule} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={editSchedule.id} />
            <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">日付 *</label>
                <input type="date" name="date" required defaultValue={toDateInput(new Date(editSchedule.date))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">試合種別 *</label>
                <select name="type" defaultValue={editSchedule.type}>
                  {TYPES.map(t => <option key={t} value={t}>{gameTypeLabels[t] ?? t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">対戦相手 *</label>
              <input type="text" name="opponent" required defaultValue={editSchedule.opponent} placeholder="チーム名" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">場所 *</label>
              <input type="text" name="location" required defaultValue={editSchedule.location} placeholder="球場名" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">集合時間</label>
              <input type="time" name="meetTime" defaultValue={editSchedule.meetTime ?? ''} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">試合開始</label>
              <input type="time" name="startTime" defaultValue={editSchedule.startTime ?? ''} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">メモ・備考</label>
              <input type="text" name="note" defaultValue={editSchedule.note ?? ''} placeholder="備考・注意事項など" />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn-primary w-full py-2.5">更新する</button>
            </div>
          </form>
        </div>
      ) : (
        /* ── 新規追加フォーム ── */
        <div className="glass-card rounded-2xl p-6 mb-8">
          <form action={createSchedule} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">日付 *</label>
                <input type="date" name="date" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">試合種別 *</label>
                <select name="type">
                  {TYPES.map(t => <option key={t} value={t}>{gameTypeLabels[t] ?? t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">対戦相手 *</label>
              {opponents.length > 0 ? (
                <>
                  <select name="opponentSelect" className="mb-2">
                    <option value="">── 選択してください ──</option>
                    {opponents.map(o => <option key={o} value={o}>{o}</option>)}
                    <option value="__custom__">その他（直接入力）...</option>
                  </select>
                  <input type="text" name="opponentCustom" placeholder="マスタにない場合は直接入力" className="text-sm" />
                  <p className="text-[10px] text-[#475569] mt-1">
                    新しいチームを追加するには<Link href="/admin/masters" className="text-[#60a5fa] ml-1 hover:underline">マスタ管理</Link>へ
                  </p>
                </>
              ) : (
                <>
                  <input type="text" name="opponentCustom" required placeholder="チーム名" />
                  <p className="text-[10px] text-[#fbbf24] mt-1">
                    ⚠ マスタが空です。<Link href="/admin/masters" className="text-[#60a5fa] ml-1 hover:underline">マスタ管理</Link>で登録するとプルダウンで選べます。
                  </p>
                </>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">場所 *</label>
              {locations.length > 0 ? (
                <>
                  <select name="locationSelect" className="mb-2">
                    <option value="">── 選択してください ──</option>
                    {locations.map(l => <option key={l} value={l}>{l}</option>)}
                    <option value="__custom__">その他（直接入力）...</option>
                  </select>
                  <input type="text" name="locationCustom" placeholder="マスタにない場合は直接入力" className="text-sm" />
                  <p className="text-[10px] text-[#475569] mt-1">
                    新しい球場を追加するには<Link href="/admin/masters" className="text-[#60a5fa] ml-1 hover:underline">マスタ管理</Link>へ
                  </p>
                </>
              ) : (
                <>
                  <input type="text" name="locationCustom" required placeholder="球場名" />
                  <p className="text-[10px] text-[#fbbf24] mt-1">
                    ⚠ マスタが空です。<Link href="/admin/masters" className="text-[#60a5fa] ml-1 hover:underline">マスタ管理</Link>で登録するとプルダウンで選べます。
                  </p>
                </>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">集合時間</label>
              <input type="time" name="meetTime" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">試合開始</label>
              <input type="time" name="startTime" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">メモ・備考</label>
              <input type="text" name="note" placeholder="備考・注意事項・集合場所など" />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn-primary w-full py-2.5">追加する</button>
            </div>
          </form>
        </div>
      )}

      {/* ── 登録済み日程一覧 ── */}
      <h2 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase mb-4">
        登録済み日程（直近50件）
      </h2>
      <div className="flex flex-col gap-2">
        {schedules.map((s) => (
          <div key={s.id}
            className={`glass-card rounded-xl px-4 py-3 flex items-center justify-between gap-3 ${
              s.id === editId ? 'border border-[#f59e0b]/40' : ''
            }`}>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium text-[#e2e8f0]">vs {s.opponent}</span>
              <span className="text-xs text-[#64748b] ml-3">
                {new Date(s.date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })}
              </span>
              <span className="text-xs text-[#475569] ml-2">📍 {s.location}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={`text-xs ${
                s.type === 'REGULAR'    ? 'text-[#60a5fa]' :
                s.type === 'TOURNAMENT' ? 'text-[#fbbf24]' :
                s.type === 'EVENT'      ? 'text-[#a78bfa]' : 'text-[#94a3b8]'
              }`}>
                {gameTypeLabels[s.type] ?? s.type}
              </span>
              {s.game && <span className="text-xs text-[#22c55e]">✓ 結果入力済</span>}
              <Link
                href={`/admin/schedule?edit=${s.id}`}
                className="text-xs text-[#60a5fa]/70 hover:text-[#60a5fa] transition-colors"
              >
                編集
              </Link>
              {!s.game && (
                <form action={deleteSchedule}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className="text-xs text-[#ef4444]/60 hover:text-[#ef4444] transition-colors">
                    削除
                  </button>
                </form>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
