import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { sendToLineGroup, buildGameResult } from '@/lib/line'

async function saveGameResult(formData: FormData) {
  'use server'
  const scheduleId = String(formData.get('scheduleId'))
  const ourScore = parseInt(String(formData.get('ourScore')))
  const opponentScore = parseInt(String(formData.get('opponentScore')))

  let result: 'WIN' | 'LOSE' | 'DRAW'
  if (ourScore > opponentScore) result = 'WIN'
  else if (ourScore < opponentScore) result = 'LOSE'
  else result = 'DRAW'

  const game = await prisma.game.upsert({
    where: { scheduleId },
    create: {
      scheduleId,
      ourScore,
      opponentScore,
      result,
      note: String(formData.get('note') || ''),
    },
    update: {
      ourScore,
      opponentScore,
      result,
      note: String(formData.get('note') || ''),
    },
  })

  const players = await prisma.user.findMany({ orderBy: [{ number: 'asc' }, { name: 'asc' }] })
  for (const player of players) {
    const pa   = parseInt(String(formData.get(`pa_${player.id}`)  || '0')) || 0
    const ab   = parseInt(String(formData.get(`ab_${player.id}`)  || '0')) || 0
    const h    = parseInt(String(formData.get(`h_${player.id}`)   || '0')) || 0
    const d2   = parseInt(String(formData.get(`2b_${player.id}`)  || '0')) || 0
    const d3   = parseInt(String(formData.get(`3b_${player.id}`)  || '0')) || 0
    const hr   = parseInt(String(formData.get(`hr_${player.id}`)  || '0')) || 0
    const rbi  = parseInt(String(formData.get(`rbi_${player.id}`) || '0')) || 0
    const r    = parseInt(String(formData.get(`r_${player.id}`)   || '0')) || 0
    const bb   = parseInt(String(formData.get(`bb_${player.id}`)  || '0')) || 0
    const k    = parseInt(String(formData.get(`k_${player.id}`)   || '0')) || 0
    const sb   = parseInt(String(formData.get(`sb_${player.id}`)  || '0')) || 0
    const hbp  = parseInt(String(formData.get(`hbp_${player.id}`) || '0')) || 0
    const sac  = parseInt(String(formData.get(`sac_${player.id}`) || '0')) || 0
    const sf   = parseInt(String(formData.get(`sf_${player.id}`)  || '0')) || 0
    const order = parseInt(String(formData.get(`order_${player.id}`) || '0')) || null
    const pos  = String(formData.get(`pos_${player.id}`) || '') || null

    if (ab > 0 || h > 0 || pa > 0 || bb > 0 || hbp > 0 || sac > 0 || sf > 0) {
      await prisma.gameStat.upsert({
        where: { userId_gameId: { userId: player.id, gameId: game.id } },
        create: {
          userId: player.id,
          gameId: game.id,
          plateAppearances: pa,
          atBats: ab,
          hits: h,
          doubles: d2,
          triples: d3,
          homeRuns: hr,
          rbi,
          runs: r,
          walks: bb,
          strikeouts: k,
          stolenBases: sb,
          hitByPitch: hbp,
          sacrificeBunts: sac,
          sacrificeFlies: sf,
          battingOrder: order,
          position: pos,
        },
        update: {
          plateAppearances: pa,
          atBats: ab,
          hits: h,
          doubles: d2,
          triples: d3,
          homeRuns: hr,
          rbi,
          runs: r,
          walks: bb,
          strikeouts: k,
          stolenBases: sb,
          hitByPitch: hbp,
          sacrificeBunts: sac,
          sacrificeFlies: sf,
          battingOrder: order,
          position: pos,
        },
      })
    }

    // Pitching stats
    const pInn = String(formData.get(`p_inn_${player.id}`) || '').trim()
    const pPitches = parseInt(String(formData.get(`p_pitches_${player.id}`) || '0')) || 0
    const pH  = parseInt(String(formData.get(`p_h_${player.id}`)  || '0')) || 0
    const pBb = parseInt(String(formData.get(`p_bb_${player.id}`) || '0')) || 0
    const pK  = parseInt(String(formData.get(`p_k_${player.id}`)  || '0')) || 0
    const pR  = parseInt(String(formData.get(`p_r_${player.id}`)  || '0')) || 0
    const pEr = parseInt(String(formData.get(`p_er_${player.id}`) || '0')) || 0
    const pDec = String(formData.get(`p_dec_${player.id}`) || '').trim() || null

    // Save pitching stat only if innings field is filled
    if (pInn !== '' && pInn !== '0') {
      await prisma.pitchingStat.upsert({
        where: { userId_gameId: { userId: player.id, gameId: game.id } },
        create: {
          userId: player.id,
          gameId: game.id,
          innings: pInn,
          pitches: pPitches,
          hitsAllowed: pH,
          walks: pBb,
          strikeouts: pK,
          runsAllowed: pR,
          earnedRuns: pEr,
          decision: pDec,
        },
        update: {
          innings: pInn,
          pitches: pPitches,
          hitsAllowed: pH,
          walks: pBb,
          strikeouts: pK,
          runsAllowed: pR,
          earnedRuns: pEr,
          decision: pDec,
        },
      })
    }
  }

  // LINE通知（チェックボックスが ON の場合のみ）
  if (formData.get('sendLine') === 'on') {
    const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } })
    if (schedule) {
      const msg = buildGameResult(schedule, {
        ourScore,
        opponentScore,
        result,
        note: String(formData.get('note') || '') || null,
      })
      await sendToLineGroup(msg)
    }
  }

  revalidatePath('/results')
  revalidatePath('/stats')
  revalidatePath('/')
  // 編集後は同じ試合ページに戻る
  redirect(`/admin/game?scheduleId=${scheduleId}`)
}

