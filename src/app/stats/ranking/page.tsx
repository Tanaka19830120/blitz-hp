import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  getBattingStats,
  getTotalGames,
  getQualPaPerGame,
  type PlayerStats,
} from '@/lib/statsQueries'

type StatKey = 'avg' | 'rbi' | 'hits' | 'homeRuns'

const STAT_DEFS: Record<StatKey, { title: string; color: string; qualified: boolean; valueOf: (p: PlayerStats) => number; display: (p: PlayerStats) => string }> = {
  avg: {
    title: '打率',
    color: 'text-[#60a5fa]',
    qualified: true,
    valueOf: (p) => (p.atBats > 0 ? p.hits / p.atBats : 0),
    display: (p) => p.avg,
  },
  rbi: {
    title: '打点',
    color: 'text-[#fbbf24]',
    qualified: false,
    valueOf: (p) => p.rbi,
    display: (p) => String(p.rbi),
  },
  hits: {
    title: '安打',
    color: 'text-[#22c55e]',
    qualified: false,
    valueOf: (p) => p.hits,
    display: (p) => String(p.hits),
  },
  homeRuns: {
    title: '本塁打',
    color: 'text-[#ef4444]',
    qualified: false,
    valueOf: (p) => p.homeRuns,
    display: (p) => String(p.homeRuns),
  },
}

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ stat?: string; year?: string }>
}) {
  const sp = await searchParams
  const statKey = (sp.stat ?? 'avg') as StatKey
  if (!STAT_DEFS[statKey]) notFound()
  const def = STAT_DEFS[statKey]

  const isCareer = sp.year === 'all'
  const selectedYear = isCareer ? undefined : sp.year ? parseInt(sp.year) : undefined

  const [stats, totalGames, qualPaPerGame] = await Promise.all([
    getBattingStats(selectedYear),
    getTotalGames(selectedYear),
    getQualPaPerGame(),
  ])

  const qualThreshold = Math.floor(totalGames * qualPaPerGame)

  // 規定打席系（打率）は到達者のみ。それ以外は全員（試合出場者）。
  let pool = stats
  if (def.qualified) {
    const qualified = stats.filter((p) => p.plateAppearances >= qualThreshold && p.atBats > 0)
    pool = qualified.length > 0 ? qualified : stats.filter((p) => p.atBats > 0)
  }

  const ranked = [...pool].sort((a, b) => def.valueOf(b) - def.valueOf(a))

  // 同値は同順位（standard competition ranking: 1,2,2,4...）
  const rows = ranked.map((p, i) => ({ p, rank: i + 1 }))
  for (let i = 1; i < rows.length; i++) {
    if (def.valueOf(rows[i].p) === def.valueOf(rows[i - 1].p)) {
      rows[i].rank = rows[i - 1].rank
    }
  }

  const yearLabel = isCareer ? '通算' : selectedYear ? `${selectedYear}年` : '最新'
  const backHref = `/stats${isCareer ? '?year=all' : selectedYear ? `?year=${selectedYear}` : ''}`

  return (
    <div className="pt-16 max-w-3xl mx-auto px-4 py-12">
      <div className="flex items-center gap-2 text-sm text-[#64748b] mb-6">
        <Link href={backHref} className="hover:text-[#60a5fa] transition-colors">個人成績</Link>
        <span>›</span>
        <span className="text-[#94a3b8]">{def.title}ランキング</span>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-black text-[#e2e8f0] mb-1">
          <span className={def.color}>{def.title}</span>ランキング
        </h1>
        <p className="text-sm text-[#64748b]">
          {yearLabel}
          {def.qualified && qualThreshold > 0 && ` ・ 規定打席 ${qualThreshold}打席以上`}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center text-[#64748b]">
          対象データがありません
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[360px]">
              <thead>
                <tr className="border-b border-[#1e3a5f] text-xs text-[#64748b] uppercase tracking-wider">
                  <th className="text-center px-3 py-3 w-12">順位</th>
                  <th className="text-left px-3 py-3">選手</th>
                  <th className="text-center px-2 py-3 w-12">試合</th>
                  <th className="text-center px-2 py-3 w-12">打数</th>
                  <th className="text-center px-2 py-3 w-12">安打</th>
                  <th className={`text-center px-3 py-3 w-16 ${def.color}`}>{def.title}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, rank }) => (
                  <tr key={p.id} className="border-b border-[#0d1b2a] hover:bg-[#0d1b2a]/50 transition-colors">
                    <td className="text-center px-3 py-3">
                      <span className={`font-black ${
                        rank === 1 ? 'text-[#fbbf24]' : rank === 2 ? 'text-[#cbd5e1]' : rank === 3 ? 'text-[#d97706]' : 'text-[#475569]'
                      }`}>{rank}</span>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/members/${p.id}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                        {p.number != null && (
                          <span className="text-xs font-bold text-[#60a5fa] w-6 text-right">#{p.number}</span>
                        )}
                        <span className="font-semibold text-[#e2e8f0]">{p.name}</span>
                        {rank === 1 && <span className="text-xs">👑</span>}
                      </Link>
                    </td>
                    <td className="text-center px-2 py-3 text-[#94a3b8]">{p.games}</td>
                    <td className="text-center px-2 py-3 text-[#94a3b8]">{p.atBats}</td>
                    <td className="text-center px-2 py-3 text-[#94a3b8]">{p.hits}</td>
                    <td className={`text-center px-3 py-3 font-black text-base ${def.color}`}>{def.display(p)}</td>
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
