import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { notFound } from 'next/navigation'

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })
}

function typeLabel(type: string) {
  if (type === 'REGULAR')    return { label: '公式戦',    cls: 'text-[#60a5fa] border-[#1d4ed8]/40 bg-[#1d4ed8]/10' }
  if (type === 'TOURNAMENT') return { label: 'トーナメント', cls: 'text-[#fbbf24] border-[#d97706]/40 bg-[#d97706]/10' }
  return                            { label: '練習試合',  cls: 'text-[#94a3b8] border-[#1e3a5f]    bg-[#1e3a5f]/20'  }
}

export default async function GameDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const schedule = await prisma.schedule.findUnique({
    where: { id },
    include: {
      game: {
        include: {
          stats: {
            include: { user: { select: { name: true, number: true } } },
            orderBy: [{ battingOrder: 'asc' }, { plateAppearances: 'desc' }],
          },
          pitchingStats: {
            include: { user: { select: { name: true, number: true } } },
            orderBy: { id: 'asc' },
          },
        },
      },
    },
  })

  if (!schedule || !schedule.game) notFound()

  const game = schedule.game
  const { label: typeLabel2, cls: typeCls } = typeLabel(schedule.type)

  // イニングスコアをパース
  let inningScores: { blitz: (number | null)[]; opponent: (number | null)[] } | null = null
  if (game.inningScores) {
    try { inningScores = JSON.parse(game.inningScores) } catch { /* ignore */ }
  }

  // 打者成績（全選手表示: 途中出場・守備のみも含む）
  const battingStats = game.stats

  // チーム集計
  const totals = battingStats.reduce(
    (acc, s) => ({
      pa:  acc.pa  + s.plateAppearances,
      ab:  acc.ab  + s.atBats,
      h:   acc.h   + s.hits,
      hr:  acc.hr  + s.homeRuns,
      rbi: acc.rbi + s.rbi,
      r:   acc.r   + s.runs,
      sb:  acc.sb  + s.stolenBases,
      so:  acc.so  + s.strikeouts,
      bb:  acc.bb  + s.walks,
      hbp: acc.hbp + s.hitByPitch,
      sac: acc.sac + s.sacrificeBunts,
      sf:  acc.sf  + s.sacrificeFlies,
      d:   acc.d   + s.doubles,
      t:   acc.t   + s.triples,
    }),
    { pa: 0, ab: 0, h: 0, hr: 0, rbi: 0, r: 0, sb: 0, so: 0, bb: 0, hbp: 0, sac: 0, sf: 0, d: 0, t: 0 }
  )
  const teamAvg = totals.ab > 0 ? (totals.h / totals.ab).toFixed(3).replace('0.', '.') : '---'

  return (
    <div className="pt-16 max-w-5xl mx-auto px-4 py-12">
      {/* パンくずリスト */}
      <div className="flex items-center gap-2 text-sm text-[#64748b] mb-6">
        <Link href="/results" className="hover:text-[#60a5fa] transition-colors">試合結果</Link>
        <span>›</span>
        <span className="text-[#94a3b8]">詳細</span>
      </div>

      {/* ゲームヘッダー */}
      <div className="glass-card rounded-2xl p-6 mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${typeCls}`}>
            {typeLabel2}
          </span>
          <span className="text-sm text-[#64748b]">{formatDate(schedule.date)}</span>
          {schedule.startTime && (
            <span className="text-sm text-[#64748b]">⚾ {schedule.startTime}〜</span>
          )}
          {schedule.location && (
            <span className="text-sm text-[#64748b]">📍 {schedule.location}</span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-8">
          <div className="text-center flex-1">
            <div className="text-sm text-[#60a5fa] font-bold mb-1">BLITZ</div>
            <div
              className={`text-6xl font-black ${
                game.result === 'WIN' ? 'text-[#22c55e]' :
                game.result === 'LOSE' ? 'text-[#ef4444]' : 'text-[#f59e0b]'
              }`}
            >
              {game.ourScore}
            </div>
          </div>

          <div className="flex flex-col items-center gap-1 pt-4">
            <span
              className={`text-sm font-bold px-3 py-1 rounded-full ${
                game.result === 'WIN'  ? 'bg-green-900/30 text-[#22c55e]' :
                game.result === 'LOSE' ? 'bg-red-900/30 text-[#ef4444]'   :
                                         'bg-yellow-900/30 text-[#f59e0b]'
              }`}
            >
              {game.result === 'WIN' ? '勝利' : game.result === 'LOSE' ? '敗戦' : '引分'}
            </span>
            <span className="text-[#1e3a5f] text-2xl font-black">–</span>
          </div>

          <div className="text-center flex-1">
            <div className="text-sm text-[#64748b] font-bold mb-1">{schedule.opponent}</div>
            <div className="text-6xl font-black text-[#64748b]">{game.opponentScore}</div>
          </div>
        </div>
      </div>

      {/* イニングスコア */}
      {inningScores && (
        <div className="glass-card rounded-2xl p-4 mb-6 overflow-x-auto">
          <h2 className="text-sm font-bold text-[#94a3b8] uppercase tracking-wider mb-3">
            イニング
          </h2>
          <table className="w-full text-sm text-center border-collapse min-w-[480px]">
            <thead>
              <tr className="text-[#64748b] text-xs">
                <th className="text-left py-2 pr-4 font-medium w-24">チーム</th>
                {inningScores.blitz.map((_, i) => (
                  <th key={i} className="w-9 py-2">{i + 1}</th>
                ))}
                <th className="w-12 py-2 text-[#94a3b8] font-bold">計</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-[#1e3a5f]/50">
                <td className="text-left py-2 pr-4 font-bold text-[#60a5fa]">BLITZ</td>
                {inningScores.blitz.map((v, i) => (
                  <td key={i} className={`py-2 font-mono ${v !== null && v > 0 ? 'text-[#e2e8f0] font-bold' : 'text-[#475569]'}`}>
                    {v === null ? '–' : v}
                  </td>
                ))}
                <td className="py-2 font-black text-lg text-[#e2e8f0]">{game.ourScore}</td>
              </tr>
              <tr className="border-t border-[#1e3a5f]/50">
                <td className="text-left py-2 pr-4 font-medium text-[#94a3b8]">{schedule.opponent}</td>
                {inningScores.opponent.map((v, i) => (
                  <td key={i} className={`py-2 font-mono ${v !== null && v > 0 ? 'text-[#ef4444]' : 'text-[#475569]'}`}>
                    {v === null ? '–' : v}
                  </td>
                ))}
                <td className="py-2 font-black text-lg text-[#64748b]">{game.opponentScore}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* 打者成績 */}
      {battingStats.length > 0 ? (
        <div className="glass-card rounded-2xl p-4 mb-6">
          <h2 className="text-sm font-bold text-[#94a3b8] uppercase tracking-wider mb-2">
            打者成績
          </h2>
          <p className="text-[10px] text-[#475569] mb-2 sm:hidden">← 横スクロールで全成績を確認</p>
          <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[420px]">
            <thead>
              <tr className="text-xs text-[#64748b] border-b border-[#1e3a5f]">
                <th className="py-2 pr-1 text-center w-6">#</th>
                <th className="py-2 px-2 text-left">選手</th>
                <th className="py-2 px-2 text-center w-10 hidden sm:table-cell">守備</th>
                <th className="py-2 px-2 text-center w-10 hidden sm:table-cell" title="打席">打席</th>
                <th className="py-2 px-2 text-center w-10" title="打数">打数</th>
                <th className="py-2 px-2 text-center w-10" title="安打">安打</th>
                <th className="py-2 px-2 text-center w-12" title="打率">打率</th>
                <th className="py-2 px-2 text-center w-10 hidden sm:table-cell" title="本塁打">本</th>
                <th className="py-2 px-2 text-center w-10" title="打点">打点</th>
                <th className="py-2 px-2 text-center w-10 hidden sm:table-cell" title="得点">得点</th>
                <th className="py-2 px-2 text-center w-10 hidden sm:table-cell" title="盗塁">盗塁</th>
                <th className="py-2 px-2 text-center w-10 hidden sm:table-cell" title="二塁打">2B</th>
                <th className="py-2 px-2 text-center w-10 hidden sm:table-cell" title="三塁打">3B</th>
                <th className="py-2 px-2 text-center w-10 hidden sm:table-cell" title="四球">四球</th>
                <th className="py-2 px-2 text-center w-10 hidden sm:table-cell" title="死球">死球</th>
                <th className="py-2 px-2 text-center w-10 hidden sm:table-cell" title="犠打">犠打</th>
                <th className="py-2 px-2 text-center w-10 hidden sm:table-cell" title="犠飛">犠飛</th>
              </tr>
            </thead>
            <tbody>
              {battingStats.map((s, i) => {
                const avg = s.atBats > 0
                  ? (s.hits / s.atBats).toFixed(3).replace('0.', '.')
                  : '---'
                return (
                  <tr key={s.id} className={`border-b border-[#0f2035]/60 hover:bg-[#1e3a5f]/10 ${i % 2 === 0 ? '' : 'bg-[#0a1628]/20'}`}>
                    <td className="py-2 pr-1 text-center text-[#64748b] text-xs">{s.battingOrder ?? '–'}</td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1.5">
                        {s.user.number != null && (
                          <span className="text-xs text-[#475569] w-5 text-right shrink-0">{s.user.number}</span>
                        )}
                        <span className="font-medium text-[#e2e8f0] text-sm">{s.user.name}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center text-[#64748b] text-xs hidden sm:table-cell">{s.position ?? '–'}</td>
                    <td className="py-2 px-2 text-center text-[#94a3b8] hidden sm:table-cell">{s.plateAppearances || '–'}</td>
                    <td className="py-2 px-2 text-center text-[#94a3b8]">{s.atBats}</td>
                    <td className="py-2 px-2 text-center font-bold text-[#e2e8f0]">{s.hits}</td>
                    <td className={`py-2 px-2 text-center font-mono text-xs ${s.atBats > 0 && s.hits / s.atBats >= 0.3 ? 'text-[#22c55e]' : 'text-[#64748b]'}`}>{avg}</td>
                    <td className="py-2 px-2 text-center hidden sm:table-cell">{s.homeRuns > 0 ? <span className="text-[#fbbf24] font-bold">{s.homeRuns}</span> : <span className="text-[#475569]">0</span>}</td>
                    <td className="py-2 px-2 text-center">{s.rbi > 0 ? <span className="text-[#60a5fa]">{s.rbi}</span> : <span className="text-[#475569]">0</span>}</td>
                    <td className="py-2 px-2 text-center text-[#94a3b8] hidden sm:table-cell">{s.runs}</td>
                    <td className="py-2 px-2 text-center text-[#94a3b8] hidden sm:table-cell">{s.stolenBases || 0}</td>
                    <td className="py-2 px-2 text-center text-[#94a3b8] hidden sm:table-cell">{s.doubles || 0}</td>
                    <td className="py-2 px-2 text-center text-[#94a3b8] hidden sm:table-cell">{s.triples || 0}</td>
                    <td className="py-2 px-2 text-center text-[#94a3b8] hidden sm:table-cell">{s.walks}</td>
                    <td className="py-2 px-2 text-center text-[#94a3b8] hidden sm:table-cell">{s.hitByPitch || 0}</td>
                    <td className="py-2 px-2 text-center text-[#94a3b8] hidden sm:table-cell">{s.sacrificeBunts || 0}</td>
                    <td className="py-2 px-2 text-center text-[#94a3b8] hidden sm:table-cell">{s.sacrificeFlies || 0}</td>
                  </tr>
                )
              })}
            </tbody>
            {/* チーム合計 */}
            <tfoot>
              <tr className="border-t-2 border-[#1e3a5f] text-xs font-bold">
                <td colSpan={2} className="py-2 px-2 text-[#64748b]">チーム計</td>
                <td className="py-2 px-2 text-center text-[#94a3b8] hidden sm:table-cell"></td>
                <td className="py-2 px-2 text-center text-[#94a3b8] hidden sm:table-cell">{totals.pa}</td>
                <td className="py-2 px-2 text-center text-[#94a3b8]">{totals.ab}</td>
                <td className="py-2 px-2 text-center text-[#e2e8f0]">{totals.h}</td>
                <td className="py-2 px-2 text-center font-mono text-[#60a5fa]">{teamAvg}</td>
                <td className="py-2 px-2 text-center text-[#fbbf24] hidden sm:table-cell">{totals.hr}</td>
                <td className="py-2 px-2 text-center text-[#60a5fa]">{totals.rbi}</td>
                <td className="py-2 px-2 text-center hidden sm:table-cell">{totals.r}</td>
                <td className="py-2 px-2 text-center hidden sm:table-cell">{totals.sb}</td>
                <td className="py-2 px-2 text-center hidden sm:table-cell">{totals.d}</td>
                <td className="py-2 px-2 text-center hidden sm:table-cell">{totals.t}</td>
                <td className="py-2 px-2 text-center hidden sm:table-cell">{totals.bb}</td>
                <td className="py-2 px-2 text-center hidden sm:table-cell">{totals.hbp}</td>
                <td className="py-2 px-2 text-center hidden sm:table-cell">{totals.sac}</td>
                <td className="py-2 px-2 text-center hidden sm:table-cell">{totals.sf}</td>
              </tr>
            </tfoot>
          </table>
          </div>
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-8 text-center text-[#64748b]">
          打者成績データはありません
        </div>
      )}

      {/* 投手成績 */}
      {game.pitchingStats.length > 0 && (
        <div className="glass-card rounded-2xl p-4 mb-6">
          <h2 className="text-sm font-bold text-[#94a3b8] uppercase tracking-wider mb-2">
            投手成績
          </h2>
          <p className="text-[10px] text-[#475569] mb-2 sm:hidden">← 横スクロールで全成績を確認</p>
          <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[300px]">
            <thead>
              <tr className="text-xs text-[#64748b] border-b border-[#1e3a5f]">
                <th className="py-2 px-2 text-left">選手</th>
                <th className="py-2 px-2 text-center w-12" title="勝敗セーブ">勝敗</th>
                <th className="py-2 px-2 text-center w-16" title="投球回">投球回</th>
                <th className="py-2 px-2 text-center w-12" title="失点">失点</th>
                <th className="py-2 px-2 text-center w-12 hidden sm:table-cell" title="自責点">自責点</th>
                <th className="py-2 px-2 text-center w-12 hidden sm:table-cell" title="被安打">被安打</th>
                <th className="py-2 px-2 text-center w-12 hidden sm:table-cell" title="奪三振">奪三振</th>
                <th className="py-2 px-2 text-center w-12 hidden sm:table-cell" title="与四球">与四球</th>
                <th className="py-2 px-2 text-center w-12 hidden sm:table-cell" title="投球数">投球数</th>
              </tr>
            </thead>
            <tbody>
              {game.pitchingStats.map((p, i) => (
                <tr key={p.id} className={`border-b border-[#0f2035]/60 hover:bg-[#1e3a5f]/10 ${i % 2 === 0 ? '' : 'bg-[#0a1628]/20'}`}>
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-2">
                      {p.user.number != null && (
                        <span className="text-xs text-[#475569] w-6 text-right">{p.user.number}</span>
                      )}
                      <span className="font-medium text-[#e2e8f0]">{p.user.name}</span>
                    </div>
                  </td>
                  <td className="py-2 px-2 text-center">
                    {p.decision ? (
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        p.decision === '勝' ? 'text-[#22c55e] bg-green-900/30' :
                        p.decision === '負' ? 'text-[#ef4444] bg-red-900/30' :
                        p.decision === 'S' ? 'text-[#fbbf24] bg-yellow-900/30' :
                        'text-[#94a3b8] bg-[#1e3a5f]/30'
                      }`}>{p.decision}</span>
                    ) : (
                      <span className="text-[#475569]">–</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-center font-mono text-[#94a3b8]">{p.innings}</td>
                  <td className="py-2 px-2 text-center text-[#94a3b8]">{p.runsAllowed}</td>
                  <td className="py-2 px-2 text-center text-[#94a3b8] hidden sm:table-cell">{p.earnedRuns}</td>
                  <td className="py-2 px-2 text-center text-[#94a3b8] hidden sm:table-cell">{p.hitsAllowed}</td>
                  <td className="py-2 px-2 text-center text-[#94a3b8] hidden sm:table-cell">{p.strikeouts}</td>
                  <td className="py-2 px-2 text-center text-[#94a3b8] hidden sm:table-cell">{p.walks}</td>
                  <td className="py-2 px-2 text-center text-[#94a3b8] hidden sm:table-cell">{p.pitches || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {game.note && (
        <div className="glass-card rounded-2xl p-4 mb-6 text-sm text-[#94a3b8]">
          📝 {game.note}
        </div>
      )}

      {/* スコア表写真 */}
      {game.scorePhoto && (
        <div className="glass-card rounded-2xl p-4 mb-6">
          <h2 className="text-sm font-bold text-[#94a3b8] uppercase tracking-wider mb-3">
            📷 スコア表
          </h2>
          <img
            src={game.scorePhoto}
            alt="スコア表"
            className="w-full rounded-xl object-contain max-h-[40rem] bg-[#0d1b2a]"
          />
        </div>
      )}
    </div>
  )
}
