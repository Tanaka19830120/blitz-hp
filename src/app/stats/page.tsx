import { prisma } from '@/lib/prisma'
import Link from 'next/link'

interface PlayerStats {
  id: string
  name: string
  number: number | null
  position: string | null
  games: number
  plateAppearances: number
  atBats: number
  hits: number
  doubles: number
  triples: number
  homeRuns: number
  rbi: number
  runs: number
  stolenBases: number
  walks: number
  strikeouts: number
  hitByPitch: number
  sacrificeBunts: number
  sacrificeFlies: number
  avg: string
  obp: string
  slg: string
}

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

async function getStats(year?: number): Promise<PlayerStats[]> {
  let dateFilter: { gte?: Date; lte?: Date } | undefined
  if (year) {
    dateFilter = {
      gte: new Date(`${year}-01-01`),
      lte: new Date(`${year}-12-31T23:59:59`),
    }
  }

  const players = await prisma.user.findMany({
    include: {
      gameStats: {
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
      const stats = p.gameStats
      const pa = stats.reduce((s, g) => s + g.plateAppearances, 0)
      const ab = stats.reduce((s, g) => s + g.atBats, 0)
      const h = stats.reduce((s, g) => s + g.hits, 0)
      const d = stats.reduce((s, g) => s + g.doubles, 0)
      const t = stats.reduce((s, g) => s + g.triples, 0)
      const hr = stats.reduce((s, g) => s + g.homeRuns, 0)
      const bb = stats.reduce((s, g) => s + g.walks, 0)
      const hbp = stats.reduce((s, g) => s + g.hitByPitch, 0)
      const sf = stats.reduce((s, g) => s + g.sacrificeFlies, 0)

      const obpDenom = ab + bb + hbp + sf
      const obpVal = obpDenom > 0 ? (h + bb + hbp) / obpDenom : 0

      const singles = h - d - t - hr
      const slgVal = ab > 0 ? (singles + 2 * d + 3 * t + 4 * hr) / ab : 0

      return {
        id: p.id,
        name: p.name,
        number: p.number,
        position: p.position,
        games: stats.length,
        plateAppearances: pa,
        atBats: ab,
        hits: h,
        doubles: d,
        triples: t,
        homeRuns: hr,
        rbi: stats.reduce((s, g) => s + g.rbi, 0),
        runs: stats.reduce((s, g) => s + g.runs, 0),
        stolenBases: stats.reduce((s, g) => s + g.stolenBases, 0),
        walks: bb,
        strikeouts: stats.reduce((s, g) => s + g.strikeouts, 0),
        hitByPitch: hbp,
        sacrificeBunts: stats.reduce((s, g) => s + g.sacrificeBunts, 0),
        sacrificeFlies: sf,
        avg: ab > 0 ? (h / ab).toFixed(3).replace('0.', '.') : '---',
        obp: obpDenom > 0 ? obpVal.toFixed(3).replace('0.', '.') : '---',
        slg: ab > 0 ? slgVal.toFixed(3).replace('0.', '.') : '---',
      }
    })
    .filter((p) => p.games > 0)
    .sort((a, b) => {
      const avgA = a.atBats > 0 ? a.hits / a.atBats : 0
      const avgB = b.atBats > 0 ? b.hits / b.atBats : 0
      return avgB - avgA
    })
}

async function getPitchingStats(year?: number): Promise<PitcherStats[]> {
  let dateFilter: { gte?: Date; lte?: Date } | undefined
  if (year) {
    dateFilter = {
      gte: new Date(`${year}-01-01`),
      lte: new Date(`${year}-12-31T23:59:59`),
    }
  }

  const players = await prisma.user.findMany({
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

async function getAvailableYears(): Promise<number[]> {
  const schedules = await prisma.schedule.findMany({
    where: { game: { isNot: null } },
    select: { date: true },
    orderBy: { date: 'asc' },
  })
  const years = [...new Set(schedules.map((s) => new Date(s.date).getFullYear()))]
  return years.sort((a, b) => b - a)
}

async function getTotalGames(year?: number): Promise<number> {
  let dateFilter: { gte?: Date; lte?: Date } | undefined
  if (year) {
    dateFilter = {
      gte: new Date(`${year}-01-01`),
      lte: new Date(`${year}-12-31T23:59:59`),
    }
  }
  return prisma.game.count({
    where: dateFilter ? { schedule: { date: dateFilter } } : undefined,
  })
}

async function getQualPaPerGame(): Promise<number> {
  try {
    const s = await prisma.setting.findUnique({ where: { key: 'qualPaPerGame' } })
    const v = s ? parseFloat(s.value) : NaN
    return isNaN(v) || v <= 0 ? 2.0 : v
  } catch {
    return 2.0
  }
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const sp = await searchParams
  const years = await getAvailableYears()
  const currentYear = new Date().getFullYear()
  const selectedYear = sp.year ? parseInt(sp.year) : undefined

  const [stats, pitchingStats, totalGames, qualPaPerGame] = await Promise.all([
    getStats(selectedYear),
    getPitchingStats(selectedYear),
    getTotalGames(selectedYear),
    getQualPaPerGame(),
  ])

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
    <div className="pt-16 max-w-7xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-[#e2e8f0] mb-2">個人成績</h1>
        <p className="text-[#64748b]">打撃・投手個人成績</p>
      </div>

      {/* Season tabs */}
      <div className="flex flex-wrap gap-2 mb-8">
        <Link
          href="/stats"
          className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
            !selectedYear
              ? 'bg-[#2563eb] border-[#2563eb] text-white'
              : 'border-[#1e3a5f] text-[#64748b] hover:border-[#2563eb]/50 hover:text-[#94a3b8]'
          }`}
        >
          通算
        </Link>
        {years.map((year) => (
          <Link
            key={year}
            href={`/stats?year=${year}`}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
              selectedYear === year
                ? 'bg-[#2563eb] border-[#2563eb] text-white'
                : 'border-[#1e3a5f] text-[#64748b] hover:border-[#2563eb]/50 hover:text-[#94a3b8]'
            }`}
          >
            {year}年
            {year === currentYear && <span className="ml-1 text-[10px] text-[#60a5fa]">●</span>}
          </Link>
        ))}
      </div>

      {/* Rankings */}
      {stats.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            { title: '打率', data: topAvg, key: 'avg' as const, color: 'text-[#60a5fa]' },
            { title: '打点', data: topRbi, key: 'rbi' as const, color: 'text-[#fbbf24]' },
            { title: '安打', data: topHits, key: 'hits' as const, color: 'text-[#22c55e]' },
            { title: '本塁打', data: topHr, key: 'homeRuns' as const, color: 'text-[#ef4444]' },
          ].map(({ title, data, key, color }) => (
            <div key={title} className="glass-card rounded-xl p-4">
              <div className="text-xs font-bold text-[#64748b] tracking-wider mb-3">{title}ランキング</div>
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
                    <div className="glass-card rounded-2xl overflow-hidden">
                      <p className="text-[10px] text-[#475569] pt-3 px-4 sm:hidden">← 横スクロールで全成績を確認</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[380px]">
                          <thead>
                            <tr className="border-b border-[#1e3a5f]">
                              <th className="text-left px-4 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">選手</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase hidden sm:table-cell">試合</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase hidden sm:table-cell">打席</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">打数</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">安打</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase hidden sm:table-cell">2B</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase hidden sm:table-cell">3B</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase hidden sm:table-cell">本</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">打点</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase hidden sm:table-cell">得点</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase hidden sm:table-cell">盗塁</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase hidden sm:table-cell">四球</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase hidden sm:table-cell">三振</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase hidden sm:table-cell">死球</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase hidden sm:table-cell">犠打</th>
                              <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase hidden sm:table-cell">犠飛</th>
                              <th className="text-center px-3 py-4 text-xs font-bold tracking-wider text-[#60a5fa] uppercase">打率</th>
                              <th className="text-center px-3 py-4 text-xs font-bold tracking-wider text-[#94a3b8] uppercase hidden sm:table-cell">出塁率</th>
                              <th className="text-center px-3 py-4 text-xs font-bold tracking-wider text-[#94a3b8] uppercase hidden sm:table-cell">長打率</th>
                            </tr>
                          </thead>
                          <tbody>
                            {players.map((p, i) => (
                              <tr
                                key={p.id}
                                className={`border-b border-[#0d1b2a] hover:bg-[#0d1b2a]/50 transition-colors ${
                                  !muted && i === 0 ? 'bg-[#1a2744]/30' : ''
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
                                <td className="text-center px-2 py-3 text-[#94a3b8] hidden sm:table-cell">{p.games}</td>
                                <td className="text-center px-2 py-3 text-[#94a3b8] hidden sm:table-cell">{p.plateAppearances}</td>
                                <td className="text-center px-2 py-3 text-[#94a3b8]">{p.atBats}</td>
                                <td className="text-center px-2 py-3 text-[#94a3b8]">{p.hits}</td>
                                <td className="text-center px-2 py-3 text-[#94a3b8] hidden sm:table-cell">{p.doubles}</td>
                                <td className="text-center px-2 py-3 text-[#94a3b8] hidden sm:table-cell">{p.triples}</td>
                                <td className="text-center px-2 py-3 hidden sm:table-cell">{p.homeRuns > 0 ? <span className="text-[#fbbf24] font-bold">{p.homeRuns}</span> : <span className="text-[#475569]">0</span>}</td>
                                <td className="text-center px-2 py-3">{p.rbi > 0 ? <span className="text-[#60a5fa]">{p.rbi}</span> : <span className="text-[#475569]">0</span>}</td>
                                <td className="text-center px-2 py-3 text-[#94a3b8] hidden sm:table-cell">{p.runs}</td>
                                <td className="text-center px-2 py-3 text-[#94a3b8] hidden sm:table-cell">{p.stolenBases}</td>
                                <td className="text-center px-2 py-3 text-[#94a3b8] hidden sm:table-cell">{p.walks}</td>
                                <td className="text-center px-2 py-3 text-[#94a3b8] hidden sm:table-cell">{p.strikeouts}</td>
                                <td className="text-center px-2 py-3 text-[#94a3b8] hidden sm:table-cell">{p.hitByPitch}</td>
                                <td className="text-center px-2 py-3 text-[#94a3b8] hidden sm:table-cell">{p.sacrificeBunts}</td>
                                <td className="text-center px-2 py-3 text-[#94a3b8] hidden sm:table-cell">{p.sacrificeFlies}</td>
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
                                <td className="text-center px-3 py-3 text-[#94a3b8] font-mono text-xs hidden sm:table-cell">{p.obp}</td>
                                <td className="text-center px-3 py-3 text-[#94a3b8] font-mono text-xs hidden sm:table-cell">{p.slg}</td>
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
          {pitchingStats.length > 0 && (
            <div className="mb-10">
              <h2 className="text-xs font-bold tracking-[0.3em] text-[#a78bfa] uppercase mb-4">投手成績</h2>
              <div className="glass-card rounded-2xl overflow-hidden">
                <p className="text-[10px] text-[#475569] pt-3 px-4 sm:hidden">← 横スクロールで全成績を確認</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[320px]">
                    <thead>
                      <tr className="border-b border-[#1e3a5f]">
                        <th className="text-left px-4 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">選手</th>
                        <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase hidden sm:table-cell">試合</th>
                        <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">勝</th>
                        <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">負</th>
                        <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase hidden sm:table-cell">S</th>
                        <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase hidden sm:table-cell">H</th>
                        <th className="text-center px-3 py-4 text-xs font-bold tracking-wider text-[#a78bfa] uppercase">防御率</th>
                        <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase">投球回</th>
                        <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase hidden sm:table-cell">奪三振</th>
                        <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase hidden sm:table-cell">与四球</th>
                        <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase hidden sm:table-cell">被安打</th>
                        <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase hidden sm:table-cell">自責点</th>
                        <th className="text-center px-2 py-4 text-xs font-bold tracking-wider text-[#64748b] uppercase hidden sm:table-cell">投球数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pitchingStats.map((p, i) => (
                        <tr
                          key={p.id}
                          className={`border-b border-[#0d1b2a] hover:bg-[#0d1b2a]/50 transition-colors ${
                            i === 0 ? 'bg-[#1a1a44]/30' : ''
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
                          <td className="text-center px-2 py-3 text-[#94a3b8] hidden sm:table-cell">{p.games}</td>
                          <td className="text-center px-2 py-3">
                            {p.wins > 0 ? <span className="text-[#22c55e] font-bold">{p.wins}</span> : <span className="text-[#475569]">0</span>}
                          </td>
                          <td className="text-center px-2 py-3">
                            {p.losses > 0 ? <span className="text-[#ef4444]">{p.losses}</span> : <span className="text-[#475569]">0</span>}
                          </td>
                          <td className="text-center px-2 py-3 hidden sm:table-cell">
                            {p.saves > 0 ? <span className="text-[#60a5fa] font-bold">{p.saves}</span> : <span className="text-[#475569]">0</span>}
                          </td>
                          <td className="text-center px-2 py-3 hidden sm:table-cell">
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
                          <td className="text-center px-2 py-3 text-[#94a3b8] hidden sm:table-cell">{p.strikeouts}</td>
                          <td className="text-center px-2 py-3 text-[#94a3b8] hidden sm:table-cell">{p.walks}</td>
                          <td className="text-center px-2 py-3 text-[#94a3b8] hidden sm:table-cell">{p.hitsAllowed}</td>
                          <td className="text-center px-2 py-3 text-[#94a3b8] hidden sm:table-cell">{p.earnedRuns}</td>
                          <td className="text-center px-2 py-3 text-[#64748b] text-xs hidden sm:table-cell">{p.pitches > 0 ? p.pitches : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
