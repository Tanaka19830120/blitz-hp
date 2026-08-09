import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MemberAvatar } from '@/components/MemberAvatar'
import { ThemeColorPicker } from '@/components/ThemeColorPicker'
import { auth } from '@/auth'

export const revalidate = 0

// hex → { r, g, b }
function hexToRgb(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}
// テーマカラーからスタイル値を生成
function buildTheme(hex: string | null) {
  const h = hex || '#60a5fa'
  const { r, g, b } = hexToRgb(h)
  const rgba = (a: number) => `rgba(${r},${g},${b},${a})`
  return {
    hasCustom:  !!hex,
    accent:     h,
    border:     rgba(0.4),
    borderDiv:  rgba(0.2),
    bg:         rgba(0.08),
    ring:       rgba(0.55),
    glow1:      rgba(0.20),
    glow2:      rgba(0.14),
    glow3:      rgba(0.09),
    lineColor:  h,
  }
}

function calcStats(gameStats: {
  atBats: number; hits: number; doubles: number; triples: number; homeRuns: number;
  rbi: number; runs: number; stolenBases: number; walks: number; strikeouts: number;
  hitByPitch: number; sacrificeBunts: number; sacrificeFlies: number; plateAppearances: number;
}[]) {
  const ab = gameStats.reduce((s, g) => s + g.atBats, 0)
  const h = gameStats.reduce((s, g) => s + g.hits, 0)
  const d = gameStats.reduce((s, g) => s + g.doubles, 0)
  const t = gameStats.reduce((s, g) => s + g.triples, 0)
  const hr = gameStats.reduce((s, g) => s + g.homeRuns, 0)
  const bb = gameStats.reduce((s, g) => s + g.walks, 0)
  const hbp = gameStats.reduce((s, g) => s + g.hitByPitch, 0)
  const sf = gameStats.reduce((s, g) => s + g.sacrificeFlies, 0)
  const pa = gameStats.reduce((s, g) => s + g.plateAppearances, 0)

  const obpDenom = ab + bb + hbp + sf
  const singles = h - d - t - hr
  const slgVal = ab > 0 ? (singles + 2 * d + 3 * t + 4 * hr) / ab : 0

  return {
    games: gameStats.length,
    pa, ab, h, d, t, hr,
    rbi: gameStats.reduce((s, g) => s + g.rbi, 0),
    runs: gameStats.reduce((s, g) => s + g.runs, 0),
    sb: gameStats.reduce((s, g) => s + g.stolenBases, 0),
    bb, so: gameStats.reduce((s, g) => s + g.strikeouts, 0),
    hbp, sac: gameStats.reduce((s, g) => s + g.sacrificeBunts, 0), sf,
    avg: ab > 0 ? (h / ab).toFixed(3).replace('0.', '.') : '---',
    obp: obpDenom > 0 ? ((h + bb + hbp) / obpDenom).toFixed(3).replace('0.', '.') : '---',
    slg: ab > 0 ? slgVal.toFixed(3).replace('0.', '.') : '---',
  }
}

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  const sessionUser = session?.user as { id?: string; role?: string } | undefined
  const canEdit = sessionUser?.role === 'ADMIN' || sessionUser?.id === id

  const player = await prisma.user.findUnique({
    where: { id },
    include: {
      gameStats: {
        include: {
          game: {
            include: { schedule: { select: { date: true, opponent: true, id: true } } },
          },
        },
        orderBy: { game: { schedule: { date: 'desc' } } },
      },
      pitchingStats: {
        include: {
          game: {
            include: { schedule: { select: { date: true, opponent: true, id: true } } },
          },
        },
        orderBy: { game: { schedule: { date: 'desc' } } },
      },
    },
  })

  if (!player) notFound()

  const currentYear = new Date().getFullYear()

  // ── ⑧ 連続出場記録 ──
  // チームの全試合リストと照合して「最後から連続出場中の試合数」を算出
  const allTeamGames = await prisma.schedule.findMany({
    where:   { game: { isNot: null }, date: { lte: new Date() } },
    orderBy: { date: 'desc' },
    select:  { id: true },
  })
  const playedIds = new Set(player.gameStats.map(gs => gs.game.schedule.id))
  let streak = 0
  for (const g of allTeamGames) {
    if (playedIds.has(g.id)) streak++
    else break  // 出場していない試合が出たら連続終了
  }

  // ── ③ 今シーズンの打率推移（時系列） ──
  const thisYearStats = [...player.gameStats]
    .filter(gs => new Date(gs.game.schedule.date).getFullYear() === currentYear)
    .sort((a, b) => new Date(a.game.schedule.date).getTime() - new Date(b.game.schedule.date).getTime())
  const avgTrend: { date: string; avg: number; label: string }[] = []
  let cumAb = 0, cumH = 0
  for (const gs of thisYearStats) {
    cumAb += gs.atBats
    cumH  += gs.hits
    avgTrend.push({
      date:  new Date(gs.game.schedule.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }),
      avg:   cumAb > 0 ? cumH / cumAb : 0,
      label: cumAb > 0 ? (cumH / cumAb).toFixed(3).replace('0.', '.') : '---',
    })
  }

  // Group game stats by year
  const byYear = new Map<number, typeof player.gameStats>()
  for (const gs of player.gameStats) {
    const year = new Date(gs.game.schedule.date).getFullYear()
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year)!.push(gs)
  }
  const years = [...byYear.keys()].sort((a, b) => b - a)

  const careerStats = calcStats(player.gameStats)
  const currentYearStats = byYear.has(currentYear) ? calcStats(byYear.get(currentYear)!) : null

  // Pitching career
  const pitchGames = player.pitchingStats.length
  const pitchInnTotal = player.pitchingStats.reduce((s, p) => {
    // Parse innings like "5回0/3" or "5" → just sum numerically
    const match = p.innings.match(/^(\d+)/)
    return s + (match ? parseInt(match[1]) : 0)
  }, 0)

  const theme = buildTheme(player.themeColor ?? null)

  const cardStyle = theme.hasCustom
    ? { border: `1px solid ${theme.border}`, backgroundColor: theme.bg }
    : {}

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* 背景グロー（テーマカラーあり時） */}
      {theme.hasCustom && (
        <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full blur-3xl"
            style={{ backgroundColor: theme.glow1 }} />
          <div className="absolute top-1/4 right-0 w-[400px] h-[400px] rounded-full blur-3xl"
            style={{ backgroundColor: theme.glow2 }} />
          <div className="absolute bottom-1/3 left-0 w-[350px] h-[350px] rounded-full blur-3xl"
            style={{ backgroundColor: theme.glow3 }} />
        </div>
      )}

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[#64748b] mb-6">
        <Link href="/members" className="hover:text-[#94a3b8] transition-colors">メンバー</Link>
        <span>›</span>
        <span className="text-[#94a3b8]">{player.name}</span>
      </div>

      {/* Player header */}
      <div className="glass-card rounded-2xl p-6 mb-6 relative" style={cardStyle}>
        {/* テーマカラー設定ボタン（右上） */}
        {canEdit && (
          <div className="absolute top-3 right-3 z-10">
            <ThemeColorPicker userId={player.id} initialColor={player.themeColor ?? null} />
          </div>
        )}
        <div className="flex items-start gap-6">
          <div className="flex-shrink-0 ring-2 rounded-full" style={{ '--tw-ring-color': theme.ring } as React.CSSProperties}>
            <MemberAvatar
              photoUrl={player.photoUrl}
              name={player.name}
              number={player.number}
              size="lg"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              {player.number != null && (
                <span className="text-4xl font-black leading-none" style={{ color: theme.accent }}>
                  #{player.number}
                </span>
              )}
              <h1 className="text-3xl font-black text-[#e2e8f0]" style={theme.hasCustom ? { color: theme.accent } : {}}>
                {player.name}
              </h1>
              {player.role === 'ADMIN' && (
                <span className="text-xs border border-[#1e3a5f]/50 text-[#475569] px-2 py-0.5 rounded">管理者</span>
              )}
            </div>
            {player.position && (
              <div className="font-medium mt-1" style={{ color: theme.accent }}>{player.position}</div>
            )}
            <div className="text-sm text-[#64748b] mt-1">
              {careerStats.games}試合出場
              {pitchGames > 0 && ` / 投手登板 ${pitchGames}試合`}
            </div>
          </div>
        </div>
      </div>

      {/* Current season highlight */}
      {currentYearStats && currentYearStats.games > 0 && (
        <div className="glass-card rounded-2xl p-5 mb-6" style={cardStyle}>
          <h2 className="text-xs font-bold tracking-wider uppercase mb-4" style={{ color: theme.accent }}>
            {currentYear}年 シーズン成績
          </h2>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
            {[
              { label: '試合', val: currentYearStats.games },
              { label: '打数', val: currentYearStats.ab },
              { label: '安打', val: currentYearStats.h },
              { label: '本塁打', val: currentYearStats.hr },
              { label: '打点', val: currentYearStats.rbi },
              { label: '得点', val: currentYearStats.runs },
              { label: '盗塁', val: currentYearStats.sb },
              { label: '四球', val: currentYearStats.bb },
            ].map(({ label, val }) => (
              <div key={label} className="text-center">
                <div className="text-xl font-black text-[#e2e8f0]">{val}</div>
                <div className="text-[10px] text-[#64748b] mt-0.5">{label}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-6 mt-4 pt-4" style={{ borderTop: `1px solid ${theme.borderDiv}` }}>
            <div>
              <span className="text-xs text-[#64748b]">打率 </span>
              <span className="text-xl font-black" style={{
                color: currentYearStats.avg !== '---' && parseFloat(currentYearStats.avg) >= 0.3
                  ? '#22c55e' : theme.accent
              }}>{currentYearStats.avg}</span>
            </div>
            <div>
              <span className="text-xs text-[#64748b]">出塁率 </span>
              <span className="text-lg font-bold text-[#94a3b8]">{currentYearStats.obp}</span>
            </div>
            <div>
              <span className="text-xs text-[#64748b]">長打率 </span>
              <span className="text-lg font-bold text-[#94a3b8]">{currentYearStats.slg}</span>
            </div>
          </div>
        </div>
      )}

      {/* 連続出場 + 打率トレンド */}
      {(streak > 0 || avgTrend.length >= 3) && (
        <div className="glass-card rounded-2xl p-5 mb-6 flex flex-col sm:flex-row gap-6" style={cardStyle}>
          {streak > 0 && (
            <div className="flex flex-col items-center justify-center min-w-[120px]">
              <div className="text-3xl font-black" style={{ color: theme.accent }}>{streak}</div>
              <div className="text-xs text-[#64748b] mt-0.5">試合連続出場中 🔥</div>
              {streak >= 10 && <div className="text-[10px] mt-1" style={{ color: theme.accent }}>素晴らしい！</div>}
            </div>
          )}
          {avgTrend.length >= 3 && (() => {
            const vals = avgTrend.map(p => p.avg)
            const min  = Math.min(...vals)
            const max  = Math.max(...vals, 0.001)
            const W = 240, H = 56, pad = 8
            const x = (i: number) => pad + i * (W - pad * 2) / (vals.length - 1)
            const y = (v: number) => H - pad - (v - min) / (max - min + 0.001) * (H - pad * 2)
            const d = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
            const last = avgTrend[avgTrend.length - 1]
            const prev = avgTrend.length >= 2 ? avgTrend[avgTrend.length - 2] : null
            const trend = prev ? (last.avg > prev.avg ? '↑' : last.avg < prev.avg ? '↓' : '→') : ''
            const trendColor = trend === '↑' ? '#22c55e' : trend === '↓' ? '#ef4444' : '#94a3b8'
            return (
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[#64748b]">{currentYear}年 打率推移</span>
                  <span className="text-sm font-bold" style={{ color: trendColor }}>{last.label} {trend}</span>
                </div>
                <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
                  {max >= 0.3 && min <= 0.3 && (
                    <>
                      <line x1={pad} y1={y(0.3)} x2={W-pad} y2={y(0.3)} stroke="#22c55e" strokeWidth="0.5" strokeDasharray="4,3" opacity="0.5"/>
                      <text x={W-pad+2} y={y(0.3)+4} fontSize="8" fill="#22c55e" opacity="0.7">.300</text>
                    </>
                  )}
                  <path d={d} fill="none" stroke={theme.lineColor} strokeWidth="2" strokeLinejoin="round"/>
                  <circle cx={x(vals.length-1)} cy={y(vals[vals.length-1])} r="3" fill={theme.lineColor}/>
                </svg>
                <div className="flex justify-between text-[9px] text-[#475569] mt-0.5 px-1">
                  <span>{avgTrend[0].date}</span><span>{last.date}</span>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Career stats */}
      {careerStats.games > 0 && (
        <div className="glass-card rounded-2xl mb-6" style={cardStyle}>
          <div className="px-5 pt-5">
            <h2 className="text-xs font-bold text-[#64748b] tracking-wider uppercase mb-3">通算成績</h2>
            <p className="text-[10px] text-[#475569] mb-2">← 横スクロールで全成績を確認</p>
          </div>
          <div className="overflow-x-auto px-5 pb-5">
            <table className="text-sm text-center" style={{ minWidth: '640px' }}>
              <thead>
                <tr className="text-xs text-[#64748b]" style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <th className="py-2 px-2">試合</th>
                  <th className="py-2 px-2">打席</th>
                  <th className="py-2 px-2">打数</th>
                  <th className="py-2 px-2">安打</th>
                  <th className="py-2 px-2">2B</th>
                  <th className="py-2 px-2">3B</th>
                  <th className="py-2 px-2">本</th>
                  <th className="py-2 px-2">打点</th>
                  <th className="py-2 px-2">得点</th>
                  <th className="py-2 px-2">盗塁</th>
                  <th className="py-2 px-2">四球</th>
                  <th className="py-2 px-2">三振</th>
                  <th className="py-2 px-2" style={{ color: theme.accent }}>打率</th>
                  <th className="py-2 px-2">出塁率</th>
                  <th className="py-2 px-2">長打率</th>
                </tr>
              </thead>
              <tbody>
                <tr className="text-[#94a3b8] font-mono text-sm">
                  <td className="py-2 px-2">{careerStats.games}</td>
                  <td className="py-2 px-2">{careerStats.pa}</td>
                  <td className="py-2 px-2">{careerStats.ab}</td>
                  <td className="py-2 px-2 font-bold text-[#e2e8f0]">{careerStats.h}</td>
                  <td className="py-2 px-2">{careerStats.d}</td>
                  <td className="py-2 px-2">{careerStats.t}</td>
                  <td className="py-2 px-2">{careerStats.hr > 0 ? <span className="text-[#fbbf24] font-bold">{careerStats.hr}</span> : 0}</td>
                  <td className="py-2 px-2">{careerStats.rbi}</td>
                  <td className="py-2 px-2">{careerStats.runs}</td>
                  <td className="py-2 px-2">{careerStats.sb}</td>
                  <td className="py-2 px-2">{careerStats.bb}</td>
                  <td className="py-2 px-2">{careerStats.so}</td>
                  <td className="py-2 px-2 font-black" style={{ color: theme.accent }}>{careerStats.avg}</td>
                  <td className="py-2 px-2">{careerStats.obp}</td>
                  <td className="py-2 px-2">{careerStats.slg}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Year-by-year */}
      {years.length > 1 && (
        <div className="glass-card rounded-2xl p-5 mb-6" style={cardStyle}>
          <h2 className="text-xs font-bold text-[#64748b] tracking-wider uppercase mb-4">シーズン別成績</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-center">
              <thead>
                <tr className="text-xs text-[#64748b]" style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <th className="py-2 px-2 text-left">年</th>
                  <th className="py-2 px-2">試合</th><th className="py-2 px-2">打数</th>
                  <th className="py-2 px-2">安打</th><th className="py-2 px-2">本</th>
                  <th className="py-2 px-2">打点</th><th className="py-2 px-2">打率</th>
                  <th className="py-2 px-2">出塁率</th><th className="py-2 px-2">長打率</th>
                </tr>
              </thead>
              <tbody>
                {years.map((year) => {
                  const ys = calcStats(byYear.get(year)!)
                  return (
                    <tr key={year} style={{ borderBottom: `1px solid ${theme.borderDiv}` }}
                      className="hover:bg-white/5">
                      <td className="py-2 px-2 text-left">
                        <Link href={`/stats?year=${year}`} className="hover:underline text-sm"
                          style={{ color: theme.accent }}>{year}年</Link>
                      </td>
                      <td className="py-2 px-2 text-[#94a3b8]">{ys.games}</td>
                      <td className="py-2 px-2 text-[#94a3b8]">{ys.ab}</td>
                      <td className="py-2 px-2 text-[#94a3b8]">{ys.h}</td>
                      <td className="py-2 px-2 text-[#94a3b8]">{ys.hr}</td>
                      <td className="py-2 px-2 text-[#94a3b8]">{ys.rbi}</td>
                      <td className="py-2 px-2 font-bold" style={{ color: theme.accent }}>{ys.avg}</td>
                      <td className="py-2 px-2 text-[#94a3b8] font-mono text-xs">{ys.obp}</td>
                      <td className="py-2 px-2 text-[#94a3b8] font-mono text-xs">{ys.slg}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent game log */}
      {player.gameStats.length > 0 && (
        <div className="glass-card rounded-2xl" style={cardStyle}>
          <div className="px-5 pt-5">
            <h2 className="text-xs font-bold text-[#64748b] tracking-wider uppercase mb-3">直近の試合成績</h2>
            <p className="text-[10px] text-[#475569] mb-2">← 横スクロールで全成績を確認</p>
          </div>
          <div className="overflow-x-auto px-5 pb-5">
            <table className="text-xs text-center" style={{ minWidth: '560px' }}>
              <thead>
                <tr className="text-[#64748b]" style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <th className="py-2 px-2 text-left">日付</th>
                  <th className="py-2 px-2 text-left">対戦相手</th>
                  <th className="py-2 px-2">守備</th>
                  <th className="py-2 px-2">打順</th>
                  <th className="py-2 px-2">打数</th><th className="py-2 px-2">安打</th>
                  <th className="py-2 px-2">打点</th>
                  <th className="py-2 px-2">得点</th>
                  <th className="py-2 px-2">打率</th>
                </tr>
              </thead>
              <tbody>
                {player.gameStats.map((gs) => {
                  const avg = gs.atBats > 0
                    ? (gs.hits / gs.atBats).toFixed(3).replace('0.', '.') : '---'
                  return (
                    <tr key={gs.id} className="hover:bg-white/5"
                      style={{ borderBottom: `1px solid ${theme.borderDiv}` }}>
                      <td className="py-2 px-2 text-left text-[#64748b]">
                        {new Date(gs.game.schedule.date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' })}
                      </td>
                      <td className="py-2 px-2 text-left text-[#94a3b8]">
                        <Link href={`/results/${gs.game.schedule.id}`}
                          className="hover:text-[#e2e8f0] transition-colors">
                          vs {gs.game.schedule.opponent}
                        </Link>
                      </td>
                      <td className="py-2 px-2 text-[#64748b]">{gs.position ?? '–'}</td>
                      <td className="py-2 px-2 text-[#64748b]">{gs.battingOrder ?? '–'}</td>
                      <td className="py-2 px-2 text-[#94a3b8]">{gs.atBats}</td>
                      <td className="py-2 px-2 font-bold text-[#e2e8f0]">{gs.hits}</td>
                      <td className="py-2 px-2 text-[#94a3b8]">{gs.rbi}</td>
                      <td className="py-2 px-2 text-[#94a3b8]">{gs.runs}</td>
                      <td className="py-2 px-2 font-mono" style={{
                        color: gs.atBats > 0 && gs.hits / gs.atBats >= 0.3 ? '#22c55e' : '#64748b'
                      }}>{avg}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
