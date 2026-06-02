import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { calcBatterStats, cellColor, codeToJa, type ScoreBookData, type BatterStats } from '@/lib/scorebook'

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

function avgStr(h: number, ab: number) {
  return ab > 0 ? (h / ab).toFixed(3).replace('0.', '.') : '---'
}

// 打撃成績テーブルの合計列定義
const STAT_COLS: { key: keyof BatterStats; label: string; always?: boolean }[] = [
  { key: 'ab',       label: '打数', always: true },
  { key: 'h',        label: '安打', always: true },
  // 打率は別途算出
  { key: 'doubles',  label: '二' },
  { key: 'triples',  label: '三' },
  { key: 'homeRuns', label: '本' },
  { key: 'rbi',      label: '打点', always: true },
  { key: 'sb',       label: '盗塁' },
  { key: 'bb',       label: '四球' },
  { key: 'hbp',      label: '死球' },
  { key: 'sac',      label: '犠打' },
  { key: 'sf',       label: '犠飛' },
]

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

  // スコアブック JSON をパース（イニング別の打撃結果）
  let scorebook: ScoreBookData | null = null
  if (game.scorebook) {
    try { scorebook = JSON.parse(game.scorebook) } catch { /* ignore */ }
  }

  // イニングスコアをパース（専用カラム優先 → 無ければスコアブックJSONから復元）
  let inningScores: { blitz: (number | null)[]; opponent: (number | null)[] } | null = null
  if (game.inningScores) {
    try { inningScores = JSON.parse(game.inningScores) } catch { /* ignore */ }
  }
  if (!inningScores && scorebook?.inningScores) {
    inningScores = {
      blitz:    scorebook.inningScores.our,
      opponent: scorebook.inningScores.opponent,
    }
  }

  // スコアブックの打者に紐づく選手名を取得
  let playerMap = new Map<string, { name: string; number: number | null }>()
  if (scorebook) {
    const userIds = Array.from(new Set(
      scorebook.batters
        .flatMap(b => [b.userId, ...(b.subs?.map(s => s.userId) ?? [])])
        .filter(Boolean)
    ))
    if (userIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, number: true },
      })
      playerMap = new Map(users.map(u => [u.id, { name: u.name ?? '', number: u.number ?? null }]))
    }
  }

  // スコアブックがある場合: イニング別＋合計を1テーブルで表示するための行データを構築
  const innings = scorebook?.innings ?? inningScores?.blitz.length ?? 7
  const bookRows = scorebook
    ? scorebook.batters
        .filter(b => b.userId && (Object.keys(b.cells).length > 0 || (b.subs?.length ?? 0) > 0))
        .map(b => {
          const stats = calcBatterStats(b.cells)
          const player = playerMap.get(b.userId)
          const subNames = (b.subs ?? [])
            .map(s => playerMap.get(s.userId))
            .filter(Boolean)
            .map((p, i) => `${p!.number != null ? `#${p!.number} ` : ''}${p!.name}（${b.subs![i].fromInning}回〜）`)
          return {
            order: b.order,
            name: player?.name ?? '(未設定)',
            number: player?.number ?? null,
            position: b.position ?? '',
            cells: b.cells,
            stats,
            subNames,
          }
        })
        .sort((a, b) => a.order - b.order)
    : []

  // チーム集計（スコアブックがあればそこから、なければ game.stats から）
  const totals = scorebook
    ? bookRows.reduce(
        (acc, r) => {
          for (const k of Object.keys(acc) as (keyof BatterStats)[]) acc[k] += r.stats[k]
          return acc
        },
        { ...{ pa: 0, ab: 0, h: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0, sb: 0, bb: 0, hbp: 0, sac: 0, sf: 0, k: 0 } } as BatterStats
      )
    : game.stats.reduce(
        (acc, s) => ({
          ...acc,
          ab:  acc.ab  + s.atBats,
          h:   acc.h   + s.hits,
          homeRuns: acc.homeRuns + s.homeRuns,
          rbi: acc.rbi + s.rbi,
          sb:  acc.sb  + s.stolenBases,
          bb:  acc.bb  + s.walks,
          hbp: acc.hbp + s.hitByPitch,
          sac: acc.sac + s.sacrificeBunts,
          sf:  acc.sf  + s.sacrificeFlies,
          doubles: acc.doubles + s.doubles,
          triples: acc.triples + s.triples,
        }),
        { pa: 0, ab: 0, h: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0, sb: 0, bb: 0, hbp: 0, sac: 0, sf: 0, k: 0 } as BatterStats
      )
  const teamAvg = avgStr(totals.h, totals.ab)

  return (
    <div className="pt-16 max-w-6xl mx-auto px-4 py-12">
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

        <div className="flex flex-row items-start justify-center gap-3 sm:gap-8">
          <div className="text-center flex-1 min-w-0">
            <div className="text-xs sm:text-sm text-[#60a5fa] font-bold mb-1 truncate">BLITZ</div>
            <div
              className={`text-4xl sm:text-6xl font-black ${
                game.result === 'WIN' ? 'text-[#22c55e]' :
                game.result === 'LOSE' ? 'text-[#ef4444]' : 'text-[#f59e0b]'
              }`}
            >
              {game.ourScore}
            </div>
          </div>

          <div className="flex flex-col items-center gap-1 pt-3 sm:pt-4 shrink-0">
            <span
              className={`text-xs sm:text-sm font-bold px-2 sm:px-3 py-1 rounded-full whitespace-nowrap ${
                game.result === 'WIN'  ? 'bg-green-900/30 text-[#22c55e]' :
                game.result === 'LOSE' ? 'bg-red-900/30 text-[#ef4444]'   :
                                         'bg-yellow-900/30 text-[#f59e0b]'
              }`}
            >
              {game.result === 'WIN' ? '勝利' : game.result === 'LOSE' ? '敗戦' : '引分'}
            </span>
            <span className="text-[#1e3a5f] text-xl sm:text-2xl font-black">–</span>
          </div>

          <div className="text-center flex-1 min-w-0">
            <div className="text-xs sm:text-sm text-[#64748b] font-bold mb-1 truncate">{schedule.opponent}</div>
            <div className="text-4xl sm:text-6xl font-black text-[#64748b]">{game.opponentScore}</div>
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

      {/* 打者成績（イニング別 + 合計） */}
      {scorebook && bookRows.length > 0 ? (
        <div className="glass-card rounded-2xl p-4 mb-6">
          <h2 className="text-sm font-bold text-[#94a3b8] uppercase tracking-wider mb-2">
            打者成績
          </h2>
          <p className="text-[10px] text-[#475569] mb-2">← 横スクロールでイニング別結果・全成績を確認</p>
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse min-w-[640px]">
              <thead>
                <tr className="text-[#64748b] border-b border-[#1e3a5f]">
                  <th className="py-2 pr-1 text-center w-6">#</th>
                  <th className="py-2 px-2 text-left w-32">選手</th>
                  {Array.from({ length: innings }, (_, i) => (
                    <th key={i} className="py-2 px-1 text-center"
                      style={{ minWidth: '52px', borderLeft: '1px solid #1e3a5f' }}>{i + 1}</th>
                  ))}
                  <th className="py-2 px-2 text-center w-12" style={{ borderLeft: '1px solid #1e3a5f' }}>打率</th>
                  {STAT_COLS.map(c => (
                    <th key={c.key} className="py-2 px-1 text-center w-9">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bookRows.map((r, idx) => (
                  <tr key={r.order} className={`border-b border-[#0f2035]/60 ${idx % 2 === 0 ? '' : 'bg-[#0a1628]/20'}`}>
                    <td className="py-1.5 pr-1 text-center text-[#64748b]">{r.order}</td>
                    <td className="py-1.5 px-2">
                      <div className="flex items-center gap-1.5">
                        {r.number != null && (
                          <span className="text-[10px] text-[#475569] shrink-0">#{r.number}</span>
                        )}
                        <span className="font-medium text-[#e2e8f0]">{r.name}</span>
                      </div>
                      {r.subNames.length > 0 && (
                        <div className="text-[10px] text-[#a78bfa] mt-0.5">↳ {r.subNames.join(' / ')}</div>
                      )}
                    </td>
                    {Array.from({ length: innings }, (_, i) => {
                      const raw = r.cells[i + 1] ?? ''
                      const parts = raw.split(',').filter(Boolean)
                      return (
                        <td key={i} className="py-1.5 px-1 text-center align-middle"
                          style={{ borderLeft: '1px solid #1e3a5f' }}>
                          {parts.length === 0 ? (
                            <span className="text-[#1e3a5f]">–</span>
                          ) : (
                            <div className="flex flex-col items-center gap-0.5">
                              {parts.map((p, j) => {
                                const ja = codeToJa(p)
                                return ja ? (
                                  <span key={j} className={`${cellColor(p)} whitespace-nowrap`}>{ja}</span>
                                ) : null
                              })}
                            </div>
                          )}
                        </td>
                      )
                    })}
                    <td className={`py-1.5 px-2 text-center font-mono ${r.stats.ab > 0 && r.stats.h / r.stats.ab >= 0.3 ? 'text-[#22c55e]' : 'text-[#94a3b8]'}`}
                      style={{ borderLeft: '1px solid #1e3a5f' }}>
                      {avgStr(r.stats.h, r.stats.ab)}
                    </td>
                    {STAT_COLS.map(c => {
                      const v = r.stats[c.key]
                      const highlight = c.key === 'h' ? 'font-bold text-[#e2e8f0]'
                        : c.key === 'homeRuns' && v > 0 ? 'text-[#fbbf24] font-bold'
                        : c.key === 'rbi' && v > 0 ? 'text-[#60a5fa]'
                        : v > 0 ? 'text-[#94a3b8]' : 'text-[#475569]'
                      return (
                        <td key={c.key} className={`py-1.5 px-1 text-center ${highlight}`}>
                          {v}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#1e3a5f] font-bold">
                  <td colSpan={2} className="py-2 px-2 text-[#64748b]">チーム計</td>
                  <td colSpan={innings} style={{ borderLeft: '1px solid #1e3a5f' }} />
                  <td className="py-2 px-2 text-center font-mono text-[#60a5fa]" style={{ borderLeft: '1px solid #1e3a5f' }}>{teamAvg}</td>
                  {STAT_COLS.map(c => (
                    <td key={c.key} className={`py-2 px-1 text-center ${
                      c.key === 'homeRuns' ? 'text-[#fbbf24]' : c.key === 'rbi' ? 'text-[#60a5fa]' : 'text-[#e2e8f0]'
                    }`}>
                      {totals[c.key]}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : game.stats.length > 0 ? (
        /* スコアブック JSON が無い旧データ: 合計のみのフォールバック表示 */
        <div className="glass-card rounded-2xl p-4 mb-6">
          <h2 className="text-sm font-bold text-[#94a3b8] uppercase tracking-wider mb-2">
            打者成績
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[420px]">
              <thead>
                <tr className="text-xs text-[#64748b] border-b border-[#1e3a5f]">
                  <th className="py-2 pr-1 text-center w-6">#</th>
                  <th className="py-2 px-2 text-left">選手</th>
                  <th className="py-2 px-2 text-center w-10">打数</th>
                  <th className="py-2 px-2 text-center w-10">安打</th>
                  <th className="py-2 px-2 text-center w-12">打率</th>
                  <th className="py-2 px-2 text-center w-10 hidden sm:table-cell">本</th>
                  <th className="py-2 px-2 text-center w-10">打点</th>
                  <th className="py-2 px-2 text-center w-10 hidden sm:table-cell">盗塁</th>
                  <th className="py-2 px-2 text-center w-10 hidden sm:table-cell">2B</th>
                  <th className="py-2 px-2 text-center w-10 hidden sm:table-cell">3B</th>
                  <th className="py-2 px-2 text-center w-10 hidden sm:table-cell">四球</th>
                </tr>
              </thead>
              <tbody>
                {game.stats.map((s, i) => (
                  <tr key={s.id} className={`border-b border-[#0f2035]/60 ${i % 2 === 0 ? '' : 'bg-[#0a1628]/20'}`}>
                    <td className="py-2 pr-1 text-center text-[#64748b] text-xs">{s.battingOrder ?? '–'}</td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1.5">
                        {s.user.number != null && (
                          <span className="text-xs text-[#475569]">#{s.user.number}</span>
                        )}
                        <span className="font-medium text-[#e2e8f0] text-sm">{s.user.name}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center text-[#94a3b8]">{s.atBats}</td>
                    <td className="py-2 px-2 text-center font-bold text-[#e2e8f0]">{s.hits}</td>
                    <td className="py-2 px-2 text-center font-mono text-xs text-[#64748b]">{avgStr(s.hits, s.atBats)}</td>
                    <td className="py-2 px-2 text-center hidden sm:table-cell">{s.homeRuns || 0}</td>
                    <td className="py-2 px-2 text-center">{s.rbi || 0}</td>
                    <td className="py-2 px-2 text-center text-[#94a3b8] hidden sm:table-cell">{s.stolenBases || 0}</td>
                    <td className="py-2 px-2 text-center text-[#94a3b8] hidden sm:table-cell">{s.doubles || 0}</td>
                    <td className="py-2 px-2 text-center text-[#94a3b8] hidden sm:table-cell">{s.triples || 0}</td>
                    <td className="py-2 px-2 text-center text-[#94a3b8] hidden sm:table-cell">{s.walks || 0}</td>
                  </tr>
                ))}
              </tbody>
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
    </div>
  )
}
