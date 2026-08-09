/**
 * teams.one の全229試合詳細データをスクレーピングして Turso DB に格納するスクリプト
 * 実行: npx tsx prisma/scrape-details.ts
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { parse as parseHTML } from 'node-html-parser'
import 'dotenv/config'

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_DIRECT_URL ?? 'file:./dev.db',
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

// teams.one の別表記 → 既存メンバー（同一人物）の対応表
// teams.one 上の名前（正規化前）→ 既存メンバーの「名前 or 背番号」で特定
const MEMBER_ALIASES: { aliases: string[]; matchName?: string; matchNumber?: number }[] = [
  { aliases: ['りゅうせい', 'リュウセイ'], matchName: 'RYUSEI' },
  // teams.one が長い名前を "K .KA…" のように末尾を省略する場合の対応
  { aliases: ['K .KA…', 'K.KA…', 'K .KAZU'], matchName: 'K.KAZU' },
  // teams.one が "なかしょう…" と省略する場合
  { aliases: ['なかしょう…'], matchName: 'なかしょう' },
  // teams.one 上の旧表記
  { aliases: ['ちぃ'], matchName: 'ちぃ弟' },
]

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function toInt(s: string | undefined | null): number {
  if (!s) return 0
  const n = parseInt(s.trim(), 10)
  return isNaN(n) ? 0 : n
}

/** 会場名の表記ゆれをマスタ表記に正規化 */
const LOCATION_ALIASES: Record<string, string> = {
  '別所北公園グラウンド': '別所北公園',
  '別所北グラウンド': '別所北公園',
  '姫路別所北グラウンド': '別所北公園',
}
function normalizeLocation(loc: string | null): string | null {
  if (!loc) return loc
  return LOCATION_ALIASES[loc.trim()] ?? loc
}

/** 名前を正規化（全角スペース・前後空白を除去、小文字化） */
function normName(n: string): string {
  return n.trim().replace(/\s+/g, '').replace(/　/g, '').toLowerCase()
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
  const m = html.match(/<title>\s*(\d{4})\/(\d+)\/(\d+)\s*BLITZ\s*VS\s*(.+?)(?:｜|[|])/i)
  if (!m) return null
  const [, y, mon, d, opp] = m
  const date = `${y}-${mon.padStart(2, '0')}-${d.padStart(2, '0')}`
  return { date, opponent: opp.trim() }
}

/** イニングスコアを抽出
 *  - 優先: myteam クラスで BLITZ 行を特定（teams.one の信頼できる識別子）
 *  - フォールバック: チーム名テキストで判定
 */
function parseInningScores(html: string, expectedBlitz?: number | null): { blitz: (number|null)[]; opponent: (number|null)[]; blitzFirst: boolean } | null {
  const root = parseHTML(html)
  const tables = root.querySelectorAll('table')
  const table = tables[0]
  if (!table) return null

  const allRows = table.querySelectorAll('tr')
  const dataRows = Array.from(allRows).filter(r => r.querySelectorAll('td').length > 2)
  if (dataRows.length < 2) return null

  const parseScores = (tr: typeof dataRows[number]): (number | null)[] => {
    const cells = tr.querySelectorAll('td')
    // 1列目=チーム名、最後の列=合計 → 除外
    return Array.from(cells).slice(1, -1).map(c => {
      const t = c.text.trim()
      return (t === '-' || t === '' || t === 'x') ? null : toInt(t)
    })
  }
  const sum = (arr: (number|null)[]) => arr.reduce((s: number, n) => s + (n ?? 0), 0)

  const a = parseScores(dataRows[0])  // teams.one 上段 = 先攻
  const b = parseScores(dataRows[1])  // 下段 = 後攻
  // blitzFirst: BLITZ が上段(先攻)なら true
  const asFirst  = { blitz: a, opponent: b, blitzFirst: true }
  const asSecond = { blitz: b, opponent: a, blitzFirst: false }

  // ① 得点(BLITZ合計)と一致する行を BLITZ とする（最も確実）
  if (expectedBlitz != null) {
    const sa = sum(a), sb = sum(b)
    if (sa === expectedBlitz && sb !== expectedBlitz) return asFirst
    if (sb === expectedBlitz && sa !== expectedBlitz) return asSecond
  }

  // ② myteam クラスで BLITZ を特定
  const idxBlitzClass = dataRows.findIndex(r =>
    r.classNames?.includes('myteam') || r.getAttribute('class')?.includes('myteam')
  )
  if (idxBlitzClass === 0) return asFirst
  if (idxBlitzClass === 1) return asSecond

  // ③ チーム名テキストで判定
  const name0 = dataRows[0].querySelectorAll('td')[0]?.text.trim() ?? ''
  const name1 = dataRows[1].querySelectorAll('td')[0]?.text.trim() ?? ''
  if (name0.toUpperCase().includes('BLITZ')) return asFirst
  if (name1.toUpperCase().includes('BLITZ')) return asSecond

  // ④ 判定不能: 先攻=相手、後攻=BLITZ と仮定
  return asSecond
}