export default async function AdminGamePage({
  searchParams,
}: {
  searchParams: Promise<{ scheduleId?: string }>
}) {
  const sp = await searchParams

  const lineConfigured = !!(process.env.LINE_CHANNEL_ACCESS_TOKEN && process.env.LINE_GROUP_ID)

  const [schedules, allPlayers] = await Promise.all([
    // 結果入力済みも含めて全試合を表示
    prisma.schedule.findMany({
      orderBy: { date: 'desc' },
      take: 30,
      include: { game: { select: { id: true } } },
    }),
    prisma.user.findMany({
      orderBy: [{ number: 'asc' }, { name: 'asc' }],
    }),
  ])

  const selectedId = sp.scheduleId ?? schedules[0]?.id
  const selected = selectedId
    ? schedules.find((s) => s.id === selectedId) ??
      (await prisma.schedule.findUnique({ where: { id: selectedId } }))
    : null

  // 既存の試合結果・個人成績を取得（編集用の初期値）
  const existingGame = selectedId
    ? await prisma.game.findUnique({
        where: { scheduleId: selectedId },
        include: {
          stats:         true,
          pitchingStats: true,
        },
      })
    : null

  const existingStatMap  = new Map(existingGame?.stats.map(s => [s.userId, s])         ?? [])
  const existingPitchMap = new Map(existingGame?.pitchingStats.map(s => [s.userId, s]) ?? [])

  // Fetch lineup for pre-filling batting order and position
  const lineup = selectedId
    ? await prisma.lineup.findMany({
        where: { scheduleId: selectedId },
        include: { user: true },
        orderBy: { battingOrder: 'asc' },
      })
    : []

  const lineupMap = new Map(lineup.map((l) => [l.userId, l]))
  const lineupPlayerIds = new Set(lineup.map((l) => l.userId))

  // Lineup players first (sorted by batting order), then the rest
  const lineupPlayers = lineup.map((l) => l.user)
  const otherPlayers  = allPlayers.filter((p) => !lineupPlayerIds.has(p.id))
  const sortedPlayers = [...lineupPlayers, ...otherPlayers]

  return (
    <div className="pt-16 max-w-5xl mx-auto px-4 py-12">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin" className="text-[#64748b] hover:text-[#94a3b8]">← 管理</Link>
        <h1 className="text-2xl font-black text-[#e2e8f0]">試合結果を入力・編集</h1>
      </div>

      {schedules.length === 0 && !selected ? (
        <div className="glass-card rounded-2xl p-12 text-center text-[#64748b]">
          日程が登録されていません。
          <Link href="/admin/schedule" className="text-[#60a5fa] ml-2">日程を追加する</Link>
        </div>
      ) : (
        <>
          {/* Schedule selector */}
          {schedules.length > 0 && (
            <div className="glass-card rounded-2xl p-4 mb-6">
              <label className="block text-xs font-medium text-[#94a3b8] mb-2">試合を選択</label>
              <div className="flex flex-wrap gap-2">
                {schedules.map((s) => (
                  <Link
                    key={s.id}
                    href={`/admin/game?scheduleId=${s.id}`}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                      s.id === selectedId
                        ? 'bg-[#2563eb] border-[#2563eb] text-white'
                        : 'border-[#1e3a5f] text-[#64748b] hover:border-[#2563eb]/50'
                    }`}
                  >
                    {new Date(s.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })} vs {s.opponent}
                    {'game' in s && s.game && <span className="ml-1 text-[#22c55e]">✓</span>}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <form action={saveGameResult} className="flex flex-col gap-6">
            <input type="hidden" name="scheduleId" value={selected?.id ?? ''} />

            {/* Score */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-sm font-bold text-[#94a3b8]">スコア</h3>
                {existingGame && (
                  <span className="text-xs text-[#f59e0b] border border-[#f59e0b]/40 rounded px-2 py-0.5">編集中</span>
                )}
              </div>
              {selected && (
                <p className="text-xs text-[#64748b] mb-4">
                  {new Date(selected.date).toLocaleDateString('ja-JP', {
                    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
                  })}
                  <span className="text-[#fbbf24] ml-2">vs {selected.opponent}</span>
                  <span className="text-[#475569] ml-2">📍 {selected.location}</span>
                </p>
              )}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs text-[#64748b] mb-1.5">BLITZ 得点 *</label>
                  <input type="number" name="ourScore" min="0" required placeholder="0"
                    defaultValue={existingGame?.ourScore ?? ''}
                    className="text-2xl font-black text-center" />
                </div>
                <div>
                  <label className="block text-xs text-[#64748b] mb-1.5">相手 得点 *</label>
                  <input type="number" name="opponentScore" min="0" required placeholder="0"
                    defaultValue={existingGame?.opponentScore ?? ''}
                    className="text-2xl font-black text-center" />
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-xs text-[#64748b] mb-1.5">コメント</label>
                <input type="text" name="note" placeholder="試合のコメント（任意）"
                  defaultValue={existingGame?.note ?? ''} />
              </div>
            </div>

            {/* Player stats */}
            {sortedPlayers.length > 0 && (
              <div className="glass-card rounded-2xl p-6">
                <h3 className="text-sm font-bold text-[#94a3b8] mb-1">個人成績</h3>
                {lineup.length > 0 && (
                  <p className="text-xs text-[#60a5fa] mb-3">
                    ✓ スタメン情報から打順・守備を自動入力しました
                  </p>
                )}
                <p className="text-xs text-[#64748b] mb-4">出場した選手のみ入力してください（未入力の場合は保存されません）</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[960px]">
                    <thead>
                      <tr className="border-b border-[#1e3a5f] text-xs text-[#64748b]">
                        <th className="text-left py-2 px-2">選手</th>
                        <th className="text-center py-2 px-1 w-14">打順</th>
                        <th className="text-center py-2 px-1 w-16">守備</th>
                        <th className="text-center py-2 px-1 w-11">打席</th>
                        <th className="text-center py-2 px-1 w-11">打数</th>
                        <th className="text-center py-2 px-1 w-11">安打</th>
                        <th className="text-center py-2 px-1 w-10">2B</th>
                        <th className="text-center py-2 px-1 w-10">3B</th>
                        <th className="text-center py-2 px-1 w-10">HR</th>
                        <th className="text-center py-2 px-1 w-11">打点</th>
                        <th className="text-center py-2 px-1 w-11">得点</th>
                        <th className="text-center py-2 px-1 w-11">四球</th>
                        <th className="text-center py-2 px-1 w-10">三振</th>
                        <th className="text-center py-2 px-1 w-10">盗塁</th>
                        <th className="text-center py-2 px-1 w-10">死球</th>
                        <th className="text-center py-2 px-1 w-10">犠打</th>
                        <th className="text-center py-2 px-1 w-10">犠飛</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPlayers.map((p) => {
                        const entry    = lineupMap.get(p.id)
                        const existing = existingStatMap.get(p.id)
                        // 既存データがあれば常に表示、なければスタメン選手のみ表示
                        const isVisible = !!entry || !!existing
                        // 打順・守備: 既存データ優先 → スタメン → 空
                        const defaultOrder = existing?.battingOrder ?? entry?.battingOrder ?? ''
                        const defaultPos   = existing?.position    ?? entry?.position    ?? ''
                        const statDefaults: Record<string, number | string> = {
                          pa:  existing?.plateAppearances ?? '',
                          ab:  existing?.atBats           ?? '',
                          h:   existing?.hits             ?? '',
                          '2b': existing?.doubles         ?? '',
                          '3b': existing?.triples         ?? '',
                          hr:  existing?.homeRuns         ?? '',
                          rbi: existing?.rbi              ?? '',
                          r:   existing?.runs             ?? '',
                          bb:  existing?.walks            ?? '',
                          k:   existing?.strikeouts       ?? '',
                          sb:  existing?.stolenBases      ?? '',
                          hbp: existing?.hitByPitch       ?? '',
                          sac: existing?.sacrificeBunts   ?? '',
                          sf:  existing?.sacrificeFlies   ?? '',
                        }
                        return (
                          <tr
                            key={p.id}
                            className={`border-b border-[#0d1b2a] hover:bg-[#0d1b2a]/30 transition-colors ${
                              isVisible ? '' : 'opacity-40'
                            }`}
                          >
                            <td className="py-2 px-2 text-[#94a3b8] whitespace-nowrap text-xs">
                              {p.number != null && (
                                <span className="text-[#60a5fa] mr-1">#{p.number}</span>
                              )}
                              {p.name}
                            </td>
                            <td className="py-1 px-1">
                              <input
                                type="number"
                                name={`order_${p.id}`}
                                min="1" max="20"
                                defaultValue={defaultOrder}
                                placeholder="–"
                                className="w-12 text-center py-1 text-sm"
                              />
                            </td>
                            <td className="py-1 px-1">
                              <input
                                type="text"
                                name={`pos_${p.id}`}
                                defaultValue={defaultPos}
                                placeholder="–"
                                className="w-14 text-center py-1 text-sm"
                              />
                            </td>
                            {(['pa', 'ab', 'h', '2b', '3b', 'hr', 'rbi', 'r', 'bb', 'k', 'sb', 'hbp', 'sac', 'sf'] as const).map(
                              (stat) => (
                                <td key={stat} className="py-1 px-0.5">
                                  <input
                                    type="number"
                                    name={`${stat}_${p.id}`}
                                    min="0"
                                    defaultValue={statDefaults[stat] ?? ''}
                                    placeholder="–"
                                    className="w-10 text-center py-1 text-sm"
                                  />
                                </td>
                              )
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Pitching stats */}
            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-sm font-bold text-[#a78bfa] mb-1">投手成績</h3>
              <p className="text-xs text-[#64748b] mb-4">
                登板した選手のみ「投球回」を入力してください。投球回が空欄の場合は保存されません。<br />
                投球回の形式：<span className="text-[#94a3b8]">5（5回）、5.1（5回1/3）、5.2（5回2/3）または「5回0/3」「5回1/3」</span>
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="border-b border-[#1e3a5f] text-xs text-[#64748b]">
                      <th className="text-left py-2 px-2">選手</th>
                      <th className="text-center py-2 px-1 w-20">投球回 *</th>
                      <th className="text-center py-2 px-1 w-16">投球数</th>
                      <th className="text-center py-2 px-1 w-12">被安打</th>
                      <th className="text-center py-2 px-1 w-12">与四球</th>
                      <th className="text-center py-2 px-1 w-12">奪三振</th>
                      <th className="text-center py-2 px-1 w-12">失点</th>
                      <th className="text-center py-2 px-1 w-12">自責点</th>
                      <th className="text-center py-2 px-1 w-20">勝敗SH</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPlayers.map((p) => {
                      const existingP = existingPitchMap.get(p.id)
                      const isVisible = lineupPlayerIds.has(p.id) || !!existingP
                      return (
                        <tr
                          key={p.id}
                          className={`border-b border-[#0d1b2a] hover:bg-[#0d1b2a]/30 transition-colors ${
                            isVisible ? '' : 'opacity-40'
                          }`}
                        >
                          <td className="py-2 px-2 text-[#94a3b8] whitespace-nowrap text-xs">
                            {p.number != null && (
                              <span className="text-[#a78bfa] mr-1">#{p.number}</span>
                            )}
                            {p.name}
                          </td>
                          <td className="py-1 px-1">
                            <input
                              type="text"
                              name={`p_inn_${p.id}`}
                              placeholder="–"
                              pattern="^\d+(\.[12])?$"
                              defaultValue={existingP?.innings ?? ''}
                              className="w-16 text-center py-1 text-sm"
                            />
                          </td>
                          <td className="py-1 px-1">
                            <input
                              type="number"
                              name={`p_pitches_${p.id}`}
                              min="0"
                              placeholder="–"
                              defaultValue={existingP?.pitches ?? ''}
                              className="w-14 text-center py-1 text-sm"
                            />
                          </td>
                          <td className="py-1 px-0.5">
                            <input type="number" name={`p_h_${p.id}`}  min="0" placeholder="–" defaultValue={existingP?.hitsAllowed  ?? ''} className="w-10 text-center py-1 text-sm" />
                          </td>
                          <td className="py-1 px-0.5">
                            <input type="number" name={`p_bb_${p.id}`} min="0" placeholder="–" defaultValue={existingP?.walks        ?? ''} className="w-10 text-center py-1 text-sm" />
                          </td>
                          <td className="py-1 px-0.5">
                            <input type="number" name={`p_k_${p.id}`}  min="0" placeholder="–" defaultValue={existingP?.strikeouts   ?? ''} className="w-10 text-center py-1 text-sm" />
                          </td>
                          <td className="py-1 px-0.5">
                            <input type="number" name={`p_r_${p.id}`}  min="0" placeholder="–" defaultValue={existingP?.runsAllowed  ?? ''} className="w-10 text-center py-1 text-sm" />
                          </td>
                          <td className="py-1 px-0.5">
                            <input type="number" name={`p_er_${p.id}`} min="0" placeholder="–" defaultValue={existingP?.earnedRuns ?? ''} className="w-10 text-center py-1 text-sm" />
                          </td>
                          <td className="py-1 px-1">
                            <select name={`p_dec_${p.id}`} className="w-16 py-1 text-sm" defaultValue={existingP?.decision ?? ''}>
                              <option value="">–</option>
                              <option value="勝">勝</option>
                              <option value="負">負</option>
                              <option value="S">S</option>
                              <option value="H">H</option>
                            </select>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {lineConfigured && (
              <label className="flex items-center gap-2 text-sm text-[#22c55e] cursor-pointer select-none">
                {/* 編集時は誤送信防止のためデフォルト OFF */}
                <input type="checkbox" name="sendLine" defaultChecked={!existingGame} className="w-4 h-4 accent-[#22c55e]" />
                保存後にLINEに試合結果を送信する
              </label>
            )}

            <button type="submit" className="btn-primary w-full py-3 text-base">
              結果を保存
            </button>
          </form>
        </>
      )}
    </div>
  )
}
