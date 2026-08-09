import { prisma } from '@/lib/prisma'
import Link from 'next/link'

export const revalidate = 3600
import {
  getBattingStats,
  getAvailableYears,
  getTotalGames,
  getQualPaPerGame,
  getQualIpPerGame,
  type PlayerStats,
} from '@/lib/statsQueries'

interface PitcherStats {
  id: string
  name: string
  number: number | null
  position: string | null
  games: number
  wins: number
  losses: number
  saves: number
  holds: number
  outs: number
  earnedRuns: number
  runsAllowed: number
  hitsAllowed: number
  strikeouts: number
  walks: number
  pitches: number
  era: string
}

function parseInnings(s: string): number {
  // "5回0/3" / "5回1/3" / "5回2/3" 形式（teams.one インポートデータ）
  const kanji = s.match(/^(\d+)回(\d)\/3/)
  if (kanji) return parseInt(kanji[1]) * 3 + parseInt(kanji[2])
  // "5" / "5.1" / "5.2" 形式（.1 = 1/3, .2 = 2/3）
  const n = parseFloat(s)
  if (isNaN(n) || n < 0) return 0
  const full = Math.floor(n)
  const frac = Math.min(Math.round((n - full) * 10), 2)
  return full * 3 + frac
}

function displayInnings(outs: number): string {
  const full = Math.floor(outs / 3)
  const frac = outs % 3
  if (frac === 0) return `${full}`
  return `${full} ${frac}/3`
}

