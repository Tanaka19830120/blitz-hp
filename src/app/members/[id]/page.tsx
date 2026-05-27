import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MemberAvatar } from '@/components/MemberAvatar'

export const dynamic = 'force-dynamic'

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

  return (
    <div className="pt-16 max-w-4xl mx-auto px-4 py-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[#64748b] mb-6">
        <Link href="/members" className="hover:text-[#60a5fa] transition-colors">メンバー</Link>
        <span>›</span>
        <span className="text-[#94a3b8]">{player.name}</span>
      </div>

      {/* Player header */}
      <div className="glass-card rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-6">
          <MemberAvatar
            photoUrl={player.photoUrl}
            name={player.name}
            number={player.number}
            size="lg"
            className="flex-shrink-0 ring-2 ring-[#2563eb]/30"
          />
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-black text-[#e2e8f0]">{player.name}</h1>
              {player.role === 'ADMIN' && (
                <span className="text-xs border border-[#1e3a5f]/50 text-[#475569] px-2 py-0.5 rounded">管理者</span>
              )}
            </div>
            {player.position && (
              <div className="text-[#60a5fa] font-medium mt-1">{player.position}</div>
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
        <div className="glass-card rounded-2xl p-5 mb-6">
          <h2 className="text-xs font-bold text-[#60a5fa] tracking-wider uppercase mb-4">
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
          <div className="flex gap-6 mt-4 pt-4 border-t border-[#1e3a5f]/50">
            <div>
              <span className="text-xs text-[#64748b]">打率 </span>
              <span className={`text-xl font-black ${
                currentYearStats.avg !== '---' && parseFloat(currentYearStats.avg) >= 0.3
                  ? 'text-[#22c55e]' : 'text-[#60a5fa]'
              }`}>{currentYearStats.avg}</span>
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

      {/* Career stats */}
      {careerStats.games > 0 && (
        <div className="glass-card rounded-2xl p-5 mb-6">
          <h2 className="text-xs font-bold text-[#64748b] tracking-wider uppercase mb-3">通算成績</h2>
          <p className="text-[10px] text-[#475569] mb-2 sm:hidden">← 横スクロールで全成績を確認</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-center">
              <thead>
                <tr className="text-xs text-[#64748b] border-b border-[#1e3a5f]">
                  <th className="py-2 px-2">試合</th>
                  <th className="py-2 px-2 hidden sm:table-cell">打席</th>
                  <th className="py-2 px-2">打数</th>
                  <th className="py-2 px-2">安打</th>
                  <th className="py-2 px-2 hidden sm:table-cell">2B</th>
                  <th className="py-2 px-2 hidden sm:table-cell">3B</th>
                  <th className="py-2 px-2 hidden sm:table-cell">本</th>
                  <th className="py-2 px-2">打点</th>
                  <th className="py-2 px-2 hidden sm:table-cell">得点</th>
                  <th className="py-2 px-2 hidden sm:table-cell">盗塁</th>
                  <th className="py-2 px-2 hidden sm:table-cell">四球</th>
                  <th className="py-2 px-2 hidden sm:table-cell">三振</th>
                  <th className="py-2 px-2 text-[#60a5fa]">打率</th>
                  <th className="py-2 px-2 hidden sm:table-cell">出塁率</th>
                  <th className="py-2 px-2 hidden sm:table-cell">長打率</th>
                </tr>
              </thead>
              <tbody>
                <tr className="text-[#94a3b8] font-mono text-sm">
                  <td className="py-2 px-2">{careerStats.games}</td>
                  <td className="py-2 px-2 hidden sm:table-cell">{careerStats.pa}</td>
                  <td className="py-2 px-2">{careerStats.ab}</td>
                  <td className="py-2 px-2 font-bold text-[#e2e8f0]">{careerStats.h}</td>
                  <td className="py-2 px-2 hidden sm:table-cell">{careerStats.d}</td>
                  <td className="py-2 px-2 hidden sm:table-cell">{careerStats.t}</td>
                  <td className="py-2 px-2 hidden sm:table-cell">{careerStats.hr > 0 ? <span className="text-[#fbbf24] font-bold">{careerStats.hr}</span> : 0}</td>
                  <td className="py-2 px-2">{careerStats.rbi}</td>
                  <td className="py-2 px-2 hidden sm:table-cell">{careerStats.runs}</td>
                  <td className="py-2 px-2 hidden sm:table-cell">{careerStats.sb}</td>
                  <td className="py-2 px-2 hidden sm:table-cell">{careerStats.bb}</td>
                  <td className="py-2 px-2 hidden sm:table-cell">{careerStats.so}</td>
                  <td className="py-2 px-2 font-black text-[#60a5fa]">{careerStats.avg}</td>
                  <td className="py-2 px-2 hidden sm:table-cell">{careerStats.obp}</td>
                  <td className="py-2 px-2 hidden sm:table-cell">{careerStats.slg}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Year-by-year */}
      {years.length > 1 && (
        <div className="glass-card rounded-2xl p-5 mb-6">
          <h2 className="text-xs font-bold text-[#64748b] tracking-wider uppercase mb-4">シーズン別成績</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-center">
              <thead>
                <tr className="text-xs text-[#64748b] border-b border-[#1e3a5f]">
                  <th className="py-2 px-2 text-left">年</th>
                  <th className="py-2 px-2">試合</th>
                  <th className="py-2 px-2">打数</th>
                  <th className="py-2 px-2">安打</th>
                  <th className="py-2 px-2">本</th>
                  <th className="py-2 px-2">打点</th>
                  <th className="py-2 px-2">打率</th>
                  <th className="py-2 px-2">出塁率</th>
                  <th className="py-2 px-2">長打率</th>
                </tr>
              </thead>
              <tbody>
                {years.map((year) => {
                  const ys = calcStats(byYear.get(year)!)
                  return (
                    <tr key={year} className="border-b border-[#0f2035]/50 hover:bg-[#1e3a5f]/10">
                      <td className="py-2 px-2 text-left">
                        <Link href={`/stats?year=${year}`} className="text-[#60a5fa] hover:underline text-sm">
                          {year}年
                        </Link>
                      </td>
                      <td className="py-2 px-2 text-[#94a3b8]">{ys.games}</td>
                      <td className="py-2 px-2 text-[#94a3b8]">{ys.ab}</td>
                      <td className="py-2 px-2 text-[#94a3b8]">{ys.h}</td>
                      <td className="py-2 px-2 text-[#94a3b8]">{ys.hr}</td>
                      <td className="py-2 px-2 text-[#94a3b8]">{ys.rbi}</td>
                      <td className="py-2 px-2 font-bold text-[#60a5fa]">{ys.avg}</td>
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
        <div className="glass-card rounded-2xl p-5">
          <h2 className="text-xs font-bold text-[#64748b] tracking-wider uppercase mb-3">直近の試合成績</h2>
          <p className="text-[10px] text-[#475569] mb-2 sm:hidden">← 横スクロールで全成績を確認</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-center">
              <thead>
                <tr className="text-[#64748b] border-b border-[#1e3a5f]">
                  <th className="py-2 px-2 text-left">日付</th>
                  <th className="py-2 px-2 text-left">対戦相手</th>
                  <th className="py-2 px-2 hidden sm:table-cell">守備</th>
                  <th className="py-2 px-2 hidden sm:table-cell">打順</th>
                  <th className="py-2 px-2">打数</th>
                  <th className="py-2 px-2">安打</th>
                  <th className="py-2 px-2">打点</th>
                  <th className="py-2 px-2 hidden sm:table-cell">得点</th>
                  <th className="py-2 px-2">打率</th>
                </tr>
              </thead>
              <tbody>
                {player.gameStats.slice(0, 20).map((gs) => {
                  const avg = gs.atBats > 0
                    ? (gs.hits / gs.atBats).toFixed(3).replace('0.', '.')
                    : '---'
                  return (
                    <tr key={gs.id} className="border-b border-[#0f2035]/50 hover:bg-[#1e3a5f]/10">
                      <td className="py-2 px-2 text-left text-[#64748b]">
                        {new Date(gs.game.schedule.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
                      </td>
                      <td className="py-2 px-2 text-left text-[#94a3b8]">
                        <Link href={`/results/${gs.game.schedule.id}`} className="hover:text-[#60a5fa] transition-colors">
                          vs {gs.game.schedule.opponent}
                        </Link>
                      </td>
                      <td className="py-2 px-2 text-[#64748b] hidden sm:table-cell">{gs.position ?? '–'}</td>
                      <td className="py-2 px-2 text-[#64748b] hidden sm:table-cell">{gs.battingOrder ?? '–'}</td>
                      <td className="py-2 px-2 text-[#94a3b8]">{gs.atBats}</td>
                      <td className="py-2 px-2 font-bold text-[#e2e8f0]">{gs.hits}</td>
                      <td className="py-2 px-2 text-[#94a3b8]">{gs.rbi}</td>
                      <td className="py-2 px-2 text-[#94a3b8] hidden sm:table-cell">{gs.runs}</td>
                      <td className={`py-2 px-2 font-mono ${
                        gs.atBats > 0 && gs.hits / gs.atBats >= 0.3 ? 'text-[#22c55e]' : 'text-[#64748b]'
                      }`}>{avg}</td>
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
