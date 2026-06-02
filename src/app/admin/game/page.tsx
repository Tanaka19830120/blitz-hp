import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { sendToLineGroup, buildGameResult } from '@/lib/line'
import { ScoreBookEditor } from '@/components/ScoreBookEditor'
import { ScorePhotoUploader } from '@/components/ScorePhotoUploader'
import { calcBatterStats, type ScoreBookData, type BatterSub } from '@/lib/scorebook'

// ─── 統合サーバーアクション ────────────────────────────────────────────────
// スコア + スコアブック + 個人成績を一括保存
// （個人成績は ScoreBookData から自動計算 → 手動入力不要）
async function saveGame(scheduleId: string, json: string, sendLine: boolean): Promise<void> {
  'use server'
  const data: ScoreBookData = JSON.parse(json)

  const ourScore      = data.ourScore      ?? 0
  const opponentScore = data.opponentScore ?? 0
  const note          = data.note          ?? ''

  let result: 'WIN' | 'LOSE' | 'DRAW'
  if      (ourScore > opponentScore) result = 'WIN'
  else if (ourScore < opponentScore) result = 'LOSE'
  else                               result = 'DRAW'

  // Game を upsert（スコアブック JSON も保存）
  const game = await prisma.game.upsert({
    where:  { scheduleId },
    create: { scheduleId, ourScore, opponentScore, result, note, scorebook: json },
    update: { ourScore, opponentScore, result, note, scorebook: json },
  })

  // 既存の個人成績・投手成績を全削除して再挿入（削除されたメンバーを残さないため）
  await prisma.gameStat.deleteMany({ where: { gameId: game.id } })
  await prisma.pitchingStat.deleteMany({ where: { gameId: game.id } })

  // ── 個人成績: スコアブックから自動計算 ──
  for (const batter of data.batters) {
    if (!batter.userId) continue
    const stats = calcBatterStats(batter.cells)
    if (stats.pa === 0) continue

    await prisma.gameStat.create({
      data: {
        userId:           batter.userId,
        gameId:           game.id,
        plateAppearances: stats.pa,
        atBats:           stats.ab,
        hits:             stats.h,
        doubles:          stats.doubles,
        triples:          stats.triples,
        homeRuns:         stats.homeRuns,
        rbi:              stats.rbi,
        stolenBases:      stats.sb,
        walks:            stats.bb,
        strikeouts:       stats.k,
        hitByPitch:       stats.hbp,
        sacrificeBunts:   stats.sac,
        sacrificeFlies:   stats.sf,
        battingOrder:     batter.order,
        runs:             0,
      },
    })
  }

  // ── 投手成績 ──
  for (const p of data.pitchers) {
    if (!p.userId || !p.innings) continue
    await prisma.pitchingStat.create({
      data: {
        userId:      p.userId,
        gameId:      game.id,
        innings:     p.innings,
        runsAllowed: p.runs,
        earnedRuns:  p.earnedRuns  ?? p.runs,
        hitsAllowed: p.hitsAllowed ?? 0,
        strikeouts:  p.strikeouts  ?? 0,
        walks:       p.walks       ?? 0,
        pitches:     p.pitches     ?? 0,
        decision:    p.decision    || null,
      },
    })
  }

  // LINE 通知（打者・投手成績を含む詳細版）
  if (sendLine) {
    const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } })
    if (schedule) {
      const userIds = [
        ...data.batters.map(b => b.userId).filter(Boolean),
        ...data.pitchers.map(p => p.userId).filter(Boolean),
      ]
      const playerList = userIds.length > 0
        ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
        : []
      const playerNames = new Map(playerList.map(p => [p.id, p.name ?? '']))
      const msg = buildGameResult(
        schedule,
        { ourScore, opponentScore, result, note: note || null },
        { scorebook: data, playerNames }
      )
      await sendToLineGroup(msg)
    }
  }

  revalidatePath('/results')
  revalidatePath('/stats')
  revalidatePath('/')
  revalidatePath('/admin/game')
  revalidatePath('/admin')
}