async function getPitchingStats(year?: number, includeAlumni = false): Promise<PitcherStats[]> {
  let dateFilter: { gte?: Date; lte?: Date } | undefined
  if (year) {
    dateFilter = {
      gte: new Date(`${year}-01-01`),
      lte: new Date(`${year}-12-31T23:59:59`),
    }
  }

  const players = await prisma.user.findMany({
    where: includeAlumni
      ? { isGuest: false }
      : { isGuest: false, email: { endsWith: '@b' } },
    include: {
      pitchingStats: {
        include: {
          game: {
            include: { schedule: { select: { date: true } } },
          },
        },
        ...(dateFilter
          ? { where: { game: { schedule: { date: dateFilter } } } }
          : {}),
      },
    },
    orderBy: { name: 'asc' },
  })

  return players
    .map((p) => {
      const stats = p.pitchingStats
      if (stats.length === 0) return null

      const outs = stats.reduce((s, g) => s + parseInnings(g.innings), 0)
      const earnedRuns = stats.reduce((s, g) => s + g.earnedRuns, 0)

      return {
        id: p.id,
        name: p.name,
        number: p.number,
        position: p.position,
        games: stats.length,
        wins: stats.filter((g) => g.decision === '勝').length,
        losses: stats.filter((g) => g.decision === '負').length,
        saves: stats.filter((g) => g.decision === 'S').length,
        holds: stats.filter((g) => g.decision === 'H').length,
        outs,
        earnedRuns,
        runsAllowed: stats.reduce((s, g) => s + g.runsAllowed, 0),
        hitsAllowed: stats.reduce((s, g) => s + g.hitsAllowed, 0),
        strikeouts: stats.reduce((s, g) => s + g.strikeouts, 0),
        walks: stats.reduce((s, g) => s + g.walks, 0),
        pitches: stats.reduce((s, g) => s + g.pitches, 0),
        // ERA = earnedRuns × 7 / inningsPitched (7-inning softball)
        era: outs > 0 ? (earnedRuns * 21 / outs).toFixed(2) : '---',
      }
    })
    .filter((p): p is PitcherStats => p !== null)
    .sort((a, b) => {
      if (a.era === '---' && b.era === '---') return 0
      if (a.era === '---') return 1
      if (b.era === '---') return -1
      return parseFloat(a.era) - parseFloat(b.era)
    })
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; mode?: string }>
}) {
  const sp = await searchParams
  const years = await getAvailableYears()

  const isCareer = sp.year === 'all'
  const selectedYear = isCareer
    ? undefined
    : sp.year
      ? parseInt(sp.year)
      : years[0]

  const isAllTime = sp.mode === 'all'

  const [stats, pitchingStats, totalGames, qualPaPerGame, qualIpPerGame] = await Promise.all([
    getBattingStats(selectedYear, isAllTime),
    getPitchingStats(selectedYear, isAllTime),
    getTotalGames(selectedYear),
    getQualPaPerGame(),
    getQualIpPerGame(),
  ])

  // ── 出場試合数ランキング ──
  const streakRanking = await (async () => {
    const dateFilter = selectedYear
      ? { gte: new Date(`${selectedYear}-01-01`), lte: new Date(`${selectedYear}-12-31T23:59:59`) }
      : undefined
    const [players, teamTotal] = await Promise.all([
      prisma.user.findMany({
        where: isAllTime ? { isGuest: false } : { isGuest: false, email: { endsWith: '@b' } },
        select: {
          id: true, name: true, number: true,
          gameStats: {
            where: dateFilter ? { game: { schedule: { date: dateFilter } } } : {},
            select: { id: true },
          },
        },
      }),
      prisma.game.count({ where: dateFilter ? { schedule: { date: dateFilter } } : {} }),
    ])
    return players
      .map(p => ({
        id: p.id, name: p.name, number: p.number,
        total: p.gameStats.length,
        rate: teamTotal > 0 ? Math.round(p.gameStats.length / teamTotal * 100) : 0,
      }))
      .filter(p => p.total > 0)
      .sort((a, b) => b.total - a.total)
  })()


  // ランキングリンクの year クエリ（通算は all、年指定はその年、デフォルトは最新年）
  const rankYearParam = isCareer ? 'all' : selectedYear != null ? String(selectedYear) : ''
  // mode クエリを year リンクに引き継ぐ
  const modeParam = isAllTime ? '&mode=all' : ''

  // Only split into qualified/not-qualified when there are actually qualified players.
  // In career mode the threshold is very high, so everyone typically falls into notQualified
  // — showing all rows at opacity-60 makes batting averages invisible.
  const qualThreshold = Math.floor(totalGames * qualPaPerGame)
  const qualified = stats.filter((p) => p.plateAppearances >= qualThreshold)
  const notQualified = stats.filter((p) => p.plateAppearances < qualThreshold)
  const showQualSplit = qualified.length > 0

  // Top 3 rankings (from qualified players only when split is shown, otherwise all)
  const rankingPool = showQualSplit ? qualified : stats
  const topAvg = [...rankingPool]
    .filter((p) => p.atBats >= 5)
    .sort((a, b) => {
      const ra = a.atBats > 0 ? a.hits / a.atBats : 0
      const rb = b.atBats > 0 ? b.hits / b.atBats : 0
      return rb - ra
    })
    .slice(0, 3)

  const topRbi = [...stats].sort((a, b) => b.rbi - a.rbi).slice(0, 3)
  const topHits = [...stats].sort((a, b) => b.hits - a.hits).slice(0, 3)
  const topHr = [...stats].filter((p) => p.homeRuns > 0).sort((a, b) => b.homeRuns - a.homeRuns).slice(0, 3)

  // Batting table sections
  const battingSections: { label: string; players: PlayerStats[]; muted: boolean }[] = showQualSplit
    ? [
        { label: '規定打席到達者', players: qualified, muted: false },
        { label: '規定打席未到達者', players: notQualified, muted: true },
      ]
    : [
        { label: '', players: stats, muted: false },
      ]

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="mb-4">
        <h1 className="text-3xl font-black text-[#e2e8f0] mb-2">個人成績</h1>
        <p className="text-[#64748b]">打撃・投手個人成績</p>
      </div>

      {/* 現メンバー / 歴代全員 切り替え */}
      <div className="flex gap-2 mb-5">
        <Link
          href={`/stats${selectedYear && !isCareer ? `?year=${selectedYear}` : isCareer ? '?year=all' : ''}`}
          className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
            !isAllTime
              ? 'bg-[#2563eb] border-[#2563eb] text-white'
              : 'border-[#1e3a5f] text-[#64748b] hover:border-[#2563eb]/50 hover:text-[#94a3b8]'
          }`}
        >
          現メンバー
        </Link>
        <Link
          href={`/stats?mode=all${selectedYear && !isCareer ? `&year=${selectedYear}` : isCareer ? '&year=all' : ''}`}
          className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
            isAllTime
              ? 'bg-[#8b5cf6] border-[#8b5cf6] text-white'
              : 'border-[#1e3a5f] text-[#64748b] hover:border-[#8b5cf6]/50 hover:text-[#94a3b8]'
          }`}
        >
          歴代全員
        </Link>
      </div>

      {/* Season tabs */}
      <div className="flex flex-wrap gap-2 mb-8">
        <Link
          href={`/stats?year=all${modeParam}`}
          className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
            isCareer
              ? 'bg-[#2563eb] border-[#2563eb] text-white'
              : 'border-[#1e3a5f] text-[#64748b] hover:border-[#2563eb]/50 hover:text-[#94a3b8]'
          }`}
        >
          通算
        </Link>
        {years.map((year) => (
          <Link
            key={year}
            href={`/stats?year=${year}${modeParam}`}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
              !isCareer && selectedYear === year
                ? 'bg-[#2563eb] border-[#2563eb] text-white'
                : 'border-[#1e3a5f] text-[#64748b] hover:border-[#2563eb]/50 hover:text-[#94a3b8]'
            }`}
          >
            {year}年
            {year === years[0] && <span className="ml-1 text-[10px] text-[#60a5fa]">●</span>}
          </Link>
        ))}
      </div>

      {/* Rankings */}
      {stats.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {([
            { title: '打率', stat: 'avg', data: topAvg, key: 'avg' as const, color: 'text-[#60a5fa]' },
            { title: '打点', stat: 'rbi', data: topRbi, key: 'rbi' as const, color: 'text-[#fbbf24]' },
            { title: '安打', stat: 'hits', data: topHits, key: 'hits' as const, color: 'text-[#22c55e]' },
            { title: '本塁打', stat: 'homeRuns', data: topHr, key: 'homeRuns' as const, color: 'text-[#ef4444]' },
          ] as const).map(({ title, stat, data, key, color }) => (
            <div key={title} className="glass-card rounded-xl p-4">
              <Link
                href={`/stats/ranking?stat=${stat}${rankYearParam ? `&year=${rankYearParam}` : ''}`}
                className="flex items-center justify-between text-xs font-bold text-[#64748b] tracking-wider mb-3 hover:text-[#60a5fa] transition-colors group"
              >
                <span>{title}ランキング</span>
                <span className="text-[#475569] group-hover:text-[#60a5fa]">全順位 ›</span>
              </Link>
              {data.length === 0 ? (
                <div className="text-xs text-[#475569]">—</div>
              ) : (
                data.map((p, i) => (
                  <div key={p.id} className="flex items-center justify-between py-1 border-b border-[#0f2035]/50 last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-xs font-black w-4 ${i === 0 ? 'text-[#fbbf24]' : 'text-[#475569]'}`}>{i + 1}</span>
                      <Link href={`/members/${p.id}`} className="text-xs text-[#94a3b8] hover:text-[#e2e8f0] truncate transition-colors">
                        {p.name}
                      </Link>
                    </div>
                    <span className={`text-sm font-black ${color} ml-2`}>{p[key]}</span>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      )}

      {/* 投手ランキングカード */}
      {pitchingStats.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-8">
          {([
            { title: '防御率', stat: 'era',  color: 'text-[#a78bfa]', top: [...pitchingStats].sort((a,b) => a.era==='---'?1:b.era==='---'?-1:parseFloat(a.era)-parseFloat(b.era)).slice(0,3), display: (p: typeof pitchingStats[0]) => p.era },
            { title: '勝利数', stat: 'wins', color: 'text-[#34d399]', top: [...pitchingStats].sort((a,b) => b.wins-a.wins).slice(0,3),                                                              display: (p: typeof pitchingStats[0]) => String(p.wins) },
          ] as const).map(({ title, stat, color, top, display }) => (
            <div key={title} className="glass-card rounded-xl p-4">
              <Link
                href={`/stats/ranking?stat=${stat}${rankYearParam ? `&year=${rankYearParam}` : ''}`}
                className="flex items-center justify-between text-xs font-bold text-[#64748b] tracking-wider mb-3 hover:text-[#a78bfa] transition-colors group"
              >
                <span>{title}ランキング</span>
                <span className="text-[#475569] group-hover:text-[#a78bfa]">全順位 ›</span>
              </Link>
              {top.length === 0 ? <div className="text-xs text-[#475569]">—</div> : top.map((p, i) => (
                <div key={p.id} className="flex items-center justify-between py-1 border-b border-[#0f2035]/50 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-xs font-black w-4 ${i===0?'text-[#fbbf24]':'text-[#475569]'}`}>{i+1}</span>
                    <Link href={`/members/${p.id}`} className="text-xs text-[#94a3b8] hover:text-[#e2e8f0] truncate transition-colors">{p.name}</Link>
                  </div>
                  <span className={`text-sm font-black ${color} ml-2`}>{display(p)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {stats.length === 0 && pitchingStats.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center text-[#64748b]">
          {selectedYear ? `${selectedYear}年の成績データはありません` : '成績データはまだ登録されていません'}
        </div>
      ) : (
        <>
          {/* ── 打撃成績 ── */}
          {stats.length > 0 && (
            <div className="mb-10">
              <h2 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase mb-4">打撃成績</h2>
              {battingSections.map(({ label, players, muted }) =>
                players.length === 0 ? null : (
                  <div key={label || 'all'} className="mb-6">
                    {label && (
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs font-semibold text-[#94a3b8]">{label}</span>
                        {qualThreshold > 0 && (
                          <span className="text-xs text-[#475569]">規定: {qualThreshold}打席以上</span>
                        )}
                      </div>
                    )}
                    <div className="glass-card rounded-2xl">
                      <p className="text-[10px] text-[#475569] pt-3 px-4">← 横スクロールで全成績を確認</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[1100px]">
                          <thead>
                            <tr className="border-b border-[#1e3a5f]">
                              <th className="text-left px-4 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">選手</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">試合</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">打席</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">打数</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">安打</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">2B</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">3B</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">本</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">打点</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">得点</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">盗塁</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">四球</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">三振</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">死球</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">犠打</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">犠飛</th>
                              <th className="text-center px-3 py-4 text-xs font-bold tracking-wider text-[#60a5fa] uppercase">打率</th>
                              <th className="text-center px-3 py-4 text-xs font-bold tracking-wider text-[#94a3b8] uppercase">出塁率</th>
                              <th className="text-center px-3 py-4 text-xs font-bold tracking-wider text-[#94a3b8] uppercase">長打率</th>
                            </tr>
                          </thead>
                          <tbody>
                            {players.map((p, i) => (
                              <tr
                                key={p.id}
                                className={`border-b border-[#0d1b2a]/40 hover:bg-[#0d1b2a]/50 transition-colors ${
                                  !muted && i === 0 ? 'bg-[#1a2744]/30' : i % 2 === 1 ? 'bg-white/[0.03]' : ''
                                } ${muted ? 'opacity-75' : ''}`}
                              >
                                <td className="px-4 py-3">
                                  <Link href={`/members/${p.id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                                    {p.number != null && (
                                      <span className="text-xs font-bold text-[#60a5fa] w-6 text-right">
                                        #{p.number}
                                      </span>
                                    )}
                                    <div>
                                      <div className="font-semibold text-[#e2e8f0] flex items-center gap-2">
                                        {p.name}
                                        {!muted && i === 0 && <span className="text-xs text-[#fbbf24]">👑</span>}
                                      </div>
                                      {p.position && (
                                        <div className="text-xs text-[#64748b]">{p.position}</div>
                                      )}
                                    </div>
                                  </Link>
                                </td>
                                <td className="text-center px-2 py-3 text-[#94a3b8]">{p.games}</td>
                                <td className="text-center px-2 py-3 text-[#94a3b8]">{p.plateAppearances}</td>
                                <td className="text-center px-2 py-3 text-[#94a3b8]">{p.atBats}</td>
                                <td className="text-center px-2 py-3 text-[#94a3b8]">{p.hits}</td>
                                <td className="text-center px-2 py-3 text-[#94a3b8]">{p.doubles}</td>
                                <td className="text-center px-2 py-3 text-[#94a3b8]">{p.triples}</td>
                                <td className="text-center px-2 py-3">{p.homeRuns > 0 ? <span className="text-[#fbbf24] font-bold">{p.homeRuns}</span> : <span className="text-[#475569]">0</span>}</td>
                                <td className="text-center px-2 py-3">{p.rbi > 0 ? <span className="text-[#60a5fa]">{p.rbi}</span> : <span className="text-[#475569]">0</span>}</td>
                                <td className="text-center px-2 py-3 text-[#94a3b8]">{p.runs}</td>
                                <td className="text-center px-2 py-3 text-[#94a3b8]">{p.stolenBases}</td>
                                <td className="text-center px-2 py-3 text-[#94a3b8]">{p.walks}</td>
                                <td className="text-center px-2 py-3 text-[#94a3b8]">{p.strikeouts}</td>
                                <td className="text-center px-2 py-3 text-[#94a3b8]">{p.hitByPitch}</td>
                                <td className="text-center px-2 py-3 text-[#94a3b8]">{p.sacrificeBunts}</td>
                                <td className="text-center px-2 py-3 text-[#94a3b8]">{p.sacrificeFlies}</td>
                                <td className="text-center px-3 py-3">
                                  <span className={`font-black text-base ${
                                    p.avg === '---'
                                      ? 'text-[#64748b]'
                                      : parseFloat(p.avg) >= 0.3
                                        ? 'text-[#22c55e]'
                                        : parseFloat(p.avg) >= 0.2
                                          ? 'text-[#60a5fa]'
                                          : 'text-[#94a3b8]'
                                  }`}>
                                    {p.avg}
                                  </span>
                                </td>
                                <td className="text-center px-3 py-3 text-[#94a3b8] font-mono text-xs">{p.obp}</td>
                                <td className="text-center px-3 py-3 text-[#94a3b8] font-mono text-xs">{p.slg}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {/* ── 投手成績 ── */}
          {pitchingStats.length > 0 && (() => {
            const ipThresholdOuts = Math.floor(totalGames * qualIpPerGame) * 3
            const qualifiedP   = pitchingStats.filter(p => p.outs >= ipThresholdOuts)
            const notQualifiedP = pitchingStats.filter(p => p.outs < ipThresholdOuts)
            const showIpSplit   = qualifiedP.length > 0 && notQualifiedP.length > 0

            const pitchingSections: { label: string; players: typeof pitchingStats; muted: boolean }[] = showIpSplit
              ? [
                  { label: `規定投球回到達者（${Math.floor(totalGames * qualIpPerGame)}回以上）`, players: qualifiedP, muted: false },
                  { label: '規定投球回未到達者', players: notQualifiedP, muted: true },
                ]
              : [{ label: '', players: pitchingStats, muted: false }]

            const PitcherTable = ({ players, muted }: { players: typeof pitchingStats; muted: boolean }) => (
              <div className={`glass-card rounded-2xl ${muted ? 'opacity-60' : ''}`}>
                <p className="text-[10px] text-[#475569] pt-3 px-4">← 横スクロールで全成績を確認</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead>
                      <tr className="border-b border-[#1e3a5f]">
                        <th className="text-left px-4 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">選手</th>
                        <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">試合</th>
                        <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">勝</th>
                        <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">負</th>
                        <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">S</th>
                        <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">H</th>
                        <th className="text-center px-3 py-4 text-xs font-bold tracking-wider text-[#a78bfa] uppercase">防御率</th>
                        <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">投球回</th>
                        <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">奪三振</th>
                        <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">与四球</th>
                        <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">被安打</th>
                        <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">自責点</th>
                        <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">投球数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {players.map((p, i) => (
                        <tr
                          key={p.id}
                          className={`border-b border-[#0d1b2a] hover:bg-[#0d1b2a]/50 transition-colors ${
                            i === 0 && !muted ? 'bg-[#1a1a44]/30' : ''
                          }`}
                        >
                          <td className="px-4 py-3">
                            <Link href={`/members/${p.id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                              {p.number != null && (
                                <span className="text-xs font-bold text-[#a78bfa] w-6 text-right">
                                  #{p.number}
                                </span>
                              )}
                              <div>
                                <div className="font-semibold text-[#e2e8f0] flex items-center gap-2">
                                  {p.name}
                                  {i === 0 && p.era !== '---' && <span className="text-xs text-[#a78bfa]">🏆</span>}
                                </div>
                                {p.position && (
                                  <div className="text-xs text-[#64748b]">{p.position}</div>
                                )}
                              </div>
                            </Link>
                          </td>
                          <td className="text-center px-2 py-3 text-[#94a3b8]">{p.games}</td>
                          <td className="text-center px-2 py-3">
                            {p.wins > 0 ? <span className="text-[#22c55e] font-bold">{p.wins}</span> : <span className="text-[#475569]">0</span>}
                          </td>
                          <td className="text-center px-2 py-3">
                            {p.losses > 0 ? <span className="text-[#ef4444]">{p.losses}</span> : <span className="text-[#475569]">0</span>}
                          </td>
                          <td className="text-center px-2 py-3">
                            {p.saves > 0 ? <span className="text-[#60a5fa] font-bold">{p.saves}</span> : <span className="text-[#475569]">0</span>}
                          </td>
                          <td className="text-center px-2 py-3">
                            {p.holds > 0 ? <span className="text-[#fbbf24]">{p.holds}</span> : <span className="text-[#475569]">0</span>}
                          </td>
                          <td className="text-center px-3 py-3">
                            <span className={`font-black text-base ${
                              p.era === '---'
                                ? 'text-[#64748b]'
                                : parseFloat(p.era) <= 2.0
                                  ? 'text-[#22c55e]'
                                  : parseFloat(p.era) <= 4.0
                                    ? 'text-[#60a5fa]'
                                    : 'text-[#94a3b8]'
                            }`}>
                              {p.era}
                            </span>
                          </td>
                          <td className="text-center px-2 py-3 text-[#94a3b8] font-mono text-xs">{displayInnings(p.outs)}</td>
                          <td className="text-center px-2 py-3 text-[#94a3b8]">{p.strikeouts}</td>
                          <td className="text-center px-2 py-3 text-[#94a3b8]">{p.walks}</td>
                          <td className="text-center px-2 py-3 text-[#94a3b8]">{p.hitsAllowed}</td>
                          <td className="text-center px-2 py-3 text-[#94a3b8]">{p.earnedRuns}</td>
                          <td className="text-center px-2 py-3 text-[#64748b] text-xs">{p.pitches > 0 ? p.pitches : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    </table>
                  </div>
                </div>
              )

            return (
              <div className="mb-10">
                <h2 className="text-xs font-bold tracking-[0.3em] text-[#a78bfa] uppercase mb-1">投手成績</h2>
                {pitchingSections.map(({ label, players, muted }) => (
                  <div key={label} className="mb-4">
                    {label && (
                      <p className="text-[10px] text-[#475569] mb-2">{label}</p>
                    )}
                    <PitcherTable players={players} muted={muted} />
                  </div>
                ))}
              </div>
            )
          })()}
        </>
      )}

      {/* 出場試合数ランキング */}
      {streakRanking.length > 0 && (
        <div className="glass-card rounded-2xl p-5 mt-6">
          <h2 className="text-xs font-bold tracking-[0.3em] text-[#fbbf24] uppercase mb-4">
            ⚾ 出場試合数ランキング
          </h2>
          <div className="flex flex-col gap-1.5">
            {streakRanking.map((p, i) => {
              const pct = streakRanking[0].total > 0 ? p.total / streakRanking[0].total * 100 : 0
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
              return (
                <a key={p.id} href={`/members/${p.id}`}
                  className="relative flex items-center gap-3 px-4 py-2.5 rounded-xl border border-[#1e3a5f] hover:border-[#2a4a6f] transition-all overflow-hidden group">
                  <div className="absolute inset-0 bg-[#fbbf24]/5" style={{ width: `${pct}%` }}/>
                  <div className="relative flex items-center gap-3 w-full">
                    <span className="w-6 text-center text-sm shrink-0">
                      {medal ?? <span className="text-xs text-[#475569]">{i + 1}</span>}
                    </span>
                    <span className="flex-1 text-sm text-[#e2e8f0] font-medium group-hover:text-[#60a5fa] transition-colors">
                      {p.name}
                      {p.number != null && <span className="text-xs text-[#475569] ml-1.5">#{p.number}</span>}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="text-lg font-black text-[#fbbf24]">{p.total}</span>
                      <span className="text-xs text-[#64748b] ml-1">試合</span>
                      <span className={`text-xs ml-2 ${p.rate >= 80 ? 'text-[#22c55e]' : p.rate >= 50 ? 'text-[#94a3b8]' : 'text-[#475569]'}`}>
                        ({p.rate}%)
                      </span>
                    </span>
                  </div>
                </a>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}
