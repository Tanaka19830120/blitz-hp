import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { sendToLineGroup, buildLineupFromJson } from '@/lib/line'
import { LineupEditor, type LineupData } from '@/components/LineupEditor'
import { LineSendButton } from '@/components/LineSendButton'

// ─── 旧形式（英語）→ 日本語の守備位置マッピング ───────────────────
const POS_TO_JA: Record<string, string> = {
  P: '投', C: '捕', '1B': '一', '2B': '二', '3B': '三',
  SS: '遊', LF: '左', CF: '中', RF: '右',
}

// ─── Server Actions ──────────────────────────────────────────────

async function saveLineup(formData: FormData) {
  'use server'
  const scheduleId = String(formData.get('scheduleId'))
  const jsonStr    = String(formData.get('lineupJson'))

  // JSON を Setting テーブルに保存
  await prisma.setting.upsert({
    where:  { key: `lineupData_${scheduleId}` },
    create: { key: `lineupData_${scheduleId}`, value: jsonStr },
    update: { value: jsonStr },
  })

  // 後方互換: Lineup テーブルにも同期（前半を主とする）
  const data: LineupData = JSON.parse(jsonStr)

  // 既存を全削除してから再挿入
  await prisma.lineup.deleteMany({ where: { scheduleId } })

  for (let i = 0; i < data.slots.length; i++) {
    const slot = data.slots[i]
    if (!slot.first.playerId) continue
    const pos = slot.first.position
    await prisma.lineup.create({
      data: {
        userId:       slot.first.playerId,
        scheduleId,
        battingOrder: i + 1,
        position:     pos || null,
        isDH:         pos === 'DP',
      },
    })
  }

  for (const fp of data.fpSlots) {
    if (!fp.playerId || !fp.position) continue
    // 打順欄に既に存在する場合はスキップ（unique 制約）
    const exists = await prisma.lineup.findUnique({
      where: { userId_scheduleId: { userId: fp.playerId, scheduleId } },
    })
    if (!exists) {
      await prisma.lineup.create({
        data: { userId: fp.playerId, scheduleId, battingOrder: null, position: fp.position, isDH: false },
      })
    }
  }

  revalidatePath('/admin/lineup')
  revalidatePath('/schedule')
}

async function sendLineLineup(formData: FormData) {
  'use server'
  const scheduleId = String(formData.get('scheduleId'))

  const schedule = await prisma.schedule.findUnique({
    where:  { id: scheduleId },
    select: { id: true, date: true, opponent: true, location: true, meetTime: true, startTime: true },
  })
  if (!schedule) return

  const players = await prisma.user.findMany({
    select: { id: true, name: true, number: true },
  })

  // JSON形式が存在すればそちらを使用
  const dataSetting = await prisma.setting.findUnique({ where: { key: `lineupData_${scheduleId}` } })
  if (dataSetting?.value) {
    const data: LineupData = JSON.parse(dataSetting.value)
    const msg = buildLineupFromJson(schedule, data, players)
    await sendToLineGroup(msg)
  } else {
    // 旧形式フォールバック
    const { buildLineup } = await import('@/lib/line')
    const lineups = await prisma.lineup.findMany({
      where:   { scheduleId },
      include: { user: { select: { name: true, number: true } } },
      orderBy: { battingOrder: 'asc' },
    })
    const noteSetting = await prisma.setting.findUnique({ where: { key: `lineupNote_${scheduleId}` } })
    const msg = buildLineup(schedule, lineups, noteSetting?.value || undefined)
    await sendToLineGroup(msg)
  }

  revalidatePath('/admin/lineup')
}

// ─────────────────────────────────────────────────────────────────