// ─── 写真保存サーバーアクション ───────────────────────────────────────────────
async function saveScorePhoto(scheduleId: string, photoUrl: string): Promise<void> {
  'use server'
  const game = await prisma.game.findUnique({ where: { scheduleId } })
  if (!game) return
  await prisma.game.update({ where: { id: game.id }, data: { scorePhoto: photoUrl } })
  revalidatePath(`/results/${scheduleId}`)
  revalidatePath('/admin/game')
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type LineupEntry = { battingOrder: number | null; userId: string }

function buildEmptyScoreBook(
  lineup: LineupEntry[],
  positionByOrder: Map<number, string> = new Map()
): ScoreBookData {
  const batters = lineup
    .filter(l => l.battingOrder != null)
    .sort((a, b) => (a.battingOrder ?? 99) - (b.battingOrder ?? 99))
    .map(l => ({
      order:    l.battingOrder!,
      userId:   l.userId,
      position: positionByOrder.get(l.battingOrder!) ?? '',
      cells:    {} as Record<number, string>,
    }))

  while (batters.length < 9) {
    batters.push({ order: batters.length + 1, userId: '', position: '', cells: {} })
  }
  return { innings: 7, batters, pitchers: [] }
}

// ─────────────────────────────────────────────────────────────────────────────

export default async function AdminGamePage({
  searchParams,
}: {
  searchParams: Promise<{ scheduleId?: string }>
}) {
  const sp = await searchParams

  const lineConfigured = !!(process.env.LINE_CHANNEL_ACCESS_TOKEN &&
    (process.env.LINE_GROUP_ID ||
      await prisma.setting.findUnique({ where: { key: 'detectedLineGroupId' } }).then(s => s?.value ?? '').catch(() => '')))

  const [schedules, allPlayers] = await Promise.all([
    prisma.schedule.findMany({
      orderBy: { date: 'desc' },
      take: 30,
      include: { game: { select: { id: true } } },
    }),
    prisma.user.findMany({ orderBy: [{ number: 'asc' }, { name: 'asc' }] }),
  ])

  const selectedId = sp.scheduleId ?? schedules[0]?.id
  const selected   = selectedId
    ? (schedules.find(s => s.id === selectedId) ??
       await prisma.schedule.findUnique({ where: { id: selectedId } }))
    : null

  const existingGame = selectedId
    ? await prisma.game.findUnique({ where: { scheduleId: selectedId } })
    : null

  // スタメン情報（打順・守備の初期値に使用）
  const lineup = selectedId
    ? await prisma.lineup.findMany({
        where:   { scheduleId: selectedId },
        include: { user: true },
        orderBy: { battingOrder: 'asc' },
      })
    : []

  // lineupData_${scheduleId} から打順・守備位置・選手IDをすべて取得（優先ソース）
  const positionByOrder  = new Map<number, string>()  // 前半守備
  const position2ByOrder = new Map<number, string>()  // 後半守備（同一選手ポジション変更）
  const lineupFromData:  LineupEntry[] = []
  // 後半交代情報（前半と異なる選手が second に設定されている場合）
  const lineupSubs: Array<{ order: number; userId: string; position: string }> = []

  if (selectedId) {
    const ldSetting = await prisma.setting.findUnique({ where: { key: `lineupData_${selectedId}` } })
    if (ldSetting?.value) {
      try {
        const ld = JSON.parse(ldSetting.value) as {
          slots?: Array<{
            first?:  { playerId?: string; position?: string }
            second?: { playerId?: string; position?: string }
          }>
        }
        ld.slots?.forEach((slot, idx) => {
          const pos  = slot.first?.position
          const pid  = slot.first?.playerId
          const pid2 = slot.second?.playerId
          const pos2 = slot.second?.position ?? ''

          if (pos) positionByOrder.set(idx + 1, pos)

          // 実選手のみ userId を設定（ゲスト・空は ''）
          lineupFromData.push({
            battingOrder: idx + 1,
            userId: (pid && !pid.startsWith('__guest_')) ? pid : '',
          })

          if (pid2 && !pid2.startsWith('__guest_')) {
            if (pid2 !== pid) {
              // 選手交代 → サブ行として追加
              lineupSubs.push({ order: idx + 1, userId: pid2, position: pos2 })
            } else if (pos2 && pos2 !== pos) {
              // 同一選手・守備位置変更 → 前半/後半を別々に記録
              position2ByOrder.set(idx + 1, pos2)
            }
          }
        })
      } catch { /* ignore */ }
    }
  }

  // スコアブック用の打順: lineupData 優先、なければ Prisma Lineup テーブル
  const lineupForBook: LineupEntry[] = lineupFromData.length > 0 ? lineupFromData : lineup

  // スタメン選手を先頭に、残りは全員（飛び入り参加対応）
  // lineupData から取得した選手IDを優先してドロップダウンの並び順に反映
  const dataPlayerIds   = new Set(lineupFromData.map(l => l.userId).filter(Boolean))
  const lineupPlayerIds = dataPlayerIds.size > 0
    ? dataPlayerIds
    : new Set(lineup.map(l => l.userId))
  const lineupPlayers   = allPlayers.filter(p => lineupPlayerIds.has(p.id))
  const otherPlayers    = allPlayers.filter(p => !lineupPlayerIds.has(p.id))
  const sortedPlayers   = [...lineupPlayers, ...otherPlayers]

  // lineupForBook を打順→{userId,position,position2} マップに変換（マージ用）
  const lineupByOrder = new Map(
    lineupForBook
      .filter(l => l.battingOrder != null)
      .map(l => [l.battingOrder!, {
        userId:    l.userId,
        position:  positionByOrder.get(l.battingOrder!)  ?? '',
        position2: position2ByOrder.get(l.battingOrder!),
      }])
  )

  // スコアブック初期データ（保存済みデータ優先 → スタメンから生成）
  let initialScoreBook: ScoreBookData
  if (existingGame?.scorebook) {
    try {
      const parsed = JSON.parse(existingGame.scorebook) as ScoreBookData
      initialScoreBook = {
        ...parsed,
        batters: parsed.batters.map(b => {
          const fromLineup = lineupByOrder.get(b.order)
          return {
            ...b,
            // スタメンに選手がいれば常に反映（スタメン変更を即時反映）
            // スタメン未入力スロット（userId=''）は保存済み userId を維持
            userId:    fromLineup?.userId    || b.userId,
            position:  fromLineup?.position  || b.position  || '',
            position2: fromLineup?.position2 ?? b.position2,
          }
        }),
        // JSON にスコアが保存されていない古いデータは DB の値を補完
        ourScore:      parsed.ourScore      ?? existingGame.ourScore      ?? null,
        opponentScore: parsed.opponentScore ?? existingGame.opponentScore ?? null,
        note:          parsed.note          ?? existingGame.note          ?? '',
      }
    } catch {
      initialScoreBook = buildEmptyScoreBook(lineupForBook, positionByOrder)
    }
  } else {
    initialScoreBook = {
      ...buildEmptyScoreBook(lineupForBook, positionByOrder),
      ourScore:      existingGame?.ourScore      ?? null,
      opponentScore: existingGame?.opponentScore ?? null,
      note:          existingGame?.note          ?? '',
    }
  }

  // ── 同一選手のポジション変更を position2 に反映 ──
  if (position2ByOrder.size > 0) {
    initialScoreBook = {
      ...initialScoreBook,
      batters: initialScoreBook.batters.map(b => {
        const p2 = position2ByOrder.get(b.order)
        return p2 ? { ...b, position2: p2 } : b
      }),
    }
  }

  // ── スタメンの後半交代をサブ行として自動追加・更新 ──
  if (lineupSubs.length > 0) {
    const totalInnings = initialScoreBook.innings ?? 7
    const defInning    = Math.max(1, Math.ceil(totalInnings / 2))
    const oldDefault   = defInning + 1  // 以前のバグ値（+1 余分だった）
    initialScoreBook = {
      ...initialScoreBook,
      batters: initialScoreBook.batters.map(b => {
        const sub = lineupSubs.find(s => s.order === b.order)
        if (!sub) return b
        const existing = b.subs ?? []
        const existingIdx = existing.findIndex(s => s.userId === sub.userId)
        if (existingIdx >= 0) {
          // 古いバグ値のままなら自動修正（ユーザーが手動変更した値は保持）
          const s = existing[existingIdx]
          if (s.fromInning === oldDefault) {
            return { ...b, subs: existing.map((si, i) => i === existingIdx ? { ...si, fromInning: defInning } : si) }
          }
          return b
        }
        return { ...b, subs: [...existing, { fromInning: defInning, userId: sub.userId, position: sub.position, cells: {} }] }
      }),
    }
  }

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
          {/* 試合選択 */}
          <div className="glass-card rounded-2xl p-4 mb-6">
            <label className="block text-xs font-medium text-[#94a3b8] mb-2">試合を選択</label>
            <div className="flex flex-wrap gap-2">
              {schedules.map(s => (
                <Link key={s.id} href={`/admin/game?scheduleId=${s.id}`}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                    s.id === selectedId
                      ? 'bg-[#2563eb] border-[#2563eb] text-white'
                      : 'border-[#1e3a5f] text-[#64748b] hover:border-[#2563eb]/50'
                  }`}>
                  {new Date(s.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })}
                  {' '}vs {s.opponent}
                  {s.game && <span className="ml-1 text-[#22c55e]">✓</span>}
                </Link>
              ))}
            </div>
          </div>

          {selected && (
            <div className="glass-card rounded-2xl p-6">
              {/* 試合情報ヘッダー */}
              <div className="mb-4">
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <div>
                    <p className="text-sm font-bold text-[#e2e8f0]">
                      {new Date(selected.date).toLocaleDateString('ja-JP', {
                        year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
                      })}
                      <span className="text-[#fbbf24] ml-2">vs {selected.opponent}</span>
                    </p>
                    <p className="text-xs text-[#64748b]">
                      📍 {selected.location}
                      {selected.meetTime  && ` 　🕐 集合 ${selected.meetTime}`}
                      {selected.startTime && ` 　▶ 開始 ${selected.startTime}`}
                    </p>
                  </div>
                  {existingGame && (
                    <span className="text-xs text-[#f59e0b] border border-[#f59e0b]/40 rounded px-2 py-0.5">
                      編集中
                    </span>
                  )}
                  {lineup.length > 0 && (
                    <span className="text-xs text-[#60a5fa] border border-[#60a5fa]/30 rounded px-2 py-0.5">
                      📋 スタメン読込済
                    </span>
                  )}
                  <span className="text-xs text-[#94a3b8] border border-[#1e3a5f] rounded px-2 py-0.5">
                    ✚ 飛び入り参加は「打者追加」→選手選択
                  </span>
                </div>
                {/* スコア記入シート印刷リンク — 独立した行に配置 */}
                <Link
                  href={`/admin/scorebook-sheet?scheduleId=${selected.id}&innings=${existingGame?.scorebook ? JSON.parse(existingGame.scorebook).innings ?? 7 : 7}`}
                  target="_blank"
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-[#a78bfa]/50 text-[#a78bfa] hover:bg-[#7c3aed]/15 hover:border-[#a78bfa]/80 transition-all"
                >
                  📄 記入シートを印刷（現場用）
                </Link>
              </div>

              {/* ← ScoreBookEditor が全て統合 */}
              <ScoreBookEditor
                players={sortedPlayers.map(p => ({
                  id:     p.id,
                  name:   p.name,
                  number: p.number ?? null,
                }))}
                scheduleId={selected.id}
                initialData={initialScoreBook}
                saveAction={saveGame}
                savePhotoAction={saveScorePhoto}
                lineConfigured={lineConfigured}
                scheduleInfo={{
                  date:     selected.date.toISOString(),
                  opponent: selected.opponent,
                }}
              />

              {/* スコア表写真（保存済みゲームがある場合のみ表示） */}
              {existingGame && (
                <div className="mt-6 border-t border-[#1e3a5f] pt-6">
                  <ScorePhotoUploader
                    scheduleId={selected.id}
                    currentPhotoUrl={existingGame.scorePhoto ?? null}
                    savePhotoAction={saveScorePhoto}
                  />
                </div>
              )}
              {!existingGame && (
                <p className="mt-4 text-xs text-[#475569] text-center">
                  💡 スコアを保存すると写真アップロードが可能になります
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
