import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { sendToLineGroup, buildLineup } from '@/lib/line'
import { LineupEditor } from '@/components/LineupEditor'
import { LineSendButton } from '@/components/LineSendButton'

// ─── Server Actions ───────────────────────────────────────────

async function sendLineLineup(formData: FormData) {
  'use server'
  const scheduleId = String(formData.get('scheduleId'))
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    select: { id: true, date: true, opponent: true, location: true, meetTime: true, startTime: true },
  })
  if (!schedule) return
  const lineups = await prisma.lineup.findMany({
    where: { scheduleId },
    include: { user: { select: { name: true, number: true } } },
    orderBy: { battingOrder: 'asc' },
  })
  const noteSetting = await prisma.setting.findUnique({ where: { key: `lineupNote_${scheduleId}` } })
  const msg = buildLineup(schedule, lineups, noteSetting?.value || undefined)
  await sendToLineGroup(msg)
  revalidatePath('/admin/lineup')
}

async function saveLineup(formData: FormData) {
  'use server'
  const scheduleId = String(formData.get('scheduleId'))

  const users = await prisma.user.findMany({ orderBy: [{ number: 'asc' }, { name: 'asc' }] })

  for (const user of users) {
    const order = formData.get(`order_${user.id}`)
    const pos   = formData.get(`pos_${user.id}`)
    const isDH  = formData.get(`dh_${user.id}`) === 'on'

    if (order || pos) {
      await prisma.lineup.upsert({
        where:  { userId_scheduleId: { userId: user.id, scheduleId } },
        create: {
          userId: user.id,
          scheduleId,
          battingOrder: order ? parseInt(String(order)) || null : null,
          position:     String(pos || '') || null,
          isDH,
        },
        update: {
          battingOrder: order ? parseInt(String(order)) || null : null,
          position:     String(pos || '') || null,
          isDH,
        },
      })
    } else {
      await prisma.lineup.deleteMany({ where: { userId: user.id, scheduleId } })
    }
  }

  // メモ保存
  const note = String(formData.get('note') || '').trim()
  await prisma.setting.upsert({
    where:  { key: `lineupNote_${scheduleId}` },
    create: { key: `lineupNote_${scheduleId}`, value: note },
    update: { value: note },
  })

  revalidatePath('/admin/lineup')
  revalidatePath('/schedule')
}

// ─────────────────────────────────────────────────────────────

// 旧形式（英語）→ 新形式（日本語）の守備位置マッピング
const POS_TO_JA: Record<string, string> = {
  P: '投', C: '捕', '1B': '一', '2B': '二', '3B': '三',
  SS: '遊', LF: '左', CF: '中', RF: '右',
}

