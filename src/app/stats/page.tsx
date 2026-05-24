import { prisma } from '@/lib/prisma'

interface PlayerStats {
  id: string
  name: string
  number: number | null
  position: string | null
  games: number
  atBats: number
  hits: number
  rbi: number
  runs: number
  walks: number
  avg: string
}

async function getSeasonStats(): Promise<PlayerStats[]> {
  const players = await prisma.user.findMany({
    where: { role: 'PLAYER' },
    include: {
      gameStats: {
        include: { game: { select: { result: true } } },
      },
    },
    orderBy: { name: 'asc' },
  })

  return players
    .map((p) => {
      const stats = p.gameStats
      const atBats = stats.reduce((s, g) => s + g.atBats, 0)
      const hits = stats.reduce((s, g) => s + g.hits, 0)
      return {
        id: p.id,
        name: p.name,
        number: p.number,
        position: p.position,
        games: stats.length,
        atBats,
        hits,
        rbi: stats.reduce((s, g) => s + g.rbi, 0),
        runs: stats.reduce((s, g) => s + g.runs, 0),
        walks: stats.reduce((s, g) => s + g.walks, 0),
        avg: atBats > 0 ? (hits / atBats).toFixed(3).replace('0.', '.') : '---',
      }
    })
    .filter((p) => p.games > 0)
    .sort((a, b) => {
      const avgA = a.atBats > 0 ? a.hits / a.atBats : 0
      const avgB = b.atBats > 0 ? b.hits / b.atBats : 0
      return avgB - avgA
    })
}

export default async function StatsPage() {
  const stats = await getSeasonStats()

  return (
    <div className="pt-16 max-w-7xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-[#e2e8f0] mb-2">個人成績</h1>
        <p className="text-[#64748b]">今シーズンの個人打撃成績</p>
      </div>

      {stats.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center text-[#64748b]">
          成績データはまだ登録されていません
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e3a5f]">
                  <th className="text-left px-4 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">選手</th>
                  <th className="text-center px-3 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">試合</th>
                  <th className="text-center px-3 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">打数</th>
                  <th className="text-center px-3 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">安打</th>
                  <th className="text-center px-3 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">打点</th>
                  <th className="text-center px-3 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">得点</th>
                  <th className="text-center px-3 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">四球</th>
                  <th className="text-center px-3 py-4 text-xs font-bold tracking-wider text-[#60a5fa] uppercase">打率</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((p, i) => (
                  <tr
                    key={p.id}
                    className={`border-b border-[#0d1b2a] hover:bg-[#0d1b2a]/50 transition-colors ${
                      i === 0 ? 'bg-[#1a2744]/30' : ''
                    }`}
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        {p.number != null && (
                          <span className="text-xs font-bold text-[#60a5fa] w-6 text-right">
                            #{p.number}
                          </span>
                        )}
                        <div>
                          <div className="font-semibold text-[#e2e8f0] flex items-center gap-2">
                            {p.name}
                            {i === 0 && (
                              <span className="text-xs text-[#fbbf24]">👑</span>
                            )}
                          </div>
                          {p.position && (
                            <div className="text-xs text-[#64748b]">{p.position}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="text-center px-3 py-4 text-[#94a3b8]">{p.games}</td>
                    <td className="text-center px-3 py-4 text-[#94a3b8]">{p.atBats}</td>
                    <td className="text-center px-3 py-4 text-[#94a3b8]">{p.hits}</td>
                    <td className="text-center px-3 py-4 text-[#94a3b8]">{p.rbi}</td>
                    <td className="text-center px-3 py-4 text-[#94a3b8]">{p.runs}</td>
                    <td className="text-center px-3 py-4 text-[#94a3b8]">{p.walks}</td>
                    <td className="text-center px-3 py-4">
                      <span
                        className={`font-black text-base ${
                          p.avg === '---'
                            ? 'text-[#64748b]'
                            : parseFloat(p.avg) >= 0.3
                              ? 'text-[#22c55e]'
                              : parseFloat(p.avg) >= 0.2
                                ? 'text-[#60a5fa]'
                                : 'text-[#94a3b8]'
                        }`}
                      >
                        {p.avg}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
