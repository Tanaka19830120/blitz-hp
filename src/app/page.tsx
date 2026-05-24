import { prisma } from '@/lib/prisma'
import Link from 'next/link'

async function getHomeData() {
  const now = new Date()
  const [games, nextSchedule, totalGames] = await Promise.all([
    prisma.game.findMany({
      take: 6,
      orderBy: { createdAt: 'desc' },
      include: { schedule: true },
    }),
    prisma.schedule.findFirst({
      where: { date: { gt: now } },
      orderBy: { date: 'asc' },
    }),
    prisma.game.groupBy({
      by: ['result'],
      _count: { result: true },
    }),
  ])
  const wins = totalGames.find((g) => g.result === 'WIN')?._count.result ?? 0
  const losses = totalGames.find((g) => g.result === 'LOSE')?._count.result ?? 0
  const draws = totalGames.find((g) => g.result === 'DRAW')?._count.result ?? 0
  return { games, nextSchedule, wins, losses, draws }
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('ja-JP', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })
}

function daysUntil(date: Date) {
  return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

export default async function HomePage() {
  const { games, nextSchedule, wins, losses, draws } = await getHomeData()
  const total = wins + losses + draws

  return (
    <div className="pt-16">
      {/* Hero */}
      <section className="hero-bg relative overflow-hidden min-h-[90vh] flex items-center">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-20 left-10 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-900/10 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-4 py-20 w-full">
          <div className="max-w-3xl">
            <p className="text-[#60a5fa] text-sm font-semibold tracking-[0.3em] uppercase mb-4">
              Softball Team
            </p>
            <h1 className="text-[clamp(4rem,15vw,10rem)] font-black tracking-tight leading-none mb-6">
              <span className="text-gradient">BLITZ</span>
            </h1>
            <p className="text-[#94a3b8] text-lg md:text-xl mb-10 max-w-lg">
              熱く、鋭く、打ち勝つ。<br />仲間と共に頂点を目指す。
            </p>
            <div className="flex flex-wrap gap-4 mb-12">
              <Link href="/schedule" className="btn-primary text-base px-6 py-3">
                日程・出欠を確認
              </Link>
              <Link href="/results" className="btn-gold text-base px-6 py-3">
                試合結果
              </Link>
            </div>
            {total > 0 && (
              <div className="glass-card rounded-2xl p-6 inline-flex gap-8">
                <div className="text-center">
                  <div className="text-4xl font-black text-[#22c55e]">{wins}</div>
                  <div className="text-xs text-[#64748b] mt-1 font-medium tracking-wider">WIN</div>
                </div>
                <div className="w-px bg-[#1e3a5f]" />
                <div className="text-center">
                  <div className="text-4xl font-black text-[#ef4444]">{losses}</div>
                  <div className="text-xs text-[#64748b] mt-1 font-medium tracking-wider">LOSE</div>
                </div>
                <div className="w-px bg-[#1e3a5f]" />
                <div className="text-center">
                  <div className="text-4xl font-black text-[#f59e0b]">{draws}</div>
                  <div className="text-xs text-[#64748b] mt-1 font-medium tracking-wider">DRAW</div>
                </div>
                <div className="w-px bg-[#1e3a5f]" />
                <div className="text-center">
                  <div className="text-4xl font-black text-[#e2e8f0]">{total}</div>
                  <div className="text-xs text-[#64748b] mt-1 font-medium tracking-wider">TOTAL</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Next Game */}
      {nextSchedule && (
        <section className="max-w-7xl mx-auto px-4 py-12">
          <h2 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase mb-6">Next Game</h2>
          <div className="glass-card rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="badge-pending">
                  {nextSchedule.type === 'REGULAR' ? '公式戦' : nextSchedule.type === 'PRACTICE' ? '練習試合' : 'トーナメント'}
                </span>
                <span className="text-[#60a5fa] font-bold text-sm">
                  {daysUntil(nextSchedule.date) === 0 ? '本日' : `${daysUntil(nextSchedule.date)}日後`}
                </span>
              </div>
              <div className="text-[#94a3b8] text-sm mb-1">{formatDate(nextSchedule.date)}</div>
              <div className="text-2xl font-bold">
                vs <span className="text-[#fbbf24]">{nextSchedule.opponent}</span>
              </div>
              <div className="flex flex-wrap gap-4 mt-3 text-sm text-[#64748b]">
                <span>📍 {nextSchedule.location}</span>
                {nextSchedule.meetTime && <span>🕐 集合 {nextSchedule.meetTime}</span>}
              </div>
            </div>
            <Link href="/schedule" className="btn-primary whitespace-nowrap">
              出欠を登録
            </Link>
          </div>
        </section>
      )}

      {/* Recent Results */}
      {games.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 pb-16">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase">Recent Results</h2>
            <Link href="/results" className="text-sm text-[#64748b] hover:text-[#94a3b8] transition-colors">
              すべて見る →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((game) => (
              <div key={game.id} className="glass-card rounded-xl p-5 hover:border-[#2563eb]/40 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className={game.result === 'WIN' ? 'badge-win' : game.result === 'LOSE' ? 'badge-lose' : 'badge-draw'}>
                    {game.result === 'WIN' ? '勝利' : game.result === 'LOSE' ? '敗戦' : '引分'}
                  </span>
                  <span className="text-xs text-[#64748b]">{formatDate(game.schedule.date)}</span>
                </div>
                <div className="text-sm text-[#94a3b8] mb-1">vs {game.schedule.opponent}</div>
                <div className="text-2xl font-black">
                  <span className={game.result === 'WIN' ? 'text-[#22c55e]' : game.result === 'LOSE' ? 'text-[#ef4444]' : 'text-[#f59e0b]'}>
                    {game.ourScore}
                  </span>
                  <span className="text-[#1e3a5f] mx-2">-</span>
                  <span className="text-[#64748b]">{game.opponentScore}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {total === 0 && games.length === 0 && !nextSchedule && (
        <section className="max-w-7xl mx-auto px-4 py-20 text-center">
          <div className="text-[#64748b] text-lg">
            シーズンデータを読み込んでいます...
          </div>
        </section>
      )}
    </div>
  )
}
