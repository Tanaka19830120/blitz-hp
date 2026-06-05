import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { sendToLineGroup, buildReminder, buildAttendanceSummary } from '@/lib/line'
import { auth } from '@/auth'
import { LineAdminButton } from '@/components/LineAdminButton'

// ─── Server Actions ──────────────────────────

/** ログインユーザーの送信者フッターを生成 */
async function getSenderFooter(): Promise<string> {
  const session = await auth()
  if (!session?.user?.id) return ''
  const me = await prisma.user.findUnique({
    where:  { id: session.user.id },
    select: { name: true, number: true },
  })
  if (!me) return ''
  const info = [
    me.number != null ? `#${me.number}` : '',
    me.name ?? '',
  ].filter(Boolean).join(' ')
  return info ? `\n━━━━━━━━━━━━\n📨 送信者: ${info}` : ''
}

/** scheduleId からグループ全体のスケジュールを取得 */
async function getGroupSchedules(scheduleId: string) {
  const s = await prisma.schedule.findUnique({ where: { id: scheduleId } })
  if (!s) return []
  if (!s.dayGroupId) return [s]
  return prisma.schedule.findMany({
    where:   { dayGroupId: s.dayGroupId },
    orderBy: { date: 'asc' },
  })
}

// ── リマインド プレビュー ──
async function previewLineReminder(scheduleId: string): Promise<string> {
  'use server'
  const [group, senderFooter] = await Promise.all([getGroupSchedules(scheduleId), getSenderFooter()])
  if (!group.length) return '（日程が見つかりません）'
  return buildReminder(group.length === 1 ? group[0] : group) + senderFooter
}

// ── リマインド 送信 ──
async function sendLineReminder(scheduleId: string): Promise<void> {
  'use server'
  const [group, senderFooter] = await Promise.all([getGroupSchedules(scheduleId), getSenderFooter()])
  if (!group.length) return
  const msg = buildReminder(group.length === 1 ? group[0] : group) + senderFooter
  await sendToLineGroup(msg)
  revalidatePath('/admin')
}

// ── 出欠集計 プレビュー ──
async function previewLineAttendance(scheduleId: string): Promise<string> {
  'use server'
  const [group, senderFooter] = await Promise.all([getGroupSchedules(scheduleId), getSenderFooter()])
  if (!group.length) return '（日程が見つかりません）'
  const primary = await prisma.schedule.findUnique({
    where: { id: group[0].id },
    include: { attendances: { include: { user: { select: { name: true } } } } },
  })
  if (!primary) return '（データなし）'
  const scheduleArg = group.length === 1 ? group[0] : group
  return buildAttendanceSummary(scheduleArg, primary.attendances) + senderFooter
}

// ── 出欠集計 送信 ──
async function sendLineAttendance(scheduleId: string): Promise<void> {
  'use server'
  const [group, senderFooter] = await Promise.all([getGroupSchedules(scheduleId), getSenderFooter()])
  if (!group.length) return
  const primary = await prisma.schedule.findUnique({
    where:   { id: group[0].id },
    include: { attendances: { include: { user: { select: { name: true } } } } },
  })
  if (!primary) return
  const scheduleArg = group.length === 1 ? group[0] : group
  const msg = buildAttendanceSummary(scheduleArg, primary.attendances) + senderFooter
  await sendToLineGroup(msg)
  revalidatePath('/admin')
}

// ─────────────────────────────────────────────

