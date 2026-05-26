import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { sendToLineGroup, buildReminder, buildAttendanceSummary } from '@/lib/line'

// ─── Server Actions ──────────────────────────

async function sendLineReminder(formData: FormData) {
  'use server'
  const scheduleId = String(formData.get('scheduleId'))
  const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } })
  if (!schedule) return
  const msg = buildReminder(schedule)
  await sendToLineGroup(msg)
  revalidatePath('/admin')
}

async function sendLineAttendance(formData: FormData) {
  'use server'
  const scheduleId = String(formData.get('scheduleId'))
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: {
      attendances: { include: { user: { select: { name: true } } } },
    },
  })
  if (!schedule) return
  const msg = buildAttendanceSummary(schedule, schedule.attendances)
  await sendToLineGroup(msg)
  revalidatePath('/admin')
}

// ─────────────────────────────────────────────

export default async function AdminPage() {
  const detectedGroupId = await prisma.setting.findUnique({ where: { key: 'detectedLineGroupId' } }).then(s => s?.value ?? '').catch(() => '')
  const lineConfigured = !!(process.env.LINE_CHANNEL_ACCESS_TOKEN && (process.env.LINE_GROUP_ID || detectedGroupId))

  const [userCount, scheduleCount, gameCount] = await Promise.all([
    prisma.user.count(),
    prisma.schedule.count(),
    prisma.game.count(),
  ])

  const recentSchedules = await prisma.schedule.findMany({
    where: { date: { gte: new Date() } },
    orderBy: { date: 'asc' },
    take: 8,
    include: {
      _count: { select: { attendances: true } },
      game: { select: { id: true } },
    },
  })

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
            {recentSchedules.map((s) => (
              <div key={s.id} className="glass-card rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-[#e2e8f0]">vs {s.opponent}</div>
                  <div className="text-xs text-[#64748b]">
                    {new Date(s.date).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
                    {' '}— {s.location}
                  </div>
                  <div className="text-xs text-[#475569] mt-0.5">参加回答 {s._count.attendances}名</div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {/* 結果入力 or 登録済み */}
                  {!s.game ? (
                    <Link href={`/admin/game?scheduleId=${s.id}`} className="text-xs btn-primary py-1 px-3">
                      結果入力
                    </Link>
                  ) : (
                    <span className="text-xs text-[#22c55e]">✓ 登録済</span>
                  )}

                  {/* LINE送信ボタン */}
                  {lineConfigured && (
                    <>
                      <form action={sendLineReminder}>
                        <input type="hidden" name="scheduleId" value={s.id} />
                        <button
                          type="submit"
                          className="text-xs px-3 py-1 rounded-lg border border-[#22c55e]/40 text-[#22c55e] hover:bg-[#22c55e]/10 transition-all"
                        >
                          📣 出欠リマインド
                        </button>
                      </form>
                      <form action={sendLineAttendance}>
                        <input type="hidden" name="scheduleId" value={s.id} />
                        <button
                          type="submit"
                          className="text-xs px-3 py-1 rounded-lg border border-[#60a5fa]/40 text-[#60a5fa] hover:bg-[#60a5fa]/10 transition-all"
                        >
                          📋 出欠表送信
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
