import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getGameTypeLabels } from '@/lib/settings'
import { mapsUrl } from '@/lib/maps'
import AttendanceButtons from '@/components/AttendanceButtons'
import AdminAttendanceEditor from '@/components/AdminAttendanceEditor'
import { MemberAvatar } from '@/components/MemberAvatar'
import { PastSchedulesCollapse } from '@/components/PastSchedulesCollapse'

async function updateAttendance(
  scheduleId: string,
  status: 'ATTENDING' | 'ABSENT' | 'MAYBE',
  note: string,
  guestCount: number,
) {
  'use server'
  const session = await auth()
  if (!session?.user?.id) return

  // 同日グループ全試合の出欠を同時更新
  const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } })
  if (!schedule) return

  let scheduleIds = [scheduleId]
  if (schedule.dayGroupId) {
    const grouped = await prisma.schedule.findMany({
      where: { dayGroupId: schedule.dayGroupId },
      select: { id: true },
    })
    scheduleIds = grouped.map(s => s.id)
  }

  const normalizedNote = note.trim().slice(0, 200) || null
  const normalizedGuestCount = status === 'ATTENDING'
    ? Math.max(0, Math.min(20, Math.trunc(guestCount)))
    : 0

  await Promise.all(
    scheduleIds.map(sid =>
      prisma.attendance.upsert({
        where:  { userId_scheduleId: { userId: session.user!.id!, scheduleId: sid } },
        create: {
          userId: session.user!.id!, scheduleId: sid, status,
          note: normalizedNote, guestCount: normalizedGuestCount,
        },
        update: { status, note: normalizedNote, guestCount: normalizedGuestCount },
      })
    )
  )
  revalidatePath('/schedule')
  redirect(`/schedule?toast=${encodeURIComponent('出欠を登録しました')}`)
}

async function updateAttendanceAsAdmin(
  scheduleId: string,
  targetUserId: string,
  status: 'ATTENDING' | 'ABSENT' | 'MAYBE',
  note: string,
  guestCount: number,
) {
  'use server'
  const session = await auth()
  if (!session?.user?.id || session.user.role !== 'ADMIN') return

  const [schedule, targetUser] = await Promise.all([
    prisma.schedule.findUnique({ where: { id: scheduleId } }),
    prisma.user.findFirst({
      where: { id: targetUserId, isGuest: false, email: { endsWith: '@b' } },
      select: { id: true, name: true },
    }),
  ])
  if (!schedule || !targetUser) return

  let scheduleIds = [scheduleId]
  if (schedule.dayGroupId) {
    const grouped = await prisma.schedule.findMany({
      where: { dayGroupId: schedule.dayGroupId },
      select: { id: true },
    })
    scheduleIds = grouped.map(item => item.id)
  }

  const normalizedNote = note.trim().slice(0, 200) || null
  const normalizedGuestCount = status === 'ATTENDING'
    ? Math.max(0, Math.min(20, Math.trunc(guestCount)))
    : 0

  await prisma.$transaction(
    scheduleIds.map(id => prisma.attendance.upsert({
      where: { userId_scheduleId: { userId: targetUser.id, scheduleId: id } },
      create: {
        userId: targetUser.id,
        scheduleId: id,
        status,
        note: normalizedNote,
        guestCount: normalizedGuestCount,
      },
      update: { status, note: normalizedNote, guestCount: normalizedGuestCount },
    }))
  )

  revalidatePath('/schedule')
  redirect(`/schedule?toast=${encodeURIComponent(`${targetUser.name}さんの出欠を登録しました`)}`)
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  })
}

function statusLabel(status: string) {
  if (status === 'ATTENDING') return { label: '参加', cls: 'badge-attending' }
  if (status === 'ABSENT')    return { label: '欠席', cls: 'badge-absent' }
  if (status === 'MAYBE')     return { label: '未定', cls: 'badge-pending' }
  return { label: '未回答', cls: 'badge-pending' }
}

