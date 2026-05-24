import { prisma } from '@/lib/prisma'
import Link from 'next/link'

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })
}

export default async function ResultsPage() {
  const games = await prisma.game.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      schedule: true,
      stats: { include: { user: { select: { name: true, number: true } } } },
    },
  })

  const wins = games.filter((g) => g.result === 'WIN').length
  const losses = games.filter((g) => g.result === 'LOSE').length
  const draws = games.filter((g) => g.result === 'DRAW').length

  return (
    <div className="pt-16 max-w-7xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-[#e2e8f0] mb-2">試合結果</h1>
        <p className="text-[#64748b]">全試合の結果一覧</p>
      </div>

      {/* Season record */}
      {games.length > 0 && (
        <div className="glass-card rounded-2xl p-6 mb-8 flex flex-wrap gap-6 justify-center sm:justify-start">
          <div className="text-center">
            <div className="text-3xl font-black text-[#22c55e]">{wins}</div>
            <div className="text-xs text-[#64748b] mt-1 tracking-wider">WIN</div>
          </div>
          <div className="w-px bg-[#1e3a5f] hidden sm:block" />
          <div className="text-center">
            <div className="text-3xl font-black text-[#ef4444]">{losses}</div>
            <div className="text-xs text-[#64748b] mt-1 tracking-wider">LOSE</div>
          </div>
          <div className="w-px bg-[#1e3a5f] hidden sm:block" />
          <div className="text-center">
            <div className="text-3xl font-black text-[#f59e0b]">{draws}</div>
            <div className="text-xs text-[#64748b] mt-1 tracking-wider">DRAW</div>
          </div>
          <div className="w-px bg-[#1e3a5f] hidden sm:block" />
          <div className="text-center">
            <div className="text-3xl font-black text-[#e2e8f0]">{games.length}</div>
            <div className="text-xs text-[#64748b] mt-1 tracking-wider">TOTAL</div>
          </div>
          {games.length > 0 && (
            <>
              <div className="w-px bg-[#1e3a5f] hidden sm:block" />
              <div className="text-center">
                <div className="text-3xl font-black text-[#60a5fa]">
                  {Math.round((wins / games.length) * 100)}%
                </div>
                <div className="text-xs text-[#64748b] mt-1 tracking-wider">WIN RATE</div>
              </div>
            </>
          )}
        </div>
      )}

      {games.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center text-[#64748b]">
          試合結果はまだ登録されていません
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {games.map((game) => {
            const topHitter = game.stats
              .filter((s) => s.atBats > 0)
              .sort((a, b) => b.hits - a.hits)[0]

            return (
              <div key={game.id} className="glass-card rounded-2xl p-6 hover:border-[#2563eb]/40 transition-all">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-[80px]">
                      <span
                        className={
                          game.result === 'WIN'
                            ? 'badge-win text-base px-4 py-1'
                            : game.result === 'LOSE'
                              ? 'badge-lose text-base px-4 py-1'
                              : 'badge-draw text-base px-4 py-1'
                        }
                      >
                        {game.result === 'WIN' ? '勝利' : game.result === 'LOSE' ? '敗戦' : '引分'}
                      </span>
                    </div>

                    <div>
                      <div className="text-xs text-[#64748b] mb-1">{formatDate(game.schedule.date)}</div>
                      <div className="font-semibold text-[#e2e8f0]">
                        vs {game.schedule.opponent}
                      </div>
                      <div className="text-xs text-[#64748b]">📍 {game.schedule.location}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-3xl font-black tracking-tight">
                      <span
                        className={
                          game.result === 'WIN'
                            ? 'text-[#22c55e]'
                            : game.result === 'LOSE'
                              ? 'text-[#ef4444]'
                              : 'text-[#f59e0b]'
                        }
                      >
                        {game.ourScore}
                      </span>
                      <span className="text-[#1e3a5f] mx-3">–</span>
                      <span className="text-[#64748b]">{game.opponentScore}</span>
                    </div>

                    {topHitter && (
                      <div className="hidden sm:block text-right text-xs text-[#64748b]">
                        <div className="text-[#94a3b8] font-medium">{topHitter.user.name}</div>
                        <div>{topHitter.hits}/{topHitter.atBats} {topHitter.rbi > 0 ? `${topHitter.rbi}打点` : ''}</div>
                      </div>
                    )}
                  </div>
                </div>

                {game.note && (
                  <div className="mt-3 text-sm text-[#94a3b8] border-t border-[#1e3a5f] pt-3">
                    {game.note}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
