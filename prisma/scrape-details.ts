/**
 * teams.one の全229試合詳細データをスクレーピングして Turso DB に格納するスクリプト
 * 実行: npx tsx prisma/scrape-details.ts
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { parse as parseHTML } from 'node-html-parser'
import 'dotenv/config'

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL ?? 'file:./dev.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
})
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0])

// ---- 229試合の teams.one ゲームID (ページ1〜12 から収集、新しい順) ----
const GAME_IDS = [
  // Page 1 (2026)
  972553, 972547, 965153, 965150, 960574, 960570, 956554, 956550,
  950639, 950637, 947684, 947681, 920431, 920430, 915559, 915556,
  894069, 894060, 892236, 890552,
  // Page 2 (2025–2026)
  890551, 883286, 881376, 881374, 876934, 876926, 860002, 859991,
  847647, 847645, 843402, 843400, 837980, 837976, 823396, 823388,
  819031, 819030, 819026, 819023,
  // Page 3 (2024–2025)
  753811, 753809, 747518, 747514, 744068, 744059, 730728, 730727,
  723534, 723531, 712399, 712375, 704872, 704868, 695186, 695170,
  691942, 691918, 665275, 665272,
  // Page 4 (2023–2024)
  657145, 657143, 650476, 650475, 629794, 629784, 626867, 626862,
  622567, 622563, 609828, 609822, 599111, 599098, 597603, 597600,
  569682, 569675, 566910, 566892,
  // Page 5 (2022–2023)
  566878, 560781, 560775, 554060, 554055, 540010, 539997, 539985,
  537406, 537390, 534511, 534502, 529585, 529583, 510165, 510157,
  508752, 508744, 496248, 496242,
  // Page 6 (2022)
  493333, 493330, 481737, 481733, 476426, 476397, 473677, 473669,
  470076, 470071, 465650, 465641, 463173, 463167, 454549, 454539,
  448899, 448885, 448853, 446256,
  // Page 7 (2021–2022)
  446252, 446248, 446245, 443099, 443098, 440475, 440465, 431699,
  431698, 431697, 431694, 429225, 429209, 429201, 416525, 416524,
  410361, 410359, 408514, 408513,
  // Page 8 (2020–2021)
  402521, 402518, 396565, 396550, 386899, 386895, 384169, 384168,
  379102, 379100, 375943, 375928, 371768, 371757, 369551, 369535,
  361067, 361063, 353374, 353085,
  // Page 9 (2020)
  351361, 351348, 345076, 345072, 335460, 335450, 331758, 331747,
  328018, 328003, 324955, 324944, 320711, 320705, 320703, 320696,
  320692, 314332, 314317, 314297,
  // Page 10 (2019–2020)
  314286, 307744, 307731, 307721, 307705, 307688, 300981, 300966,
  300957, 300941, 292989, 292976, 284041, 284031, 279709, 279696,
  279679, 274487, 274481, 273299,
  // Page 11 (2018–2019)
  273292, 269373, 269370, 269368, 261634, 261621, 249515, 249511,
  247077, 247073, 243957, 243947, 242283, 242273, 237112, 237098,
  223296, 223260, 220175, 220164,
  // Page 12 (2017–2018)
  214866, 214854, 211641, 211637, 10466, 10453, 10390, 7963, 7865,
]

// 打者成績テーブルの列インデックス
const COL = {
  number: 0, name: 1, appearance: 2, battingOrder: 3, position: 4,
  plateAppearances: 5, atBats: 6, hits: 7, homeRuns: 8, rbi: 9,
  runs: 10, stolenBases: 11, doubles: 12, triples: 13,
  // 14: 得点圏打数, 15: 得点圏安打
  strikeouts: 16, walks: 17, hitByPitch: 18,
  sacrificeBunts: 19, sacrificeFlies: 20,
}

// 投手成績テーブルの列インデックス
const PCOL = {
  number: 0, name: 1, decision: 2, innings: 3, pitches: 4,
  runsAllowed: 5, earnedRuns: 6, hitsAllowed: 7, strikeouts: 8, walks: 9,
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function toInt(s: string | undefined | null): number {
  if (!s) return 0
  const n = parseInt(s.trim(), 10)
  return isNaN(n) ? 0 : n
}

/** HTML テーブルから各行のテキストセルを取得 */
function tableRows(html: string, headerKeyword: string): string[][] {
  const root = parseHTML(html)
  const tables = root.querySelectorAll('table')
  for (const table of tables) {
    const headers = table.querySelectorAll('th')
    const headerTexts = headers.map(h => h.text.trim())
    if (headerTexts.some(t => t.includes(headerKeyword))) {
      const rows: string[][] = []
      for (const tr of table.querySelectorAll('tr')) {
        const cells = tr.querySelectorAll('td')
        if (cells.length > 2) {
          rows.push(cells.map(c => c.text.trim()))
        }
      }
      return rows
    }
  }
  return []
}

