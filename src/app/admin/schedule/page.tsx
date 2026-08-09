import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { getMasterList, getGameTypeLabels } from '@/lib/settings'
import { ScheduleCreateForm } from '@/components/ScheduleCreateForm'
import { SubmitButton } from '@/components/SubmitButton'

// ─── 新規追加 ──────────────────────────────────────────────────────
type CreateResult = { ok: boolean; error?: string } | null
async function createSchedule(_prev: CreateResult, formData: FormData): Promise<CreateResult> {
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

  // イベントの場合は対戦相手なしでも可
  if (!location) return { ok: false, error: '場所を入力してください' }
  if (!opponent && type !== 'EVENT') return { ok: false, error: '対戦相手を選択してください' }

  // 同一日に既存の日程があれば新規追加をブロック → 既存日程の「＋試合追加」へ誘導
  const dayStart = new Date(`${date}T00:00:00`)
  const dayEnd   = new Date(`${date}T23:59:59`)
  const sameDay = await prisma.schedule.findFirst({ where: { date: { gte: dayStart, lte: dayEnd } } })
  if (sameDay) {
    return { ok: false, error: 'この日には既に日程があります。下の登録済み日程の「＋試合追加」から追加してください。' }
  }

  await prisma.schedule.create({
    data: {
      date: dateTime,
      opponent: opponent || '',   // イベントで未入力なら空
      location, type,
      meetTime:  meetTime  || null,
      startTime: startTime || null,
      note:      String(formData.get('note') || '') || null,
    },
  })
  revalidatePath('/schedule')
  revalidatePath('/admin')
  return { ok: true }
}

// ─── 同日に試合を追加 ──────────────────────────────────────────────
async function addGameToDay(formData: FormData) {
  'use server'
  const existingId = String(formData.get('existingId'))
  const opponentSelect = String(formData.get('opponentSelect') || '').trim()
  const opponentCustom = String(formData.get('opponentCustom') || '').trim()
  const opponent = (opponentSelect === '__custom__' ? opponentCustom : opponentSelect) || opponentCustom
  const locationSelect = String(formData.get('locationSelect') || '').trim()
  const locationCustom = String(formData.get('locationCustom') || '').trim()
  const location = (locationSelect === '__custom__' ? locationCustom : locationSelect) || locationCustom
  const startTime = String(formData.get('startTime') || '').trim()

  if (!opponent || !location) return

  const existing = await prisma.schedule.findUnique({ where: { id: existingId } })
  if (!existing) return

  // dayGroupId: use existing one or create new
  let groupId = existing.dayGroupId
  if (!groupId) {
    // Generate a new group ID
    groupId = existingId  // use the primary schedule's ID as group key
    await prisma.schedule.update({ where: { id: existingId }, data: { dayGroupId: groupId } })
  }

  await prisma.schedule.create({
    data: {
      date:       existing.date,
      opponent,
      location,
      type:       existing.type,
      meetTime:   existing.meetTime,
      startTime:  startTime || null,
      note:       null,
      dayGroupId: groupId,
    },
  })
  revalidatePath('/schedule')
  revalidatePath('/admin')
  redirect(`/admin/schedule?toast=${encodeURIComponent('試合を追加しました')}`)
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

  // Same select+custom pattern as create form
  const opponentSelect = String(formData.get('opponentSelect') || '').trim()
  const opponentCustom = String(formData.get('opponentCustom') || '').trim()
  const opponent = (opponentSelect === '__custom__' ? opponentCustom : opponentSelect) || opponentCustom

  const locationSelect = String(formData.get('locationSelect') || '').trim()
  const locationCustom = String(formData.get('locationCustom') || '').trim()
  const location = (locationSelect === '__custom__' ? locationCustom : locationSelect) || locationCustom

  // イベントは対戦相手なしでも可
  if (!location) return
  if (!opponent && type !== 'EVENT') return

  await prisma.schedule.update({
    where: { id },
    data: {
      date: dateTime, opponent: opponent || '', location, type,
      meetTime:  meetTime  || null,
      startTime: startTime || null,
      note:      String(formData.get('note') || '') || null,
    },
  })
  revalidatePath('/schedule')
  revalidatePath('/admin')
  redirect(`/admin/schedule?toast=${encodeURIComponent('日程を更新しました')}`)
}