export default async function AdminLineupPage({
  searchParams,
}: {
  searchParams: Promise<{ scheduleId?: string }>
}) {
  const sp = await searchParams
  const lineConfigured = !!(process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_GROUP_ID)

  const [upcomingSchedules, allUsers] = await Promise.all([
    prisma.schedule.findMany({
      where: { date: { gte: new Date() } },
      orderBy: { date: 'asc' },
      take: 10,
    }),
    prisma.user.findMany({ orderBy: [{ number: 'asc' }, { name: 'asc' }] }),
  ])

  // ── 直近5試合の出席率でメンバーをソート ──────────────
  const last5 = await prisma.schedule.findMany({
    where: { date: { lt: new Date() } },
    orderBy: { date: 'desc' },
    take: 5,
    select: { id: true },
  })

  const attendCounts = new Map<string, number>()
  if (last5.length > 0) {
    const atts = await prisma.attendance.findMany({
      where: { scheduleId: { in: last5.map(s => s.id) }, status: 'ATTENDING' },
      select: { userId: true },
    })
    for (const a of atts) {
      attendCounts.set(a.userId, (attendCounts.get(a.userId) ?? 0) + 1)
    }
  }

  const sortedUsers = [...allUsers].sort(
    (a, b) => (attendCounts.get(b.id) ?? 0) - (attendCounts.get(a.id) ?? 0)
  )
  const players = sortedUsers.map(u => ({ id: u.id, name: u.name, number: u.number }))

  // ── 試合選択 ─────────────────────────────────────────
  const selectedId = sp.scheduleId ?? upcomingSchedules[0]?.id
  const selectedSchedule = selectedId
    ? upcomingSchedules.find(s => s.id === selectedId) ??
      (await prisma.schedule.findUnique({ where: { id: selectedId } }))
    : null

  const existingLineup = selectedId
    ? await prisma.lineup.findMany({
        where: { scheduleId: selectedId },
        include: { user: true },
        orderBy: { battingOrder: 'asc' },
      })
    : []

  // ── 既存データを新形式に変換 ─────────────────────────
  const initialEntries = existingLineup
    .filter(e => e.battingOrder != null)
    .sort((a, b) => (a.battingOrder ?? 99) - (b.battingOrder ?? 99))
    .map(e => ({
      playerId: e.userId,
      position: e.position === 'DP'
        ? 'DP'
        : e.isDH
        ? 'DH'
        : (POS_TO_JA[e.position ?? ''] ?? e.position ?? ''),
    }))

  // FP（守備専任: battingOrder なし、position あり）
  const initialFpEntries = existingLineup
    .filter(e => e.battingOrder == null && e.position)
    .map(e => ({
      playerId: e.userId,
      position: POS_TO_JA[e.position ?? ''] ?? e.position ?? '',
    }))

  // メモ
  const lineupNote = selectedId
    ? (await prisma.setting.findUnique({ where: { key: `lineupNote_${selectedId}` } }))?.value ?? ''
    : ''

  return (
    <div className="pt-16 max-w-2xl mx-auto px-4 py-12">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin" className="text-[#64748b] hover:text-[#94a3b8]">← 管理</Link>
        <h1 className="text-2xl font-black text-[#e2e8f0]">スタメン入力</h1>
      </div>

      {upcomingSchedules.length === 0 && !selectedSchedule ? (
        <div className="glass-card rounded-2xl p-12 text-center text-[#64748b]">
          今後の日程がありません。
          <Link href="/admin/schedule" className="text-[#60a5fa] ml-2">日程を追加する</Link>
        </div>
      ) : (
        <>
          {/* 試合選択 */}
          <div className="glass-card rounded-2xl p-4 mb-6">
            <label className="block text-xs font-medium text-[#94a3b8] mb-2">試合を選択</label>
            <div className="flex flex-wrap gap-2">
              {upcomingSchedules.map(s => (
                <Link
                  key={s.id}
                  href={`/admin/lineup?scheduleId=${s.id}`}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                    s.id === selectedId
                      ? 'bg-[#2563eb] border-[#2563eb] text-white'
                      : 'border-[#1e3a5f] text-[#64748b] hover:border-[#2563eb]/50'
                  }`}
                >
                  {new Date(s.date).toLocaleDateString('ja-JP', {
                    month: 'numeric', day: 'numeric', weekday: 'short',
                  })} vs {s.opponent}
                </Link>
              ))}
            </div>
          </div>

          {selectedSchedule && (
            <div>
              {/* 試合情報 */}
              <div className="mb-5 glass-card rounded-2xl p-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-bold text-[#e2e8f0]">
                  {new Date(selectedSchedule.date).toLocaleDateString('ja-JP', {
                    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
                  })}
                  <span className="text-[#fbbf24] ml-2">vs {selectedSchedule.opponent}</span>
                </span>
                <span className="text-xs text-[#64748b]">📍 {selectedSchedule.location}</span>
                {selectedSchedule.meetTime  && <span className="text-xs text-[#64748b]">🕐 集合 {selectedSchedule.meetTime}</span>}
                {selectedSchedule.startTime && <span className="text-xs text-[#64748b]">▶ 開始 {selectedSchedule.startTime}</span>}
              </div>

              {/* スタメンエディタ */}
              <div className="glass-card rounded-2xl p-5 mb-4">
                <LineupEditor
                  players={players}
                  scheduleId={selectedSchedule.id}
                  initialEntries={initialEntries}
                  initialFpEntries={initialFpEntries}
                  initialNote={lineupNote}
                  saveAction={saveLineup}
                />
              </div>

              {/* LINE送信 */}
              {lineConfigured && existingLineup.length > 0 && (
                <LineSendButton scheduleId={selectedSchedule.id} sendAction={sendLineLineup} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