/** タイトルから日付と対戦相手を抽出 */
function parseTitleInfo(html: string): { date: string; opponent: string } | null {
  // title: "2026/5/17 BLITZVS佐土｜teams" or "2026/5/17 BLITZ VS 佐土｜teams"
  const m = html.match(/<title>\s*(\d{4})\/(\d+)\/(\d+)\s*BLITZ\s*VS\s*(.+?)(?:｜|[|])/i)
  if (!m) return null
  const [, y, mon, d, opp] = m
  const date = `${y}-${mon.padStart(2, '0')}-${d.padStart(2, '0')}`
  return { date, opponent: opp.trim() }
}

/** イニングスコアを抽出（ページ内の最初のテーブル = スコアボード） */
function parseInningScores(html: string): { blitz: (number|null)[]; opponent: (number|null)[] } | null {
  const root = parseHTML(html)
  const tables = root.querySelectorAll('table')
  // 最初のテーブルがスコアテーブル
  const table = tables[0]
  if (!table) return null

  const rows = table.querySelectorAll('tr')
  const dataRows = Array.from(rows).filter(r => r.querySelectorAll('td').length > 2)
  if (dataRows.length < 2) return null

  const parseRow = (tr: typeof dataRows[number]): { name: string; scores: (number | null)[] } => {
    const cells = tr.querySelectorAll('td')
    const name = cells[0]?.text.trim() ?? ''
    // 2列目以降 (最後の合計列を除外)
    const scoreCells = Array.from(cells).slice(1, -1)
    const scores = scoreCells.map(c => {
      const t = c.text.trim()
      return (t === '-' || t === '' || t === 'x') ? null : toInt(t)
    })
    return { name, scores }
  }

  const row0 = parseRow(dataRows[0])
  const row1 = parseRow(dataRows[1])

  const isBlitz0 = row0.name.toUpperCase().includes('BLITZ')
  const blitz: (number | null)[]    = (isBlitz0 ? row0 : row1).scores
  const opponent: (number | null)[] = (isBlitz0 ? row1 : row0).scores
  return { blitz, opponent }
}

/** 投手成績テーブルを抽出: 各投手の成績オブジェクト配列 */
function parsePitchingStats(html: string) {
  const rows = tableRows(html, '投球回')
  if (rows.length === 0) return []

  return rows.map(cells => ({
    number:      cells[PCOL.number]      ?? '',
    name:        cells[PCOL.name]        ?? '',
    decision:    cells[PCOL.decision]?.trim() || null,
    innings:     cells[PCOL.innings]     ?? '0',
    pitches:     toInt(cells[PCOL.pitches]),
    runsAllowed: toInt(cells[PCOL.runsAllowed]),
    earnedRuns:  toInt(cells[PCOL.earnedRuns]),
    hitsAllowed: toInt(cells[PCOL.hitsAllowed]),
    strikeouts:  toInt(cells[PCOL.strikeouts]),
    walks:       toInt(cells[PCOL.walks]),
  }))
}