/** イニング表の2行の「合計(R)」を取得（ダブルヘッダー判別用、BLITZ未確定でOK） */
function parseTotals(html: string): [number, number] | null {
  const root = parseHTML(html)
  const table = root.querySelectorAll('table')[0]
  if (!table) return null
  const dataRows = Array.from(table.querySelectorAll('tr')).filter(r => r.querySelectorAll('td').length > 2)
  if (dataRows.length < 2) return null
  const total = (tr: typeof dataRows[number]) => {
    const cells = tr.querySelectorAll('td')
    return toInt(cells[cells.length - 1]?.text.trim())
  }
  return [total(dataRows[0]), total(dataRows[1])]
}

/** 投手成績テーブルを抽出 */
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

/** 打者成績テーブルを抽出 */
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

  const allGames = await prisma.game.findMany({
    include: { schedule: true },
    orderBy: { schedule: { date: 'asc' } },
  })
  console.log(`DB内の試合数: ${allGames.length}`)

  // 全ユーザー取得 → 複数の検索キーでマップを構築
  const users = await prisma.user.findMany()

  // 名前 → userId（正規化済みキーで登録）
  const nameToUserId: Record<string, string> = {}
  // 背番号 → userId
  const numberToUserId: Record<number, string> = {}

  for (const u of users) {
    // 正規化名（空白除去・小文字）
    nameToUserId[normName(u.name)]  = u.id
    // 元の名前もそのまま登録
    nameToUserId[u.name.trim()]     = u.id
    // ピリオドなし
    if (u.name.includes('.')) {
      nameToUserId[u.name.replace(/\./g, '').trim()] = u.id
    }
    // 背番号
    if (u.number != null) {
      numberToUserId[u.number] = u.id
    }
  }

  /** teams.one の打者行から DB の userId を解決する
   *  1. 背番号（整数）→ 最も確実
   *  2. 正規化名 → 空白・大小文字の違いを吸収
   *  3. 元の名前（そのまま）
   */
  // 別表記エイリアスを既存メンバーに対応付け
  for (const al of MEMBER_ALIASES) {
    const target = users.find(u =>
      (al.matchNumber != null && u.number === al.matchNumber) ||
      (al.matchName != null && normName(u.name) === normName(al.matchName))
    )
    if (target) {
      for (const a of al.aliases) nameToUserId[normName(a)] = target.id
    }
  }

  function resolveUserId(name: string, _jerseyNumber: string): string | undefined {
    // 名前のみで一致（背番号フォールバックは廃止: 同番号の別選手に誤マッチするため）
    const byNorm = nameToUserId[normName(name)]
    if (byNorm) return byNorm
    const byExact = nameToUserId[name.trim()]
    if (byExact) return byExact
    return undefined
  }

  // 未一致の選手を作成・再利用。
  // 判定基準: 当時の背番号があれば「元メンバー(脱退者)」= isGuest:false、
  //           背番号が無ければ「助っ人」= isGuest:true。
  const playerCache = new Map<string, string>()  // normName → userId
  const createdGuests = new Set<string>()
  const createdFormer = new Set<string>()
  async function getOrCreatePlayerId(name: string, jersey: string): Promise<string | undefined> {
    const key = normName(name)
    if (!key) return undefined
    const hasNumber = /^\d+$/.test(jersey.trim())     // "0" も有効、"-"/空 は無し
    const num = hasNumber ? parseInt(jersey.trim(), 10) : null
    const shouldBeGuest = !hasNumber

    const cached = playerCache.get(key)
    if (cached) {
      // 既存(同一実行内)。番号付きで見つかったら助っ人→元メンバーへ昇格
      if (!shouldBeGuest) {
        await prisma.user.update({ where: { id: cached }, data: { isGuest: false, ...(num != null ? { number: num } : {}) } }).catch(() => {})
      }
      return cached
    }

    let u = await prisma.user.findFirst({ where: { name: name.trim() } })
    if (u) {
      // 既存ユーザー（助っ人として作成済み等）。番号付きなら元メンバーへ昇格
      if (!shouldBeGuest && u.isGuest) {
        await prisma.user.update({ where: { id: u.id }, data: { isGuest: false, ...(num != null ? { number: num } : {}) } }).catch(() => {})
      }
    } else {
      u = await prisma.user.create({
        data: {
          name: name.trim(),
          email: `imp_${key.replace(/[^a-z0-9]/g, '')}_${Date.now()}@guest`,
          password: 'x',
          role: 'PLAYER',
          number: num,
          isGuest: shouldBeGuest,
        },
      })
      if (shouldBeGuest) createdGuests.add(name.trim())
      else createdFormer.add(`${name.trim()}(#${num})`)
    }
    playerCache.set(key, u.id)
    return u.id
  }

  // 既存の助っ人ユーザーでも、当時背番号があれば元メンバーへ昇格させる
  const guestIds = new Set(users.filter(u => u.isGuest).map(u => u.id))
  const promotedFormer = new Set<string>()
  async function promoteIfNumbered(userId: string, jersey: string, name: string) {
    if (!guestIds.has(userId)) return
    if (!/^\d+$/.test(jersey.trim())) return
    const num = parseInt(jersey.trim(), 10)
    await prisma.user.update({ where: { id: userId }, data: { isGuest: false, number: num } }).catch(() => {})
    guestIds.delete(userId)
    promotedFormer.add(`${name.trim()}(#${num})`)
  }

  // 日付+対戦相手 → Game 群（ダブルヘッダー対応で配列）
  const gameLookup = new Map<string, typeof allGames>()
  for (const g of allGames) {
    const key = `${g.schedule.date.toISOString().slice(0, 10)}_${g.schedule.opponent}`
    if (!gameLookup.has(key)) gameLookup.set(key, [])
    gameLookup.get(key)!.push(g)
  }
  const usedDbIds = new Set<string>()  // 既に紐付けたDB試合（重複割当防止）

  let success = 0, skipped = 0, failed = 0

  for (let i = 0; i < GAME_IDS.length; i++) {
    const teamsOneId = GAME_IDS[i]

    const existing = await prisma.game.findFirst({
      where:   { teamsOneId: String(teamsOneId) },
      include: { schedule: true },
    })
    if (existing && !process.env.RESCAN) {
      const existingPitching = await prisma.pitchingStat.findFirst({ where: { gameId: existing.id } })
      if (existingPitching) {
        process.stdout.write(`[スキップ] ${teamsOneId}\r`)
        skipped++
        continue
      }
    }

    try {
      const url = `https://teams.one/teams/blitz/game/${teamsOneId}`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BLITZ-scraper/1.0)' }
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const html = await res.text()

      const titleInfo   = parseTitleInfo(html)
      const gameDate    = titleInfo?.date ?? ''
      const opponentName = titleInfo?.opponent ?? ''

      // 会場
      const placeMatch = html.match(/<p class="place">\s*([\s\S]*?)\s*<\/p>/)
      const placeRaw = placeMatch ? placeMatch[1].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ') : null
      const place = normalizeLocation(placeRaw)

      // 打者・投手成績
      const batting  = parseBattingStats(html)
      const pitching = parsePitchingStats(html)

      // DB の試合を検索
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let dbGame: typeof allGames[number] | undefined = (existing as any) ?? undefined

      if (!dbGame) {
        const group = (gameLookup.get(`${gameDate}_${opponentName}`) ?? []).filter(g => !usedDbIds.has(g.id))
        const totals = parseTotals(html)  // [合計0, 合計1]（順不同）
        if (group.length === 1) {
          dbGame = group[0]
        } else if (group.length > 1 && totals) {
          // ダブルヘッダー: スコア集合が一致するDB試合を選ぶ
          dbGame = group.find(g =>
            (g.ourScore === totals[0] && g.opponentScore === totals[1]) ||
            (g.ourScore === totals[1] && g.opponentScore === totals[0])
          ) ?? group[0]
        } else if (group.length > 1) {
          dbGame = group[0]
        }
        // 最後の手段: 同日でteamsOneId未設定が1件だけならそれ
        if (!dbGame && gameDate) {
          const cands = allGames.filter(g =>
            g.schedule.date.toISOString().slice(0, 10) === gameDate && !g.teamsOneId && !usedDbIds.has(g.id)
          )
          if (cands.length === 1) dbGame = cands[0]
        }
      }

      if (!dbGame) {
        console.log(`\n[未マッチ] ID=${teamsOneId} date=${gameDate} opponent=${opponentName}`)
        skipped++
        await sleep(300)
        continue
      }
      usedDbIds.add(dbGame.id)

      // イニングスコア（BLITZ得点と合計が一致する行をBLITZに割り当て）
      const inningData = parseInningScores(html, dbGame.ourScore)
      const inningJson = inningData ? JSON.stringify(inningData) : null
      await prisma.game.update({
        where: { id: dbGame.id },
        data: {
          teamsOneId:   String(teamsOneId),
          inningScores: inningJson,
        },
      })
      if (place) {
        await prisma.schedule.update({
          where: { id: dbGame.schedule.id },
          data:  { location: place },
        })
      }

      // GameStat 挿入
      let statCount = 0
      const unmatchedBatters: string[] = []

      for (const stat of batting) {
        let userId = resolveUserId(stat.name, stat.number)
        if (!userId) {
          // 未一致 → 当時背番号があれば元メンバー、無ければ助っ人として登録
          userId = await getOrCreatePlayerId(stat.name, stat.number)
          if (!userId) continue
          if (stat.name) unmatchedBatters.push(`"${stat.name}"(${stat.number})`)
        }
        await promoteIfNumbered(userId, stat.number, stat.name)

        try {
          await prisma.gameStat.upsert({
            where:  { userId_gameId: { userId, gameId: dbGame.id } },
            create: {
              userId,
              gameId:          dbGame.id,
              battingOrder:    stat.battingOrder || null,
              position:        stat.position || null,
              plateAppearances:stat.plateAppearances,
              atBats:          stat.atBats,
              hits:            stat.hits,
              doubles:         stat.doubles,
              triples:         stat.triples,
              homeRuns:        stat.homeRuns,
              rbi:             stat.rbi,
              runs:            stat.runs,
              stolenBases:     stat.stolenBases,
              strikeouts:      stat.strikeouts,
              walks:           stat.walks,
              hitByPitch:      stat.hitByPitch,
              sacrificeBunts:  stat.sacrificeBunts,
              sacrificeFlies:  stat.sacrificeFlies,
            },
            update: {
              battingOrder:    stat.battingOrder || null,
              position:        stat.position || null,
              plateAppearances:stat.plateAppearances,
              atBats:          stat.atBats,
              hits:            stat.hits,
              doubles:         stat.doubles,
              triples:         stat.triples,
              homeRuns:        stat.homeRuns,
              rbi:             stat.rbi,
              runs:            stat.runs,
              stolenBases:     stat.stolenBases,
              strikeouts:      stat.strikeouts,
              walks:           stat.walks,
              hitByPitch:      stat.hitByPitch,
              sacrificeBunts:  stat.sacrificeBunts,
              sacrificeFlies:  stat.sacrificeFlies,
            },
          })
          statCount++
        } catch (_) {
          // unique 制約など
        }
      }

      if (unmatchedBatters.length > 0) {
        console.log(`\n  [未マッチ打者] ${teamsOneId}: ${unmatchedBatters.join(', ')}`)
      }

      // PitchingStat 挿入
      let pitchCount = 0
      const unmatchedPitchers: string[] = []

      for (const p of pitching) {
        let userId = resolveUserId(p.name, p.number)
        if (!userId) {
          userId = await getOrCreatePlayerId(p.name, p.number)
          if (!userId) continue
          if (p.name) unmatchedPitchers.push(`"${p.name}"(${p.number})`)
        }
        await promoteIfNumbered(userId, p.number, p.name)

        try {
          await prisma.pitchingStat.upsert({
            where:  { userId_gameId: { userId, gameId: dbGame.id } },
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
          // unique 制約など
        }
      }

      if (unmatchedPitchers.length > 0) {
        console.log(`\n  [未マッチ投手] ${teamsOneId}: ${unmatchedPitchers.join(', ')}`)
      }

      console.log(`[OK] ${teamsOneId} | ${gameDate} vs ${opponentName} | stats:${statCount} pitch:${pitchCount}`)
      success++
    } catch (err) {
      console.log(`\n[ERROR] ${teamsOneId}: ${err}`)
      failed++
    }

    await sleep(500)
  }

  console.log(`\n=== 完了 ===`)
  console.log(`成功: ${success}, スキップ: ${skipped}, 失敗: ${failed}`)
  if (createdFormer.size > 0) {
    console.log(`\n=== 元メンバー(背番号あり/脱退者) として新規登録 (${createdFormer.size}名) ===`)
    console.log([...createdFormer].join(', '))
  }
  if (promotedFormer.size > 0) {
    console.log(`\n=== 助っ人→元メンバーへ昇格 (背番号あり) (${promotedFormer.size}名) ===`)
    console.log([...promotedFormer].join(', '))
  }
  if (createdGuests.size > 0) {
    console.log(`\n=== 助っ人(背番号なし) として登録 (${createdGuests.size}名) ===`)
    console.log([...createdGuests].join(', '))
    console.log('※ この中に実際はメンバー（別表記）がいれば MEMBER_ALIASES に追加して再実行してください')
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
