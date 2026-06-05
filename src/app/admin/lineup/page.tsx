import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { sendTextsToLineGroup, buildLineup, buildLineupFromJson } from '@/lib/line'
import { LineupEditor, type LineupData } from '@/components/LineupEditor'
import { LineupProgressPanel, type LineupGameStep } from '@/components/LineupProgressPanel'
import { auth } from '@/auth'

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

  await prisma.lineup.deleteMany({ where: { scheduleId } })

  for (let i = 0; i < data.slots.length; i++) {
    const slot = data.slots[i]
    // 未入力・ゲスト（__guest_*）は Lineup テーブルには書かない（FK制約エラー回避）
    if (!slot.first.playerId || slot.first.playerId.startsWith('__guest_')) continue
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

// ─── グループ一括 LINE 送信 ───────────────────────────────────────
async function sendLineLineupGroup(primaryScheduleId: string) {
  'use server'

  // 送信者情報
  const session = await auth()
  let senderInfo = ''
  if (session?.user?.id) {
    const me = await prisma.user.findUnique({
      where:  { id: session.user.id },
      select: { name: true, number: true },
    })
    if (me) {
      senderInfo = [
        me.number != null ? `#${me.number}` : '',
        me.name ?? '',
      ].filter(Boolean).join(' ')
    }
  }

  // グループ内の全試合を取得
  const primary = await prisma.schedule.findUnique({ where: { id: primaryScheduleId } })
  if (!primary) return

  const groupSchedules = primary.dayGroupId
    ? await prisma.schedule.findMany({
        where:   { dayGroupId: primary.dayGroupId },
        orderBy: { date: 'asc' },
      })
    : [primary]

  const players = await prisma.user.findMany({
    select: { id: true, name: true, number: true },
  })

  const senderFooter = senderInfo.trim()
    ? `\n━━━━━━━━━━━━\n📨 送信者: ${senderInfo.trim()}`
    : ''

  // 各試合のスタメンメッセージを構築
  const messages: string[] = []
  for (const schedule of groupSchedules) {
    const dataSetting = await prisma.setting.findUnique({ where: { key: `lineupData_${schedule.id}` } })
    if (dataSetting?.value) {
      const data: LineupData = JSON.parse(dataSetting.value)
      messages.push(buildLineupFromJson(schedule, data, players) + senderFooter)
    } else {
      const lineups = await prisma.lineup.findMany({
        where:   { scheduleId: schedule.id },
        include: { user: { select: { name: true, number: true } } },
        orderBy: { battingOrder: 'asc' },
      })
      if (lineups.length > 0) {
        const noteSetting = await prisma.setting.findUnique({ where: { key: `lineupNote_${schedule.id}` } })
        messages.push(buildLineup(schedule, lineups, noteSetting?.value || undefined) + senderFooter)
      }
    }
  }

  if (messages.length > 0) {
    await sendTextsToLineGroup(messages)
  }

  // 送信タイムスタンプを記録（グループキー）
  const groupKey = primary.dayGroupId ?? primary.id
  await prisma.setting.upsert({
    where:  { key: `lineupSentAt_${groupKey}` },
    create: { key: `lineupSentAt_${groupKey}`, value: new Date().toISOString() },
    update: { value: new Date().toISOString() },
  })

  revalidatePath('/admin/lineup')
}

// ─────────────────────────────────────────────────────────────────

function buildEmptyLineupData(): LineupData {
  return {
    slots: Array.from({ length: 9 }, () => ({
      first:  { playerId: '', position: '' },
      second: { playerId: '', position: '' },
    })),
    fpSlots: [],
    umpires: [],
    bench:   [],
    note:    '',
  }
}

async function loadLineupData(scheduleId: string): Promise<LineupData> {
  const dataSetting = await prisma.setting.findUnique({ where: { key: `lineupData_${scheduleId}` } })

  if (dataSetting?.value) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed: any = JSON.parse(dataSetting.value)
    const len = Math.max(9, parsed.slots?.length ?? 0)
    let umpires = parsed.umpires ?? []
    if (umpires.length === 0 && (parsed.umpireFirst || parsed.umpireSecond)) {
      umpires = [
        ...(parsed.umpireFirst  ? [{ playerId: parsed.umpireFirst,  half: '前半' }] : []),
        ...(parsed.umpireSecond ? [{ playerId: parsed.umpireSecond, half: '後半' }] : []),
      ]
    }
    return {
      slots: Array.from({ length: len }, (_, i) =>
        parsed.slots?.[i] ?? { first: { playerId: '', position: '' }, second: { playerId: '', position: '' } }
      ),
      fpSlots: parsed.fpSlots ?? [],
      umpires,
      bench:   parsed.bench ?? [],
      note:    parsed.note ?? '',
    }
  }

  // 旧Lineupテーブルから変換
  const existingLineup = await prisma.lineup.findMany({
    where:   { scheduleId },
    include: { user: true },
    orderBy: { battingOrder: 'asc' },
  })
  const oldNote = await prisma.setting.findUnique({ where: { key: `lineupNote_${scheduleId}` } })

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

  return {
    slots,
    fpSlots: fps.map(e => ({
      playerId: e.userId,
      position: POS_TO_JA[e.position ?? ''] ?? e.position ?? '',
    })),
    umpires: [],
    bench:   [],
    note: oldNote?.value ?? '',
  }
}