// ─── グループ解除 ─────────────────────────────────────────────────
async function unlinkFromGroup(formData: FormData) {
  'use server'
  const id = String(formData.get('id'))
  const schedule = await prisma.schedule.findUnique({ where: { id } })
  if (!schedule?.dayGroupId) return

  const groupId = schedule.dayGroupId
  const members = await prisma.schedule.findMany({ where: { dayGroupId: groupId } })
  // If only 2 in group, also clear the other one's dayGroupId
  if (members.length <= 2) {
    await prisma.schedule.updateMany({ where: { dayGroupId: groupId }, data: { dayGroupId: null } })
  } else {
    await prisma.schedule.update({ where: { id }, data: { dayGroupId: null } })
  }
  revalidatePath('/schedule')
  revalidatePath('/admin')
  redirect(`/admin/schedule?toast=${encodeURIComponent('グループを解除しました')}`)
}

// ─── 削除 ────────────────────────────────────────────────────────────
async function deleteSchedule(formData: FormData) {
  'use server'
  const id = String(formData.get('id'))
  await prisma.schedule.delete({ where: { id } })
  revalidatePath('/schedule')
  revalidatePath('/admin')
  redirect(`/admin/schedule?toast=${encodeURIComponent('削除しました')}`)
}

function toDateInput(d: Date) {
  const y  = d.getFullYear()
  const m  = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// ─── 対戦相手・場所の選択フォーム ──────────────────────────────────
function OpponentSelect({ opponents, defaultValue = '' }: { opponents: string[]; defaultValue?: string }) {
  const isCustom = defaultValue && !opponents.includes(defaultValue)
  return opponents.length > 0 ? (
    <>
      <select name="opponentSelect" required className="mb-2" defaultValue={isCustom ? '__custom__' : defaultValue}>
        <option value="">── 選択してください ──</option>
        {opponents.map(o => <option key={o} value={o}>{o}</option>)}
        <option value="__custom__">その他（直接入力）...</option>
      </select>
      <input type="text" name="opponentCustom" defaultValue={isCustom ? defaultValue : ''} placeholder="マスタにない場合は直接入力" className="text-sm" />
      <p className="text-[10px] text-[#475569] mt-1">
        新しいチームを追加するには<Link href="/admin/masters" className="text-[#60a5fa] ml-1 hover:underline">マスタ管理</Link>へ
      </p>
    </>
  ) : (
    <>
      <input type="text" name="opponentCustom" required defaultValue={defaultValue} placeholder="チーム名" />
      <p className="text-[10px] text-[#fbbf24] mt-1">
        ⚠ マスタが空です。<Link href="/admin/masters" className="text-[#60a5fa] ml-1 hover:underline">マスタ管理</Link>で登録するとプルダウンで選べます。
      </p>
    </>
  )
}

function LocationSelect({ locations, defaultValue = '' }: { locations: string[]; defaultValue?: string }) {
  const isCustom = defaultValue && !locations.includes(defaultValue)
  return locations.length > 0 ? (
    <>
      <select name="locationSelect" required className="mb-2" defaultValue={isCustom ? '__custom__' : defaultValue}>
        <option value="">── 選択してください ──</option>
        {locations.map(l => <option key={l} value={l}>{l}</option>)}
        <option value="__custom__">その他（直接入力）...</option>
      </select>
      <input type="text" name="locationCustom" defaultValue={isCustom ? defaultValue : ''} placeholder="マスタにない場合は直接入力" className="text-sm" />
      <p className="text-[10px] text-[#475569] mt-1">
        新しい球場を追加するには<Link href="/admin/masters" className="text-[#60a5fa] ml-1 hover:underline">マスタ管理</Link>へ
      </p>
    </>
  ) : (
    <>
      <input type="text" name="locationCustom" required defaultValue={defaultValue} placeholder="球場名" />
      <p className="text-[10px] text-[#fbbf24] mt-1">
        ⚠ マスタが空です。<Link href="/admin/masters" className="text-[#60a5fa] ml-1 hover:underline">マスタ管理</Link>で登録するとプルダウンで選べます。
      </p>
    </>
  )
}

export const dynamic = 'force-dynamic'

export default async function AdminSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; addTo?: string }>
}) {
  const sp = await searchParams

  const [schedules, opponents, locations, gameTypeLabels] = await Promise.all([
    prisma.schedule.findMany({
      orderBy: { date: 'desc' },
      take: 60,
      include: { game: { select: { id: true } } },
    }),
    getMasterList('opponentMaster'),
    getMasterList('locationMaster'),
    getGameTypeLabels(),
  ])

  const editId = sp.edit
  const addToId = sp.addTo  // "この試合に2試合目を追加"

  const editSchedule = editId
    ? (schedules.find(s => s.id === editId) ??
       await prisma.schedule.findUnique({ where: { id: editId }, include: { game: { select: { id: true } } } }))
    : null

  const addToSchedule = addToId
    ? (schedules.find(s => s.id === addToId) ??
       await prisma.schedule.findUnique({ where: { id: addToId } }))
    : null

  const TYPES = ['REGULAR', 'PRACTICE', 'TOURNAMENT', 'EVENT'] as const

  // Group schedules by dayGroupId for display
  const groupMap = new Map<string, typeof schedules>()
  const ungrouped: typeof schedules = []
  for (const s of schedules) {
    if (s.dayGroupId) {
      if (!groupMap.has(s.dayGroupId)) groupMap.set(s.dayGroupId, [])
      groupMap.get(s.dayGroupId)!.push(s)
    } else {
      ungrouped.push(s)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin" className="text-[#64748b] hover:text-[#94a3b8]">← 管理</Link>
        <h1 className="text-2xl font-black text-[#e2e8f0]">
          {editSchedule ? '日程を編集' : addToSchedule ? '試合を追加' : '日程を追加'}
        </h1>
        {(editSchedule || addToSchedule) && (
          <Link href="/admin/schedule" className="text-xs text-[#64748b] hover:text-[#94a3b8] ml-auto">
            ＋ 新規追加に戻る
          </Link>
        )}
      </div>

      {/* ── 2試合目追加フォーム ── */}
      {addToSchedule && (
        <div className="glass-card rounded-2xl p-6 mb-8 border border-[#a78bfa]/30">
          <p className="text-xs text-[#a78bfa] mb-1">
            🔗 同日グループに追加:
            {new Date(addToSchedule.date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
            　vs {addToSchedule.opponent}
          </p>
          <p className="text-xs text-[#64748b] mb-4">集合時間・日付は親試合から引き継がれます。</p>
          <form action={addGameToDay} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="existingId" value={addToSchedule.id} />
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">対戦相手 *</label>
              <OpponentSelect opponents={opponents} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">場所 *</label>
              <LocationSelect locations={locations} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">試合開始</label>
              <input type="time" name="startTime" />
            </div>
            <div className="sm:col-span-2">
              <SubmitButton pendingLabel="追加中…" className="btn-primary w-full py-2.5">同日グループに追加する</SubmitButton>
            </div>
          </form>
        </div>
      )}

      {/* ── 編集フォーム ── */}
      {editSchedule && !addToSchedule ? (
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
              <OpponentSelect opponents={opponents} defaultValue={editSchedule.opponent} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">場所 *</label>
              <LocationSelect locations={locations} defaultValue={editSchedule.location} />
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
              <textarea name="note" rows={3} defaultValue={editSchedule.note ?? ''} placeholder="備考・注意事項など（改行可）" className="w-full resize-y" />
            </div>
            <div className="sm:col-span-2">
              <SubmitButton pendingLabel="更新中…" className="btn-primary w-full py-2.5">更新する</SubmitButton>
            </div>
          </form>
        </div>
      ) : !addToSchedule ? (
        /* ── 新規追加フォーム（クライアント: 保存中/保存しましたトースト + イベント時は対戦相手任意） ── */
        <ScheduleCreateForm
          opponents={opponents}
          locations={locations}
          types={TYPES}
          typeLabels={gameTypeLabels}
          action={createSchedule}
        />
      ) : null}

      {/* ── 登録済み日程一覧 ── */}
      <h2 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase mb-4">
        登録済み日程（直近60件）
      </h2>
      <div className="flex flex-col gap-2">
        {schedules.map((s) => (
          <div key={s.id}
            className={`glass-card rounded-xl px-4 py-3 ${
              s.dayGroupId ? 'border-l-2 border-[#a78bfa]/50' : ''
            } ${s.id === editId ? 'border border-[#f59e0b]/40' : ''}`}>
            {/* 上段: 試合情報 */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1.5">
              <span className="text-sm font-medium text-[#e2e8f0]">
                {s.type === 'EVENT' ? `🎉 ${s.opponent || 'イベント'}` : `vs ${s.opponent}`}
              </span>
              <span className="text-xs text-[#64748b]">
                {new Date(s.date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })}
              </span>
              <span className={`text-xs ${
                s.type === 'REGULAR'    ? 'text-[#60a5fa]' :
                s.type === 'TOURNAMENT' ? 'text-[#fbbf24]' :
                s.type === 'EVENT'      ? 'text-[#a78bfa]' : 'text-[#94a3b8]'
              }`}>
                {gameTypeLabels[s.type] ?? s.type}
              </span>
              {s.game && <span className="text-xs text-[#22c55e]">✓ 結果済</span>}
              {s.dayGroupId && <span className="text-xs text-[#a78bfa]">🔗 複数試合</span>}
            </div>
            {/* 下段: 場所 + アクションボタン */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-xs text-[#475569] flex-1 min-w-0">📍 {s.location}</span>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link
                  href={`/admin/schedule?edit=${s.id}`}
                  className="text-xs text-[#60a5fa]/70 hover:text-[#60a5fa] transition-colors"
                >
                  編集
                </Link>
                <Link
                  href={`/admin/schedule?addTo=${s.id}`}
                  className="text-xs text-[#a78bfa]/70 hover:text-[#a78bfa] transition-colors"
                  title="この日に別の試合を追加"
                >
                  ＋試合追加
                </Link>
                {s.dayGroupId && (
                  <form action={unlinkFromGroup}>
                    <input type="hidden" name="id" value={s.id} />
                    <SubmitButton pendingLabel="解除中…" className="text-xs text-[#64748b]/60 hover:text-[#94a3b8] transition-colors">
                      グループ解除
                    </SubmitButton>
                  </form>
                )}
                <form action={deleteSchedule}>
                  <input type="hidden" name="id" value={s.id} />
                  <SubmitButton
                    pendingLabel="削除中…"
                    confirm={s.game
                      ? `この日程（${s.opponent ? `vs ${s.opponent}` : 'イベント'}）には試合結果が登録されています。削除すると試合結果・個人成績もすべて削除されます。本当に削除しますか？`
                      : `この日程（${s.opponent ? `vs ${s.opponent}` : 'イベント'}）を削除しますか？`}
                    className="text-xs text-[#ef4444]/60 hover:text-[#ef4444] transition-colors"
                  >
                    削除
                  </SubmitButton>
                </form>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