/** 打者成績テーブルを抽出: 各選手の成績オブジェクト配列 */
function parseBattingStats(html: string) {
  const rows = tableRows(html, '打席')
  if (rows.length === 0) return []

  return rows.map(cells => ({
    number:          cells[COL.number]       ?? '',
    name:            cells[COL.name]         ?? '',
    battingOrder:    toInt(cells[COL.battingOrder]),
    position:        cells[COL.position]     ?? '',
    plateAppearances:toInt(cells[COL.plateAppearances]),
    atBats:          toInt(cells[COL.atBats]),
    hits:            toInt(cells[COL.hits]),
    homeRuns:        toInt(cells[COL.homeRuns]),
    rbi:             toInt(cells[COL.rbi]),
    runs:            toInt(cells[COL.runs]),
    stolenBases:     toInt(cells[COL.stolenBases]),
    doubles:         toInt(cells[COL.doubles]),
    triples:         toInt(cells[COL.triples]),
    strikeouts:      toInt(cells[COL.strikeouts]),
    walks:           toInt(cells[COL.walks]),
    hitByPitch:      toInt(cells[COL.hitByPitch]),
    sacrificeBunts:  toInt(cells[COL.sacrificeBunts]),
    sacrificeFlies:  toInt(cells[COL.sacrificeFlies]),
  }))
}

