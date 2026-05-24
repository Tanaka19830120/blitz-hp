import { prisma } from '@/lib/prisma'
import Link from 'next/link'

export default async function AdminPage() {
  const [userCount, scheduleCount, gameCount] = await Promise.all([
    prisma.user.count(),
    prisma.schedule.count(),
    prisma.game.count(),
  ])

  const recentSchedules = await prisma.schedule.findMany({
    where: { date: { gte: new Date() } },
    orderBy: { date: 'asc' },
    take: 5,
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
        </div>
      </div>

      {/* Upcoming schedules */}
      {recentSchedules.length > 0 && (
        <div>
          <h2 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase mb-4">Upcoming</h2>
          <div className="flex flex-col gap-3">
            {recentSchedules.map((s) => (
              <div key={s.id} className="glass-card rounded-xl p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium text-[#e2e8f0]">
                    vs {s.opponent}
                  </div>
                  <div className="text-xs text-[#64748b]">
                    {new Date(s.date).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
                    {' '}— {s.location}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#94a3b8]">参加 {s._count.attendances}名</span>
                  {!s.game ? (
                    <Link
                      href={`/admin/game?scheduleId=${s.id}`}
                      className="text-xs btn-primary py-1 px-3"
                    >
                      結果入力
                    </Link>
                  ) : (
                    <span className="text-xs text-[#22c55e]">✓ 登録済</span>
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