export default async function AdminPage() {
  const [detectedGroupId, userCount, scheduleCount, gameCount, upcomingAll] = await Promise.all([
    prisma.setting.findUnique({ where: { key: 'detectedLineGroupId' } }).then(s => s?.value ?? '').catch(() => ''),
    prisma.user.count(),
    prisma.schedule.count(),
    prisma.game.count(),
    prisma.schedule.findMany({
      where:   { date: { gte: new Date() } },
      orderBy: { date: 'asc' },
      take:    20,
      include: {
        _count: { select: { attendances: true } },
        game:   { select: { id: true } },
      },
    }),
  ])

  const lineConfigured = !!(process.env.LINE_CHANNEL_ACCESS_TOKEN && (process.env.LINE_GROUP_ID || detectedGroupId))

  // dayGroupId でグループ化（同日複数試合を1行に）
  type ScheduleItem = typeof upcomingAll[number]
  const groups: ScheduleItem[][] = []
  const seenGroup = new Set<string>()
  for (const s of upcomingAll) {
    if (s.dayGroupId) {
      if (seenGroup.has(s.dayGroupId)) continue
      seenGroup.add(s.dayGroupId)
      groups.push(upcomingAll.filter(x => x.dayGroupId === s.dayGroupId))
    } else {
      groups.push([s])
    }
  }
  const recentSchedules = groups.slice(0, 8)

  return (
    <div className="pt-16 max-w-7xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-[#e2e8f0] mb-2">管理ダッシュボード</h1>
        <p className="text-[#64748b]">チームデータの管理</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-10">
        {[
          { label: 'メンバー数', value: userCount, color: 'text-[#60a5fa]' },
          { label: '日程数', value: scheduleCount, color: 'text-[#fbbf24]' },
          { label: '試合結果', value: gameCount, color: 'text-[#22c55e]' },
        ].map((stat) => (
          <div key={stat.label} className="glass-card rounded-xl p-5 text-center">
            <div className={`text-3xl font-black ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-[#64748b] mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="mb-10">
        <h2 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase mb-4">Quick Actions</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/admin/schedule" className="glass-card rounded-xl p-5 hover:border-[#2563eb]/40 transition-all flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-[#1d4ed8]/20 flex items-center justify-center text-[#60a5fa] text-xl">📅</div>
            <div>
              <div className="font-semibold text-[#e2e8f0]">日程を追加</div>
              <div className="text-xs text-[#64748b]">試合・練習の予定を登録</div>
            </div>
          </Link>
          <Link href="/admin/game" className="glass-card rounded-xl p-5 hover:border-[#2563eb]/40 transition-all flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-[#16a34a]/20 flex items-center justify-center text-[#22c55e] text-xl">⚾</div>
            <div>
              <div className="font-semibold text-[#e2e8f0]">試合結果を入力</div>
              <div className="text-xs text-[#64748b]">スコアと個人成績を登録</div>
            </div>
          </Link>
          <Link href="/admin/members" className="glass-card rounded-xl p-5 hover:border-[#2563eb]/40 transition-all flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-[#d97706]/20 flex items-center justify-center text-[#fbbf24] text-xl">👥</div>
            <div>
              <div className="font-semibold text-[#e2e8f0]">メンバー管理</div>
              <div className="text-xs text-[#64748b]">選手の追加・編集</div>
            </div>
          </Link>
          <Link href="/admin/lineup" className="glass-card rounded-xl p-5 hover:border-[#2563eb]/40 transition-all flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-[#7c3aed]/20 flex items-center justify-center text-[#a78bfa] text-xl">📋</div>
            <div>
              <div className="font-semibold text-[#e2e8f0]">スタメン入力</div>
              <div className="text-xs text-[#64748b]">試合の打順・守備を登録</div>
            </div>
          </Link>
          <Link href="/admin/settings" className="glass-card rounded-xl p-5 hover:border-[#2563eb]/40 transition-all flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-[#0e7490]/20 flex items-center justify-center text-[#22d3ee] text-xl">⚙️</div>
            <div>
              <div className="font-semibold text-[#e2e8f0]">成績設定</div>
              <div className="text-xs text-[#64748b]">規定打席の係数を変更</div>
            </div>
          </Link>
          <Link href="/admin/line-setup" className="glass-card rounded-xl p-5 hover:border-[#2563eb]/40 transition-all flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-[#16a34a]/20 flex items-center justify-center text-[#22c55e] text-xl">💬</div>
            <div>
              <div className="font-semibold text-[#e2e8f0]">LINE設定</div>
              <div className="text-xs text-[#64748b]">{lineConfigured ? '通知設定済み ✓' : '通知のセットアップ'}</div>
            </div>
          </Link>
          <Link href="/admin/masters" className="glass-card rounded-xl p-5 hover:border-[#2563eb]/40 transition-all flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-[#7c3aed]/20 flex items-center justify-center text-[#a78bfa] text-xl">📚</div>
            <div>
              <div className="font-semibold text-[#e2e8f0]">マスタ管理</div>
              <div className="text-xs text-[#64748b]">球場・対戦相手・試合種別</div>
            </div>
          </Link>
          <Link href="/admin/profile" className="glass-card rounded-xl p-5 hover:border-[#2563eb]/40 transition-all flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-[#0e7490]/20 flex items-center justify-center text-[#22d3ee] text-xl">🏟</div>
            <div>
              <div className="font-semibold text-[#e2e8f0]">チームプロフィール</div>
              <div className="text-xs text-[#64748b]">チーム紹介ページの編集</div>
            </div>
          </Link>
          <Link href="/admin/contact" className="glass-card rounded-xl p-5 hover:border-[#2563eb]/40 transition-all flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-[#16a34a]/20 flex items-center justify-center text-[#22c55e] text-xl">📨</div>
            <div>
              <div className="font-semibold text-[#e2e8f0]">問い合わせ通知先</div>
              <div className="text-xs text-[#64748b]">LINEで受け取る人を設定</div>
            </div>
          </Link>
          <Link href="/admin/help" className="glass-card rounded-xl p-5 hover:border-[#2563eb]/40 transition-all flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-[#d97706]/20 flex items-center justify-center text-[#fbbf24] text-xl">🛠</div>
            <div>
              <div className="font-semibold text-[#e2e8f0]">管理者ガイド</div>
              <div className="text-xs text-[#64748b]">操作手順・使い方</div>
            </div>
          </Link>
        </div>
      </div>

      {/* Upcoming schedules + LINE buttons */}
      {recentSchedules.length > 0 && (
        <div>
          <h2 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase mb-4">Upcoming</h2>

          {!lineConfigured && (
            <div className="mb-4 px-4 py-3 rounded-xl border border-[#fbbf24]/30 bg-[#fbbf24]/5 text-xs text-[#fbbf24] flex items-center justify-between gap-3">
              <span>
                ⚠ LINE通知が未設定です。
                <span className="text-[#94a3b8] ml-1">LINE_CHANNEL_ACCESS_TOKEN と LINE_GROUP_ID を設定してください。</span>
              </span>
              <Link
                href="/admin/line-setup"
                className="shrink-0 px-3 py-1 rounded-lg border border-[#fbbf24]/40 text-[#fbbf24] hover:bg-[#fbbf24]/10 transition-all"
              >
                設定する →
              </Link>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {recentSchedules.map((group) => {
              const primary = group[0]
              const isMulti = group.length > 1
              const totalAttendances = group.reduce((sum, s) => sum + s._count.attendances, 0)
              // 複数試合の場合、参加者数は最大値を表示（同一ユーザーが全試合に回答するため）
              const attendanceDisplay = isMulti
                ? Math.max(...group.map(s => s._count.attendances))
                : primary._count.attendances
              const hasGame = group.some(s => s.game?.id)

              const labelOf = (s: typeof primary) =>
                s.type === 'EVENT' ? `🎉 ${s.opponent || 'イベント'}` : `vs ${s.opponent}`
              const opponentLabel = isMulti
                ? group.map((s, i) => `第${i + 1}試合 ${labelOf(s)}`).join(' / ')
                : labelOf(primary)

              return (
                <div key={primary.id} className="glass-card rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-[#e2e8f0]">
                      {opponentLabel}
                      {isMulti && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded border text-[#22d3ee] border-[#0e7490]/40 bg-[#0e7490]/10">
                          🔗 {group.length}試合
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#64748b]">
                      {new Date(primary.date).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
                      {!isMulti && ` — ${primary.location}`}
                    </div>
                    <div className="text-xs text-[#475569] mt-0.5">参加回答 {attendanceDisplay}名</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {/* 日程編集 */}
                    <Link
                      href={`/admin/schedule?edit=${primary.id}`}
                      className="text-xs px-3 py-1 rounded-lg border border-[#475569]/50 text-[#94a3b8] hover:border-[#94a3b8]/60 hover:text-[#e2e8f0] transition-all"
                    >
                      ✏️ 編集
                    </Link>

                    {/* 結果入力 */}
                    {!hasGame ? (
                      <Link href={`/admin/game?scheduleId=${primary.id}`} className="text-xs btn-primary py-1 px-3">
                        結果入力
                      </Link>
                    ) : (
                      <Link href={`/admin/game?scheduleId=${primary.id}`} className="text-xs text-[#22c55e] hover:text-[#4ade80] transition-colors">
                        ✓ 登録済
                      </Link>
                    )}

                    {/* LINE送信ボタン（確認モーダル付き） */}
                    {lineConfigured && (
                      <>
                        <LineAdminButton
                          label="📣 出欠リマインド"
                          buttonClass="text-xs px-3 py-1 rounded-lg border border-[#22c55e]/40 text-[#22c55e] hover:bg-[#22c55e]/10 transition-all disabled:opacity-40"
                          previewAction={previewLineReminder.bind(null, primary.id)}
                          sendAction={sendLineReminder.bind(null, primary.id)}
                        />
                        <LineAdminButton
                          label="📋 出欠表送信"
                          buttonClass="text-xs px-3 py-1 rounded-lg border border-[#60a5fa]/40 text-[#60a5fa] hover:bg-[#60a5fa]/10 transition-all disabled:opacity-40"
                          previewAction={previewLineAttendance.bind(null, primary.id)}
                          sendAction={sendLineAttendance.bind(null, primary.id)}
                        />
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