export default async function AdminLineupPage({
  searchParams,
}: {
  searchParams: Promise<{ scheduleId?: string }>
}) {
  const sp = await searchParams
  const lineConfigured = !!(process.env.LINE_CHANNEL_ACCESS_TOKEN &&
    (process.env.LINE_GROUP_ID ||
      await prisma.setting.findUnique({ where: { key: 'detectedLineGroupId' } }).then(s => s?.value ?? '').catch(() => '')))

  const [upcomingSchedules, allUsers] = await Promise.all([
    prisma.schedule.findMany({
      where:   { date: { gte: new Date() } },
      orderBy: { date: 'asc' },
      take:    10,
    }),
    prisma.user.findMany({ orderBy: [{ number: 'asc' }, { name: 'asc' }] }),
  ])

  // 直近5試合の出席率でソート
  const last5 = await prisma.schedule.findMany({
    where:   { date: { lt: new Date() } },
    orderBy: { date: 'desc' },
    take:    5,
    select:  { id: true },
  })
  const attendCounts = new Map<string, number>()
  if (last5.length > 0) {
    const atts = await prisma.attendance.findMany({
      where:  { scheduleId: { in: last5.map(s => s.id) }, status: 'ATTENDING' },
      select: { userId: true },
    })
    for (const a of atts) attendCounts.set(a.userId, (attendCounts.get(a.userId) ?? 0) + 1)
  }
  const players = [...allUsers]
    .sort((a, b) => (attendCounts.get(b.id) ?? 0) - (attendCounts.get(a.id) ?? 0))
    .map(u => ({ id: u.id, name: u.name, number: u.number }))

  // 試合選択
  const selectedId = sp.scheduleId ?? upcomingSchedules[0]?.id
  const selectedSchedule = selectedId
    ? upcomingSchedules.find(s => s.id === selectedId) ??
      (await prisma.schedule.findUnique({ where: { id: selectedId } }))
    : null

  // 初期データを読み込む（JSON優先 → 旧Lineupテーブル）
  let initialData: LineupData = {
    slots: Array.from({ length: 9 }, () => ({
      first:  { playerId: '', position: '' },
      second: { playerId: '', position: '' },
    })),
    fpSlots:      [],
    umpireFirst:  '',
    umpireSecond: '',
    note:         '',
  }

  if (selectedId) {
    const dataSetting = await prisma.setting.findUnique({ where: { key: `lineupData_${selectedId}` } })

    if (dataSetting?.value) {
      // 新JSON形式
      const parsed: LineupData = JSON.parse(dataSetting.value)
      const len = Math.max(9, parsed.slots?.length ?? 0)
      initialData = {
        slots: Array.from({ length: len }, (_, i) =>
          parsed.slots?.[i] ?? { first: { playerId: '', position: '' }, second: { playerId: '', position: '' } }
        ),
        fpSlots:      parsed.fpSlots      ?? [],
        umpireFirst:  parsed.umpireFirst   ?? '',
        umpireSecond: parsed.umpireSecond  ?? '',
        note:         parsed.note          ?? '',
      }
    } else {
      // 旧Lineupテーブルから変換
      const existingLineup = await prisma.lineup.findMany({
        where:   { scheduleId: selectedId },
        include: { user: true },
        orderBy: { battingOrder: 'asc' },
      })
      const oldNote = await prisma.setting.findUnique({ where: { key: `lineupNote_${selectedId}` } })

      const batters = existingLineup.filter(e => e.battingOrder != null)
        .sort((a, b) => (a.battingOrder ?? 99) - (b.battingOrder ?? 99))
      const fps = existingLineup.filter(e => e.battingOrder == null && e.position)

      const slots = batters.map(e => ({
        first: {
          playerId: e.userId,
          position: e.isDH ? 'DP' : (POS_TO_JA[e.position ?? ''] ?? e.position ?? ''),
        },
        second: { playerId: '', position: '' },
      }))
      while (slots.length < 9) slots.push({ first: { playerId: '', position: '' }, second: { playerId: '', position: '' } })

      initialData = {
        slots,
        fpSlots: fps.map(e => ({
          playerId: e.userId,
          position: POS_TO_JA[e.position ?? ''] ?? e.position ?? '',
        })),
        umpireFirst:  '',
        umpireSecond: '',
        note: oldNote?.value ?? '',
      }
    }
  }

  const hasAnyLineup = selectedId
    ? !!(await prisma.lineup.findFirst({ where: { scheduleId: selectedId } }) ||
        await prisma.setting.findUnique({ where: { key: `lineupData_${selectedId}` } }))
    : false

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
                <Link key={s.id} href={`/admin/lineup?scheduleId=${s.id}`}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                    s.id === selectedId
                      ? 'bg-[#2563eb] border-[#2563eb] text-white'
                      : 'border-[#1e3a5f] text-[#64748b] hover:border-[#2563eb]/50'
                  }`}>
                  {new Date(s.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })} vs {s.opponent}
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

              {/* エディタ */}
              <div className="glass-card rounded-2xl p-5 mb-4 overflow-x-auto">
                <LineupEditor
                  players={players}
                  scheduleId={selectedSchedule.id}
                  initialData={initialData}
                  saveAction={saveLineup}
                />
              </div>

              {/* LINE送信 */}
              {lineConfigured && hasAnyLineup && (
                <LineSendButton scheduleId={selectedSchedule.id} sendAction={sendLineLineup} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
