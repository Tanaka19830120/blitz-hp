import Link from 'next/link'
import { notFound } from 'next/navigation'

export const revalidate = 3600
import {
  getBattingStats,
  getTotalGames,
  getQualPaPerGame,
  getQualIpPerGame,
  getPlayerTrends,
  type PlayerStats,
  type TrendStat,
} from '@/lib/statsQueries'
import { prisma } from '@/lib/prisma'

// ── 打者系 ──────────────────────────────────────────────
type BatKey = 'avg' | 'rbi' | 'hits' | 'homeRuns'
const BAT_DEFS: Record<BatKey, {
  title: string; color: string
  qualified: boolean
  valueOf: (p: PlayerStats) => number
  display: (p: PlayerStats) => string
  trendStat: TrendStat
  yLabel: (v: number) => string
}> = {
  avg:      { title: '打率',   color: 'text-[#60a5fa]', qualified: true,  valueOf: p => p.atBats > 0 ? p.hits / p.atBats : 0, display: p => p.avg,            trendStat: 'avg',      yLabel: v => v.toFixed(3).replace('0.','.') },
  rbi:      { title: '打点',   color: 'text-[#fbbf24]', qualified: false, valueOf: p => p.rbi,                                  display: p => String(p.rbi),    trendStat: 'rbi',      yLabel: v => String(Math.round(v)) },
  hits:     { title: '安打',   color: 'text-[#22c55e]', qualified: false, valueOf: p => p.hits,                                 display: p => String(p.hits),   trendStat: 'hits',     yLabel: v => String(Math.round(v)) },
  homeRuns: { title: '本塁打', color: 'text-[#ef4444]', qualified: false, valueOf: p => p.homeRuns,                             display: p => String(p.homeRuns), trendStat: 'homeRuns', yLabel: v => String(Math.round(v)) },
}

// ── 投手系 ──────────────────────────────────────────────
type PitKey = 'era' | 'wins'
interface PitcherRow { id: string; name: string; number: number | null; position: string | null; games: number; wins: number; losses: number; saves: number; holds: number; outs: number; earnedRuns: number; era: string }

function parseInnings(s: string): number {
  const kanji = s.match(/^(\d+)回(\d)\/3/)
  if (kanji) return parseInt(kanji[1]) * 3 + parseInt(kanji[2])
  const n = parseFloat(s)
  if (isNaN(n) || n < 0) return 0
  const full = Math.floor(n), frac = Math.min(Math.round((n - full) * 10), 2)
  return full * 3 + frac
}
function displayInnings(outs: number) {
  const full = Math.floor(outs / 3), frac = outs % 3
  return frac === 0 ? `${full}` : `${full} ${frac}/3`
}

