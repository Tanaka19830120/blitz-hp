import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { sendToLineGroup, buildGameResult } from '@/lib/line'
import { ScoreBookEditor } from '@/components/ScoreBookEditor'
import { ScorePhotoUploader } from '@/components/ScorePhotoUploader'
import { calcBatterStats, type ScoreBookData } from '@/lib/scorebook'

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

  // LINE 通知
  if (sendLine) {
    const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } })
    if (schedule) {
      const msg = buildGameResult(schedule, { ourScore, opponentScore, result, note: note || null })
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

function buildEmptyScoreBook(lineup: LineupEntry[]): ScoreBookData {
  const batters = lineup
    .filter(l => l.battingOrder != null)
    .sort((a, b) => (a.battingOrder ?? 99) - (b.battingOrder ?? 99))
    .map(l => ({ order: l.battingOrder!, userId: l.userId, cells: {} as Record<number, string> }))

  while (batters.length < 9) {
    batters.push({ order: batters.length + 1, userId: '', cells: {} })
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

  // スタメン選手を先頭に、残りは全員（飛び入り参加対応）
  const lineupPlayerIds = new Set(lineup.map(l => l.userId))
  const lineupPlayers   = lineup.map(l => l.user)
  const otherPlayers    = allPlayers.filter(p => !lineupPlayerIds.has(p.id))
  const sortedPlayers   = [...lineupPlayers, ...otherPlayers]

  // スコアブック初期データ（保存済みデータ優先 → スタメンから生成）
  let initialScoreBook: ScoreBookData
  if (existingGame?.scorebook) {
    try {
      const parsed = JSON.parse(existingGame.scorebook) as ScoreBookData
      initialScoreBook = {
        ...parsed,
        // JSON にスコアが保存されていない古いデータは DB の値を補完
        ourScore:      parsed.ourScore      ?? existingGame.ourScore      ?? null,
        opponentScore: parsed.opponentScore ?? existingGame.opponentScore ?? null,
        note:          parsed.note          ?? existingGame.note          ?? '',
      }
    } catch {
      initialScoreBook = buildEmptyScoreBook(lineup)
    }
  } else {
    initialScoreBook = {
      ...buildEmptyScoreBook(lineup),
      ourScore:      existingGame?.ourScore      ?? null,
      opponentScore: existingGame?.opponentScore ?? null,
      note:          existingGame?.note          ?? '',
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
                lineConfigured={lineConfigured}
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