// ─────────────────────────────────────────────────────────────────

export default async function AdminLineupPage({
  searchParams,
}: {
  searchParams: Promise<{ scheduleId?: string; gameId?: string }>
}) {
  const sp = await searchParams

  // ログインユーザーの背番号・名前を取得（表示用）
  const session = await auth()
  let senderLabel = ''
  if (session?.user?.id) {
    const me = await prisma.user.findUnique({
      where:  { id: session.user.id },
      select: { name: true, number: true },
    })
    if (me) {
      senderLabel = [
        me.number != null ? `#${me.number}` : '',
        me.name ?? '',
      ].filter(Boolean).join(' ')
    }
  }

  const lineConfigured = !!(process.env.LINE_CHANNEL_ACCESS_TOKEN &&
    (process.env.LINE_GROUP_ID ||
      await prisma.setting.findUnique({ where: { key: 'detectedLineGroupId' } }).then(s => s?.value ?? '').catch(() => '')))

  // 今日の0時（UTC）以降を「今後の試合」とする
  // new Date() だと現在時刻なので当日分が時間経過とともに消えてしまう
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  const [upcomingSchedules, allUsers] = await Promise.all([
    prisma.schedule.findMany({
      where:   { date: { gte: todayStart } },
      orderBy: { date: 'asc' },
      take:    40,
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
  // スタメン選択肢は「現メンバー（正式アカウント=@b・助っ人でない）」のみ + 助っ人枠1〜4
  const currentMembers = allUsers
    .filter(u => !u.isGuest && u.email.endsWith('@b'))
    .sort((a, b) => (attendCounts.get(b.id) ?? 0) - (attendCounts.get(a.id) ?? 0))
    .map(u => ({ id: u.id, name: u.name, number: u.number as number | null }))
  const guestSlots = [1, 2, 3, 4].map(n => ({ id: `__guest_${n}`, name: `助っ人${n}`, number: null as number | null }))
  const players = [...currentMembers, ...guestSlots]

  // ─── 日程グループ化 ────────────────────────────────────────────
  type SchedItem = typeof upcomingSchedules[number]
  const dayGroups: SchedItem[][] = []
  const seenGroup = new Set<string>()
  for (const s of upcomingSchedules) {
    if (s.dayGroupId) {
      if (seenGroup.has(s.dayGroupId)) continue
      seenGroup.add(s.dayGroupId)
      dayGroups.push(upcomingSchedules.filter(x => x.dayGroupId === s.dayGroupId))
    } else {
      dayGroups.push([s])
    }
  }

  // 選択中の日程グループを特定
  const selectedGroupPrimary = sp.scheduleId
    ? upcomingSchedules.find(s => s.id === sp.scheduleId) ??
      await prisma.schedule.findUnique({ where: { id: sp.scheduleId } })
    : (dayGroups[0]?.[0] ?? null)

  // 選択中の日程グループ全体
  let selectedGroup: SchedItem[] = []
  if (selectedGroupPrimary) {
    if (selectedGroupPrimary.dayGroupId) {
      selectedGroup = upcomingSchedules.filter(s => s.dayGroupId === selectedGroupPrimary.dayGroupId)
      if (selectedGroup.length === 0) {
        const found = await prisma.schedule.findMany({ where: { dayGroupId: selectedGroupPrimary.dayGroupId } })
        selectedGroup = found
      }
    } else {
      selectedGroup = [selectedGroupPrimary]
    }
  }

  // グループ内で選択中の試合（gameId パラメータ = scheduleId of specific game in group）
  const activeGameId = sp.gameId ?? selectedGroup[0]?.id
  const activeSchedule = selectedGroup.find(s => s.id === activeGameId) ?? selectedGroup[0] ?? null

  // スタメンデータ読み込み
  const initialData = activeSchedule
    ? await loadLineupData(activeSchedule.id)
    : buildEmptyLineupData()

  // ─── 進捗データ ───────────────────────────────────────────────
  // 各試合の保存状態
  const gameSteps: LineupGameStep[] = await Promise.all(
    selectedGroup.map(async (s, i) => {
      const saved = !!(
        await prisma.setting.findUnique({ where: { key: `lineupData_${s.id}` } }) ||
        await prisma.lineup.findFirst({ where: { scheduleId: s.id } })
      )
      return {
        scheduleId: s.id,
        label:    selectedGroup.length > 1 ? `第${i + 1}試合 vs ${s.opponent}` : `vs ${s.opponent}`,
        href:     `/admin/lineup?scheduleId=${selectedGroupPrimary?.id ?? s.id}&gameId=${s.id}`,
        saved,
        isActive: s.id === activeSchedule?.id,
      }
    })
  )

  // LINE 送信済みタイムスタンプ
  const groupKey   = selectedGroupPrimary?.dayGroupId ?? selectedGroupPrimary?.id ?? ''
  const sentSetting = groupKey
    ? await prisma.setting.findUnique({ where: { key: `lineupSentAt_${groupKey}` } })
    : null
  const lineSentAt = sentSetting?.value ?? null

  // LINE 送信プレビューテキストを生成（各試合分）
  const previewTexts: string[] = []
  for (const schedule of selectedGroup) {
    const dataSetting = await prisma.setting.findUnique({ where: { key: `lineupData_${schedule.id}` } })
    if (dataSetting?.value) {
      const data: LineupData = JSON.parse(dataSetting.value)
      previewTexts.push(buildLineupFromJson(schedule, data, players.map(p => ({ id: p.id, name: p.name ?? '', number: p.number }))))
    } else {
      const lineups = await prisma.lineup.findMany({
        where:   { scheduleId: schedule.id },
        include: { user: { select: { name: true, number: true } } },
        orderBy: { battingOrder: 'asc' },
      })
      if (lineups.length > 0) {
        previewTexts.push(buildLineup(schedule, lineups))
      }
    }
  }

  return (
    <div className="pt-16 max-w-2xl mx-auto px-4 py-12">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin" className="text-[#64748b] hover:text-[#94a3b8]">← 管理</Link>
        <h1 className="text-2xl font-black text-[#e2e8f0]">スタメン入力</h1>
      </div>

      {dayGroups.length === 0 && !activeSchedule ? (
        <div className="glass-card rounded-2xl p-12 text-center text-[#64748b]">
          今後の日程がありません。
          <Link href="/admin/schedule" className="text-[#60a5fa] ml-2">日程を追加する</Link>
        </div>
      ) : (
        <>
          {/* 日程グループ選択 */}
          <div className="glass-card rounded-2xl p-4 mb-5">
            <label className="block text-xs font-medium text-[#94a3b8] mb-2">試合日を選択</label>
            <div className="flex flex-wrap gap-2">
              {dayGroups.map((group) => {
                const primary = group[0]
                const isActive = selectedGroup.some(s => s.id === primary.id) ||
                  (primary.dayGroupId && selectedGroupPrimary?.dayGroupId === primary.dayGroupId)
                const label = group.length > 1
                  ? `${new Date(primary.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })} (${group.length}試合)`
                  : `${new Date(primary.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })} vs ${primary.opponent}`
                return (
                  <Link key={primary.id}
                    href={`/admin/lineup?scheduleId=${primary.id}`}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                      isActive
                        ? 'bg-[#2563eb] border-[#2563eb] text-white'
                        : 'border-[#1e3a5f] text-[#64748b] hover:border-[#2563eb]/50'
                    }`}>
                    {label}
                  </Link>
                )
              })}
            </div>
          </div>

          {selectedGroup.length > 0 && selectedGroupPrimary && (
            <div>
              {/* ── 進捗パネル（常に表示） ── */}
              <LineupProgressPanel
                games={gameSteps}
                primaryId={selectedGroupPrimary.id}
                lineSentAt={lineSentAt}
                lineConfigured={lineConfigured}
                senderLabel={senderLabel}
                sendAction={sendLineLineupGroup}
                previewTexts={previewTexts}
              />

              {/* 同日複数試合タブ */}
              {selectedGroup.length > 1 && (
                <div className="glass-card rounded-2xl p-3 mb-4">
                  <label className="block text-xs font-medium text-[#94a3b8] mb-2">スタメンを入力する試合を選択</label>
                  <div className="flex flex-wrap gap-2">
                    {selectedGroup.map((s, i) => {
                      const step = gameSteps[i]
                      return (
                        <Link key={s.id}
                          href={`/admin/lineup?scheduleId=${selectedGroupPrimary.id}&gameId=${s.id}`}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-all ${
                            s.id === activeSchedule?.id
                              ? 'bg-[#7c3aed] border-[#7c3aed] text-white'
                              : 'border-[#1e3a5f] text-[#64748b] hover:border-[#7c3aed]/50'
                          }`}>
                          {step?.saved ? <span className="text-[10px]">✅</span> : null}
                          第{i + 1}試合 vs {s.opponent}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )}

              {activeSchedule && (
                <div>
                  {/* 試合情報 */}
                  <div className="mb-5 glass-card rounded-2xl p-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="font-bold text-[#e2e8f0]">
                      {new Date(activeSchedule.date).toLocaleDateString('ja-JP', {
                        year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
                      })}
                      <span className="text-[#fbbf24] ml-2">vs {activeSchedule.opponent}</span>
                    </span>
                    <span className="text-xs text-[#64748b]">📍 {activeSchedule.location}</span>
                    {activeSchedule.meetTime  && <span className="text-xs text-[#64748b]">🕐 集合 {activeSchedule.meetTime}</span>}
                    {activeSchedule.startTime && <span className="text-xs text-[#64748b]">▶ 開始 {activeSchedule.startTime}</span>}
                  </div>

                  {/* エディタ（key で試合切替時に再マウント＝他試合と連動しない） */}
                  <div className="glass-card rounded-2xl p-5">
                    <LineupEditor
                      key={activeSchedule.id}
                      players={players}
                      scheduleId={activeSchedule.id}
                      initialData={initialData}
                      saveAction={saveLineup}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