async function main() {
  console.log('=== teams.one 詳細スクレーパー ===')

  // DB から全 Game + Schedule を取得（日付 ASC）
  const allGames = await prisma.game.findMany({
    include: { schedule: true },
    orderBy: { schedule: { date: 'asc' } },
  })
  console.log(`DB内の試合数: ${allGames.length}`)

  // 全ユーザー取得（名前→ID マップ）
  const users = await prisma.user.findMany()
  const nameToUserId: Record<string, string> = {}
  for (const u of users) {
    nameToUserId[u.name] = u.id
    // 部分一致用のバリエーションも登録
    if (u.name.includes('.')) {
      nameToUserId[u.name.replace('.', '')] = u.id
    }
  }

  // 日付+対戦相手 → Game のマップ（マッチング用）
  const gameLookup = new Map<string, typeof allGames[number]>()
  for (const g of allGames) {
    const key = `${g.schedule.date.toISOString().slice(0, 10)}_${g.schedule.opponent}`
    gameLookup.set(key, g)
  }

  // teams.one ゲームIDを処理（新しい順）
  let success = 0, skipped = 0, failed = 0

  for (let i = 0; i < GAME_IDS.length; i++) {
    const teamsOneId = GAME_IDS[i]

    // 既にスクレーピング済み かつ 投手成績も存在 → スキップ
    const existing = await prisma.game.findFirst({
      where: { teamsOneId: String(teamsOneId) },
      include: { schedule: true },
    })
    if (existing) {
      const existingPitching = await prisma.pitchingStat.findFirst({ where: { gameId: existing.id } })
      if (existingPitching) {
        process.stdout.write(`[スキップ] ${teamsOneId}\r`)
        skipped++
        continue
      }
      // teamsOneId は設定済みだが投手成績がない → 投手成績のみ追加
    }

    try {
      const url = `https://teams.one/teams/blitz/game/${teamsOneId}`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BLITZ-scraper/1.0)' }
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const html = await res.text()

      // タイトルから日付・相手を抽出
      const titleInfo = parseTitleInfo(html)
      const gameDate = titleInfo?.date ?? ''
      const opponentName = titleInfo?.opponent ?? ''

      // イニングスコア
      const inningData = parseInningScores(html)

      // 打者成績・投手成績
      const batting = parseBattingStats(html)
      const pitching = parsePitchingStats(html)

      // DB の試合を検索（existing がある場合はそのまま使う）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let dbGame: typeof allGames[number] | undefined = (existing as any) ?? gameLookup.get(`${gameDate}_${opponentName}`)

      // マッチしない場合、日付のみで候補を絞ってteamsOneIdが未設定のものを取得
      if (!dbGame && gameDate) {
        const candidates = allGames.filter(g => {
          const gDate = g.schedule.date.toISOString().slice(0, 10)
          return gDate === gameDate && !g.teamsOneId
        })
        if (candidates.length === 1) {
          dbGame = candidates[0]
        }
      }

      if (!dbGame) {
        console.log(`\n[未マッチ] ID=${teamsOneId} date=${gameDate} opponent=${opponentName}`)
        skipped++
        await sleep(300)
        continue
      }

      // Game を更新（teamsOneId + inningScores）
      const inningJson = inningData ? JSON.stringify(inningData) : null
      await prisma.game.update({
        where: { id: dbGame.id },
        data: {
          teamsOneId: String(teamsOneId),
          inningScores: inningJson,
        },
      })

      // GameStat を挿入
      let statCount = 0
      for (const stat of batting) {
        const userId = nameToUserId[stat.name]
        if (!userId) continue // 未登録選手はスキップ

        try {
          await prisma.gameStat.upsert({
            where: { userId_gameId: { userId, gameId: dbGame.id } },
            create: {
              userId,
              gameId: dbGame.id,
              battingOrder:    stat.battingOrder || null,
              position:        stat.position || null,
              plateAppearances:stat.plateAppearances,
              atBats:          stat.atBats,
              hits:             stat.hits,
              doubles:          stat.doubles,
              triples:          stat.triples,
              homeRuns:         stat.homeRuns,
              rbi:              stat.rbi,
              runs:             stat.runs,
              stolenBases:      stat.stolenBases,
              strikeouts:       stat.strikeouts,
              walks:            stat.walks,
              hitByPitch:       stat.hitByPitch,
              sacrificeBunts:   stat.sacrificeBunts,
              sacrificeFlies:   stat.sacrificeFlies,
            },
            update: {
              battingOrder:    stat.battingOrder || null,
              position:        stat.position || null,
              plateAppearances:stat.plateAppearances,
              atBats:          stat.atBats,
              hits:             stat.hits,
              doubles:          stat.doubles,
              triples:          stat.triples,
              homeRuns:         stat.homeRuns,
              rbi:              stat.rbi,
              runs:             stat.runs,
              stolenBases:      stat.stolenBases,
              strikeouts:       stat.strikeouts,
              walks:            stat.walks,
              hitByPitch:       stat.hitByPitch,
              sacrificeBunts:   stat.sacrificeBunts,
              sacrificeFlies:   stat.sacrificeFlies,
            },
          })
          statCount++
        } catch (_) {
          // 重複などは無視
        }
      }

      // PitchingStat を挿入
      let pitchCount = 0
      for (const p of pitching) {
        const userId = nameToUserId[p.name]
        if (!userId) continue

        try {
          await prisma.pitchingStat.upsert({
            where: { userId_gameId: { userId, gameId: dbGame.id } },
            create: {
              userId,
              gameId:      dbGame.id,
              decision:    p.decision,
              innings:     p.innings,
              pitches:     p.pitches,
              runsAllowed: p.runsAllowed,
              earnedRuns:  p.earnedRuns,
              hitsAllowed: p.hitsAllowed,
              strikeouts:  p.strikeouts,
              walks:       p.walks,
            },
            update: {
              decision:    p.decision,
              innings:     p.innings,
              pitches:     p.pitches,
              runsAllowed: p.runsAllowed,
              earnedRuns:  p.earnedRuns,
              hitsAllowed: p.hitsAllowed,
              strikeouts:  p.strikeouts,
              walks:       p.walks,
            },
          })
          pitchCount++
        } catch (_) {
          // 重複などは無視
        }
      }

      console.log(`[OK] ${teamsOneId} | ${gameDate} vs ${opponentName} | stats:${statCount} pitch:${pitchCount}`)
      success++
    } catch (err) {
      console.log(`\n[ERROR] ${teamsOneId}: ${err}`)
      failed++
    }

    // レート制限対策: 500ms 待機
    await sleep(500)
  }

  console.log(`\n=== 完了 ===`)
  console.log(`成功: ${success}, スキップ: ${skipped}, 失敗: ${failed}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