async function getPitcherRanking(year?: number, includeAlumni = false): Promise<PitcherRow[]> {
  const dateFilter = year ? { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31T23:59:59`) } : undefined
  const players = await prisma.user.findMany({
    where: includeAlumni ? { isGuest: false } : { isGuest: false, email: { endsWith: '@b' } },
    include: {
      pitchingStats: {
        include: { game: { include: { schedule: { select: { date: true } } } } },
        ...(dateFilter ? { where: { game: { schedule: { date: dateFilter } } } } : {}),
      },
    },
    orderBy: { name: 'asc' },
  })
  return players.map(p => {
    const stats = p.pitchingStats
    if (stats.length === 0) return null
    const outs = stats.reduce((s, g) => s + parseInnings(g.innings), 0)
    const er   = stats.reduce((s, g) => s + g.earnedRuns, 0)
    return {
      id: p.id, name: p.name, number: p.number, position: p.position,
      games: stats.length,
      wins:   stats.filter(g => g.decision === '勝').length,
      losses: stats.filter(g => g.decision === '負').length,
      saves:  stats.filter(g => g.decision === 'S').length,
      holds:  stats.filter(g => g.decision === 'H').length,
      outs, earnedRuns: er,
      era: outs > 0 ? (er * 21 / outs).toFixed(2) : '---',
    }
  }).filter((p): p is PitcherRow => p !== null)
}

// ── 全種目定義（タブ表示用） ──────────────────────────────
type StatKey = BatKey | PitKey
const ALL_TABS: { key: StatKey; title: string; color: string; group: 'bat' | 'pit' }[] = [
  { key: 'avg',      title: '打率',   color: 'text-[#60a5fa]', group: 'bat' },
  { key: 'rbi',      title: '打点',   color: 'text-[#fbbf24]', group: 'bat' },
  { key: 'hits',     title: '安打',   color: 'text-[#22c55e]', group: 'bat' },
  { key: 'homeRuns', title: '本塁打', color: 'text-[#ef4444]', group: 'bat' },
  { key: 'era',      title: '防御率', color: 'text-[#a78bfa]', group: 'pit' },
  { key: 'wins',     title: '勝利数', color: 'text-[#34d399]', group: 'pit' },
]
const COLORS = ['#60a5fa','#34d399','#f59e0b','#a78bfa','#fb7185','#38bdf8','#4ade80','#fbbf24','#e879f9','#94a3b8']

export default async function RankingPage({ searchParams }: { searchParams: Promise<{ stat?: string; year?: string }> }) {
  const sp = await searchParams
  const statKey = (sp.stat ?? 'avg') as StatKey
  const tab = ALL_TABS.find(t => t.key === statKey)
  if (!tab) notFound()

  const isCareer    = sp.year === 'all'
  const selectedYear = isCareer ? undefined : sp.year ? parseInt(sp.year) : undefined
  const yearLabel   = isCareer ? '通算' : selectedYear ? `${selectedYear}年` : '最新'
  const backHref    = `/stats${isCareer ? '?year=all' : selectedYear ? `?year=${selectedYear}` : ''}`
  const yearQ       = isCareer ? '&year=all' : selectedYear ? `&year=${selectedYear}` : ''

  const [totalGames, qualPaPerGame, qualIpPerGame] = await Promise.all([
    getTotalGames(selectedYear),
    getQualPaPerGame(),
    getQualIpPerGame(),
  ])

  // ── 打者系処理 ──────────────────────────────────────────
  if (tab.group === 'bat') {
    const def = BAT_DEFS[statKey as BatKey]
    const stats = await getBattingStats(selectedYear)
    const qualThreshold = Math.floor(totalGames * qualPaPerGame)

    let pool = stats
    if (def.qualified) {
      const qualified = stats.filter(p => p.plateAppearances >= qualThreshold && p.atBats > 0)
      pool = qualified.length > 0 ? qualified : stats.filter(p => p.atBats > 0)
    }
    const ranked = [...pool].sort((a, b) => def.valueOf(b) - def.valueOf(a))
    const rows = ranked.map((p, i) => ({ p, rank: i + 1 }))
    for (let i = 1; i < rows.length; i++) {
      if (def.valueOf(rows[i].p) === def.valueOf(rows[i - 1].p)) rows[i].rank = rows[i - 1].rank
    }

    const rawTrend = await getPlayerTrends(ranked.map(p => p.id), selectedYear, def.trendStat)
    const paById  = new Map(ranked.map(p => [p.id, p.plateAppearances]))
    const maxDate = rawTrend.flatMap(p => p.points.map(pt => pt.date)).sort().at(-1) ?? ''
    type TP = { date: string; value: number; dashed?: boolean }
    const trendPlayers = rawTrend.map(p => {
      const pts: TP[] = p.points
      const last = pts.at(-1)
      if (!last || last.date === maxDate) return { ...p, points: pts }
      const pa = paById.get(p.id) ?? 0
      if (statKey === 'avg' && pa < qualThreshold) return { ...p, points: pts }
      return { ...p, points: [...pts, { date: maxDate, value: last.value, dashed: true }] }
    })

    const renderChart = trendPlayers.length >= 2
    const allDates = [...new Set(trendPlayers.flatMap(p => p.points.map(pt => pt.date)))].sort()
    const allVals  = trendPlayers.flatMap(p => p.points.map(pt => pt.value))
    const minV = statKey === 'avg' ? Math.max(0, Math.min(...allVals) - 0.02) : 0
    const maxV = Math.max(...allVals, 0.001)
    const W = 560, H = 180, padL = 36, padR = 64, padT = 12, padB = 28
    const gw = W - padL - padR, gh = H - padT - padB
    const cx = (date: string) => padL + allDates.indexOf(date) / Math.max(allDates.length - 1, 1) * gw
    const cy = (v: number) => padT + gh - (v - minV) / Math.max(maxV - minV, 0.001) * gh
    const monthLabels: { date: string; label: string }[] = []
    let lastMonth = ''
    for (const d of allDates) {
      const m = d.slice(0, 7)
      if (m !== lastMonth) { monthLabels.push({ date: d, label: d.slice(5, 7) + '月' }); lastMonth = m }
    }
    const showThreeLine = statKey === 'avg' && maxV >= 0.3 && minV <= 0.3
    const yTicks = [minV, (minV + maxV) / 2, maxV]

    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="flex items-center gap-2 text-sm text-[#64748b] mb-6">
          <Link href={backHref} className="hover:text-[#60a5fa] transition-colors">個人成績</Link>
          <span>›</span><span className="text-[#94a3b8]">{def.title}ランキング</span>
        </div>
        <TabHeader statKey={statKey} yearQ={yearQ} />
        <p className="text-sm text-[#64748b] mb-6">
          <span className={def.color}>{def.title}</span>ランキング・{yearLabel}
          {def.qualified && qualThreshold > 0 && ` ・ 規定打席 ${qualThreshold}打席以上`}
        </p>
        {rows.length === 0 ? <Empty /> : (
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[360px]">
                <thead><tr className="border-b border-[#1e3a5f] text-xs text-[#64748b] uppercase tracking-wider">
                  <th className="text-center px-3 py-3 w-12">順位</th>
                  <th className="text-left px-3 py-3">選手</th>
                  <th className="text-center px-2 py-3 w-12">試合</th>
                  <th className="text-center px-2 py-3 w-12">打数</th>
                  <th className="text-center px-2 py-3 w-12">安打</th>
                  <th className={`text-center px-3 py-3 w-16 ${def.color}`}>{def.title}</th>
                </tr></thead>
                <tbody>
                  {rows.map(({ p, rank }) => (
                    <tr key={p.id} className="border-b border-[#0d1b2a] hover:bg-[#0d1b2a]/50 transition-colors">
                      <td className="text-center px-3 py-3">
                        <span className={`font-black ${rank===1?'text-[#fbbf24]':rank===2?'text-[#cbd5e1]':rank===3?'text-[#d97706]':'text-[#475569]'}`}>{rank}</span>
                      </td>
                      <td className="px-3 py-3">
                        <Link href={`/members/${p.id}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                          {p.number != null && <span className="text-xs font-bold text-[#60a5fa] w-6 text-right">#{p.number}</span>}
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
        {renderChart && (
          <div className="glass-card rounded-2xl p-5 mt-6">
            <h2 className="text-xs font-bold tracking-[0.3em] text-[#64748b] uppercase mb-4">{def.title}推移グラフ（{yearLabel}）</h2>
            <div className="overflow-x-auto">
              <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: '300px' }}>
                {yTicks.map((v, i) => <text key={i} x={padL-4} y={cy(v)+3} fontSize="9" fill="#475569" textAnchor="end">{def.yLabel(v)}</text>)}
                {yTicks.map((v, i) => <line key={i} x1={padL} y1={cy(v)} x2={W-padR} y2={cy(v)} stroke="#1e3a5f" strokeWidth="0.5" opacity="0.6"/>)}
                {showThreeLine && <>
                  <line x1={padL} y1={cy(0.3)} x2={W-padR} y2={cy(0.3)} stroke="#22c55e" strokeWidth="0.8" strokeDasharray="5,4" opacity="0.6"/>
                  <text x={padL-4} y={cy(0.3)+3} fontSize="9" fill="#22c55e" textAnchor="end" opacity="0.8">.300</text>
                </>}
                {monthLabels.map(({ date, label }) => <g key={date}>
                  <line x1={cx(date)} y1={padT} x2={cx(date)} y2={H-padB} stroke="#1e3a5f" strokeWidth="0.5" opacity="0.4"/>
                  <text x={cx(date)} y={H-4} fontSize="9" fill="#475569" textAnchor="middle">{label}</text>
                </g>)}
                {trendPlayers.map((p, pi) => {
                  const color = COLORS[pi % COLORS.length]
                  const solidPts  = p.points.filter(pt => !pt.dashed)
                  const dashedPts = p.points.filter(pt => pt.dashed)
                  if (solidPts.length < 2) return null
                  const toD = (pts: typeof p.points) => pts.map((pt, i) => `${i===0?'M':'L'}${cx(pt.date).toFixed(1)},${cy(pt.value).toFixed(1)}`).join(' ')
                  const dashedStart = solidPts.at(-1)
                  const dashedPath  = dashedStart && dashedPts.length > 0
                    ? `M${cx(dashedStart.date).toFixed(1)},${cy(dashedStart.value).toFixed(1)} L${cx(dashedPts[0].date).toFixed(1)},${cy(dashedPts[0].value).toFixed(1)}`
                    : null
                  const last = p.points.at(-1)!
                  return <g key={p.id}>
                    <path d={toD(solidPts)} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" opacity="0.85"/>
                    {dashedPath && <path d={dashedPath} fill="none" stroke={color} strokeWidth="1.2" strokeDasharray="4,3" opacity="0.5"/>}
                    <circle cx={cx(last.date)} cy={cy(last.value)} r="3" fill={color}/>
                    <text x={cx(last.date)+6} y={cy(last.value)+3} fontSize="9" fill={color}>{p.name}</text>
                  </g>
                })}
                <line x1={padL} y1={H-padB} x2={W-padR} y2={H-padB} stroke="#334155" strokeWidth="0.8"/>
              </svg>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
              {trendPlayers.map((p, pi) => (
                <span key={p.id} className="flex items-center gap-1 text-xs text-[#64748b]">
                  <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: COLORS[pi % COLORS.length] }}/>
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── 投手系処理 ──────────────────────────────────────────
  const pitchers = await getPitcherRanking(selectedYear)
  const ipThresholdOuts = Math.floor(totalGames * qualIpPerGame) * 3

  let pitPool = pitchers
  if (statKey === 'era') {
    const qual = pitchers.filter(p => p.outs >= ipThresholdOuts && p.era !== '---')
    pitPool = qual.length > 0 ? qual : pitchers.filter(p => p.era !== '---')
  }

  const pitRanked = statKey === 'era'
    ? [...pitPool].sort((a, b) => parseFloat(a.era) - parseFloat(b.era))   // 防御率は昇順
    : [...pitPool].sort((a, b) => b.wins - a.wins)                          // 勝利数は降順

  const pitRows = pitRanked.map((p, i) => ({ p, rank: i + 1 }))
  for (let i = 1; i < pitRows.length; i++) {
    const va = statKey === 'era' ? parseFloat(pitRows[i].p.era) : pitRows[i].p.wins
    const vb = statKey === 'era' ? parseFloat(pitRows[i-1].p.era) : pitRows[i-1].p.wins
    if (va === vb) pitRows[i].rank = pitRows[i-1].rank
  }

  const pitColor = statKey === 'era' ? 'text-[#a78bfa]' : 'text-[#34d399]'
  const pitQualLabel = statKey === 'era' && ipThresholdOuts > 0
    ? `規定投球回 ${Math.floor(totalGames * qualIpPerGame)}回以上`
    : null

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="flex items-center gap-2 text-sm text-[#64748b] mb-6">
        <Link href={backHref} className="hover:text-[#60a5fa] transition-colors">個人成績</Link>
        <span>›</span><span className="text-[#94a3b8]">{tab.title}ランキング</span>
      </div>
      <TabHeader statKey={statKey} yearQ={yearQ} />
      <p className="text-sm text-[#64748b] mb-6">
        <span className={pitColor}>{tab.title}</span>ランキング・{yearLabel}
        {pitQualLabel && ` ・ ${pitQualLabel}`}
      </p>
      {pitRows.length === 0 ? <Empty /> : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[380px]">
              <thead><tr className="border-b border-[#1e3a5f] text-xs text-[#64748b] uppercase tracking-wider">
                <th className="text-center px-3 py-3 w-12">順位</th>
                <th className="text-left px-3 py-3">選手</th>
                <th className="text-center px-2 py-3 w-12">試合</th>
                <th className="text-center px-2 py-3 w-10">勝</th>
                <th className="text-center px-2 py-3 w-10">負</th>
                <th className="text-center px-2 py-3 w-10 hidden sm:table-cell">S</th>
                <th className="text-center px-2 py-3 w-10 hidden sm:table-cell">H</th>
                <th className={`text-center px-3 py-3 w-20 ${pitColor}`}>{tab.title}</th>
                <th className="text-center px-2 py-3 w-16">投球回</th>
              </tr></thead>
              <tbody>
                {pitRows.map(({ p, rank }) => (
                  <tr key={p.id} className="border-b border-[#0d1b2a] hover:bg-[#0d1b2a]/50 transition-colors">
                    <td className="text-center px-3 py-3">
                      <span className={`font-black ${rank===1?'text-[#fbbf24]':rank===2?'text-[#cbd5e1]':rank===3?'text-[#d97706]':'text-[#475569]'}`}>{rank}</span>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/members/${p.id}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                        {p.number != null && <span className="text-xs font-bold text-[#a78bfa] w-6 text-right">#{p.number}</span>}
                        <span className="font-semibold text-[#e2e8f0]">{p.name}</span>
                        {rank === 1 && <span className="text-xs">👑</span>}
                      </Link>
                    </td>
                    <td className="text-center px-2 py-3 text-[#94a3b8]">{p.games}</td>
                    <td className="text-center px-2 py-3">{p.wins > 0 ? <span className="text-[#22c55e] font-bold">{p.wins}</span> : <span className="text-[#475569]">0</span>}</td>
                    <td className="text-center px-2 py-3">{p.losses > 0 ? <span className="text-[#ef4444]">{p.losses}</span> : <span className="text-[#475569]">0</span>}</td>
                    <td className="text-center px-2 py-3 hidden sm:table-cell">{p.saves > 0 ? <span className="text-[#60a5fa] font-bold">{p.saves}</span> : <span className="text-[#475569]">0</span>}</td>
                    <td className="text-center px-2 py-3 hidden sm:table-cell">{p.holds > 0 ? <span className="text-[#fbbf24]">{p.holds}</span> : <span className="text-[#475569]">0</span>}</td>
                    <td className={`text-center px-3 py-3 font-black text-base ${pitColor}`}>
                      {statKey === 'era' ? p.era : p.wins}
                    </td>
                    <td className="text-center px-2 py-3 text-[#94a3b8] font-mono text-xs">{displayInnings(p.outs)}</td>
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

function TabHeader({ statKey, yearQ }: { statKey: StatKey; yearQ: string }) {
  return (
    <div className="mb-4">
      <div className="flex flex-wrap gap-2 mb-2">
        <span className="text-[10px] text-[#475569] self-center">打者</span>
        {ALL_TABS.filter(t => t.group === 'bat').map(t => (
          <Link key={t.key} href={`/stats/ranking?stat=${t.key}${yearQ}`}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
              t.key === statKey ? `border-current ${t.color} bg-current/10` : 'border-[#1e3a5f] text-[#64748b] hover:border-[#2a4a6f] hover:text-[#94a3b8]'
            }`}>{t.title}</Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="text-[10px] text-[#475569] self-center">投手</span>
        {ALL_TABS.filter(t => t.group === 'pit').map(t => (
          <Link key={t.key} href={`/stats/ranking?stat=${t.key}${yearQ}`}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
              t.key === statKey ? `border-current ${t.color} bg-current/10` : 'border-[#1e3a5f] text-[#64748b] hover:border-[#2a4a6f] hover:text-[#94a3b8]'
            }`}>{t.title}</Link>
        ))}
      </div>
    </div>
  )
}

function Empty() {
  return <div className="glass-card rounded-2xl p-12 text-center text-[#64748b]">対象データがありません</div>
}