function textWithLinks(text: string) {
  const urlPattern = /(https?:\/\/[^\s<>"'）)\]】、。]+)/g

  return text.split(urlPattern).map((part, index) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={`${part}-${index}`}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#60a5fa] underline decoration-[#2563eb]/50 underline-offset-2 hover:text-[#93c5fd] break-all">
        {part}
      </a>
    ) : part
  )
}

type ScheduleRow = Awaited<ReturnType<typeof prisma.schedule.findMany>>[number] & {
  attendances: {
    userId: string
    status: string
    note: string | null
    guestCount: number
    user: { id: string; name: string; number: number | null; photoUrl: string | null }
  }[]
}

/** 日程リストを dayGroupId でグループ化。グループなし = 1要素の配列 */
function groupSchedules(schedules: ScheduleRow[]) {
  const groups: ScheduleRow[][] = []
  const seen = new Set<string>()

  for (const s of schedules) {
    if (s.dayGroupId) {
      if (seen.has(s.dayGroupId)) continue
      seen.add(s.dayGroupId)
      groups.push(schedules.filter(x => x.dayGroupId === s.dayGroupId))
    } else {
      groups.push([s])
    }
  }
  return groups
}

export default async function SchedulePage() {
  const session = await auth()
  const isAdmin = session?.user?.role === 'ADMIN'
  const now = new Date()

  const [rawSchedules, gameTypeLabels, members] = await Promise.all([
    prisma.schedule.findMany({
      orderBy: { date: 'desc' },
      include: {
        attendances: {
          include: { user: { select: { id: true, name: true, number: true, photoUrl: true } } },
        },
      },
      take: 100,
    }),
    getGameTypeLabels(),
    // 現メンバー（未回答の算出用）
    prisma.user.findMany({
      where: { isGuest: false, email: { endsWith: '@b' } },
      select: { id: true, name: true, number: true, photoUrl: true },
      orderBy: [{ number: 'asc' }, { name: 'asc' }],
    }),
  ])

  const schedules = rawSchedules as ScheduleRow[]
  const allGroups = groupSchedules(schedules)
  const upcomingGroups = allGroups.filter(g => new Date(g[0].date) >= now).reverse()
  const pastGroups     = allGroups.filter(g => new Date(g[0].date) <  now)

  function renderGroup(group: ScheduleRow[]) {
            const primary = group[0]
            const isMulti = group.length > 1

            // 出欠は primary の値を代表として使用（グループ内は常に同一のはず）
            const myAttendance = primary.attendances.find(a => a.userId === session?.user?.id)

            // 出席人数は primary のみカウント（グループ内の出欠は同一）
            const attending = primary.attendances.filter(a => a.status === 'ATTENDING')
            const absent    = primary.attendances.filter(a => a.status === 'ABSENT')
            const maybe     = primary.attendances.filter(a => a.status === 'MAYBE')
            const guests = attending.flatMap(a =>
              Array.from({ length: a.guestCount }, (_, index) => ({
                key: `${a.userId}-${index}`,
                ownerName: a.user.name,
              }))
            )
            const totalAttending = attending.length + guests.length
            // 未回答 = 現メンバーのうち、回答(参加/欠席/未定)していない人
            const respondedIds = new Set(
              primary.attendances
                .filter(a => ['ATTENDING', 'ABSENT', 'MAYBE'].includes(a.status))
                .map(a => a.userId)
            )
            const notResponded = members.filter(m => !respondedIds.has(m.id))

            const { label, cls } = statusLabel(myAttendance?.status ?? 'PENDING')
            const isPast = new Date(primary.date) < now

            // 試合種別バッジ（グループ内は同一のはず）
            const typeColor =
              primary.type === 'REGULAR'    ? 'text-[#60a5fa] border-[#1d4ed8]/40 bg-[#1d4ed8]/10' :
              primary.type === 'TOURNAMENT' ? 'text-[#fbbf24] border-[#d97706]/40 bg-[#d97706]/10' :
              primary.type === 'EVENT'      ? 'text-[#a78bfa] border-[#7c3aed]/40 bg-[#7c3aed]/10' :
                                              'text-[#94a3b8] border-[#1e3a5f] bg-[#1e3a5f]/20'

    return (
      <div key={primary.id} className={`glass-card rounded-2xl p-6 ${isPast ? 'opacity-60' : ''}`}>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${typeColor}`}>
                        {gameTypeLabels[primary.type] ?? primary.type}
                      </span>
                      {isMulti && (
                        <span className="text-xs px-2 py-0.5 rounded border text-[#22d3ee] border-[#0e7490]/40 bg-[#0e7490]/10">
                          🔗 {group.length}試合
                        </span>
                      )}
                      {isPast && (
                        <span className="text-xs text-[#64748b] border border-[#1e3a5f] px-2 py-0.5 rounded">終了</span>
                      )}
                    </div>

                    <div className="text-[#94a3b8] text-sm mb-2">{formatDate(primary.date)}</div>

                    {/* 試合ごとの情報 */}
                    {isMulti ? (
                      <div className="flex flex-col gap-2 mb-2">
                        {group.map((s, i) => (
                          <div key={s.id} className="flex flex-col gap-0.5">
                            <div className="flex flex-wrap items-center gap-x-2">
                              <span className="text-xs text-[#64748b] shrink-0">第{i + 1}試合</span>
                              <span className="text-lg font-bold leading-tight">
                                {s.type === 'EVENT'
                                  ? <span className="text-[#a78bfa]">🎉 {s.opponent || 'イベント'}</span>
                                  : <>vs <span className="text-[#fbbf24]">{s.opponent}</span></>}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-x-3 text-xs text-[#64748b]">
                              <a href={mapsUrl(s.location)} target="_blank" rel="noopener noreferrer"
                                className="text-[#60a5fa] hover:underline">📍 {s.location} 🗺</a>
                              {s.startTime && <span>▶ {s.startTime}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xl font-bold mb-2">
                        {primary.type === 'EVENT'
                          ? <span className="text-[#a78bfa]">🎉 {primary.opponent || 'イベント'}</span>
                          : <>vs <span className="text-[#fbbf24]">{primary.opponent}</span></>}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-4 text-sm text-[#64748b]">
                      {!isMulti && (
                        <a href={mapsUrl(primary.location)} target="_blank" rel="noopener noreferrer"
                          className="text-[#60a5fa] hover:underline">📍 {primary.location} 🗺</a>
                      )}
                      {primary.meetTime  && <span>🕐 集合 {primary.meetTime}</span>}
                      {!isMulti && primary.startTime && <span>⚾ 開始 {primary.startTime}</span>}
                    </div>

                    {primary.note && (
                      <p className="mt-2 text-sm text-[#94a3b8] bg-[#0d1b2a] rounded-lg px-3 py-2 whitespace-pre-line">
                        {textWithLinks(primary.note)}
                      </p>
                    )}
                  </div>

                  {/* 出欠ボタン */}
                  <div className="flex flex-col gap-3 lg:items-end">
                    {session?.user && !isPast && (
                      <div>
                        <div className="text-xs text-[#64748b] mb-2">
                          あなたの出欠: <span className={cls}>{label}</span>
                          {isMulti && <span className="text-[#475569] ml-1">（全試合共通）</span>}
                        </div>
                        <AttendanceButtons
                          scheduleId={primary.id}
                          currentStatus={(myAttendance?.status as 'ATTENDING' | 'ABSENT' | 'MAYBE' | null) ?? null}
                          currentNote={myAttendance?.note ?? ''}
                          currentGuestCount={myAttendance?.guestCount ?? 0}
                          isMulti={isMulti}
                          updateAction={updateAttendance}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {isAdmin && !isPast && (
                  <AdminAttendanceEditor
                    scheduleId={primary.id}
                    isMulti={isMulti}
                    members={members
                      .filter(member => member.id !== session.user.id)
                      .map(member => {
                        const attendance = primary.attendances.find(item => item.userId === member.id)
                        return {
                          id: member.id,
                          name: member.name,
                          status: (attendance?.status as 'ATTENDING' | 'ABSENT' | 'MAYBE' | null) ?? null,
                          note: attendance?.note ?? '',
                          guestCount: attendance?.guestCount ?? 0,
                        }
                      })}
                    updateAction={updateAttendanceAsAdmin}
                  />
                )}

                {/* 出欠集計 */}
                <div className="mt-5 border-t border-[#1e3a5f]/30 pt-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-black tracking-[0.28em] text-[#60a5fa]">TEAM BENCH</div>
                      <h3 className="mt-1 text-base font-black text-[#e2e8f0]">出欠ベンチボード</h3>
                    </div>
                    <div className="rounded-full border border-[#22c55e]/30 bg-[#22c55e]/10 px-3 py-1 text-xs font-black text-[#22c55e]">
                      参加予定 {totalAttending}名
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-[#22c55e]/20 bg-[#22c55e]/[0.04] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-xs font-black text-[#22c55e]">✓ 参加</span>
                        <span className="text-xs text-[#64748b]">{totalAttending}名{guests.length > 0 ? `（助っ人${guests.length}名）` : ''}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {attending.map(item => (
                          <div key={item.userId} className="flex min-w-[145px] items-center gap-2 rounded-xl border border-[#22c55e]/20 bg-[#081b18] px-2.5 py-2">
                            <MemberAvatar photoUrl={item.user.photoUrl} name={item.user.name} number={item.user.number} size="sm" />
                            <div className="min-w-0">
                              <div className="truncate text-xs font-bold text-[#d1fae5]">
                                {item.user.number != null && <span className="mr-1 text-[#22c55e]">#{item.user.number}</span>}
                                {item.user.name}
                              </div>
                              {item.note && <div className="mt-0.5 max-w-[170px] truncate text-[10px] text-[#94a3b8]" title={item.note}>{item.note}</div>}
                            </div>
                          </div>
                        ))}
                        {guests.map((guest, index) => (
                          <div key={guest.key} className="flex min-w-[145px] items-center gap-2 rounded-xl border border-[#60a5fa]/25 bg-[#0b1830] px-2.5 py-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2563eb]/25 text-[10px] font-black text-[#60a5fa]">G</div>
                            <div className="text-xs font-bold text-[#bfdbfe]">助っ人{index + 1}<span className="block text-[10px] font-normal text-[#64748b]">（{guest.ownerName}）</span></div>
                          </div>
                        ))}
                        {attending.length === 0 && <span className="text-xs text-[#475569]">参加者はまだいません</span>}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                      {[
                        { title: '✗ 欠席', color: '#ef4444', rows: absent },
                        { title: '? 未定', color: '#f59e0b', rows: maybe },
                        { title: '▢ 未回答', color: '#94a3b8', rows: notResponded },
                      ].map(section => (
                        <div key={section.title} className="rounded-2xl border border-[#1e3a5f]/70 bg-[#09131f] p-3">
                          <div className="mb-2 flex items-center justify-between text-xs font-black" style={{ color: section.color }}>
                            <span>{section.title}</span><span>{section.rows.length}名</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {section.rows.map(item => {
                              const user = 'user' in item ? item.user : item
                              const note = 'note' in item ? item.note : null
                              return (
                                <div key={user.id} className="flex items-center gap-1.5 rounded-lg border border-[#1e3a5f]/70 bg-[#0d1b2a] px-2 py-1.5" title={note ?? undefined}>
                                  <MemberAvatar photoUrl={user.photoUrl} name={user.name} number={user.number} size="sm" />
                                  <span className="max-w-[90px] truncate text-[11px] font-semibold text-[#94a3b8]">{user.name}</span>
                                  {note && <span className="text-[9px] text-[#60a5fa]">●</span>}
                                </div>
                              )
                            })}
                            {section.rows.length === 0 && <span className="text-[10px] text-[#334155]">なし</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-[#e2e8f0] mb-2">日程・出欠</h1>
        <p className="text-[#64748b]">試合・練習の日程と出欠状況</p>
      </div>

      {upcomingGroups.length === 0 && pastGroups.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center text-[#64748b]">
          予定されている日程はありません
        </div>
      ) : (
        <>
          {upcomingGroups.length === 0 ? (
            <div className="glass-card rounded-2xl p-8 text-center text-[#64748b] mb-4">
              今後の予定はありません
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {upcomingGroups.map(renderGroup)}
            </div>
          )}

          {pastGroups.length > 0 && (
            <PastSchedulesCollapse count={pastGroups.length}>
              {pastGroups.map(renderGroup)}
            </PastSchedulesCollapse>
          )}
        </>
      )}
    </div>
  )
}
