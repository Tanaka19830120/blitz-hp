/**
 * teams.one から全試合の打撃/投手成績を取得し、DBと照合してUPSERT修正する
 *
 * 実行: npx tsx scripts/fix-stats.ts
 * ドライラン: npx tsx scripts/fix-stats.ts --dry
 */
import { createClient } from '@libsql/client'
import { parse } from 'node-html-parser'
import 'dotenv/config'

const BASE = 'https://teams.one/teams/blitz/game'
const DELAY_MS = 700
const DRY_RUN = process.argv.includes('--dry')

const client = createClient({
  url: process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL ?? 'file:./dev.db',
  authToken: process.env.DATABASE_AUTH_TOKEN ?? undefined,
})

interface BattingStat {
  number: string
  name: string
  battingOrder: number
  position: string
  pa: number; ab: number; hits: number; hr: number; rbi: number; runs: number
  sb: number; doubles: number; triples: number; strikeouts: number; walks: number
  hitByPitch: number; sacrificeBunts: number; sacrificeFlies: number
}

interface PitchingStat {
  number: string
  name: string
  decision: string
  innings: string
  pitches: number
  runsAllowed: number; earnedRuns: number
  hitsAllowed: number; strikeouts: number; walks: number
  pitchOrder: number
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function fetchGame(gameId: string): Promise<{ batting: BattingStat[]; pitching: PitchingStat[] } | null> {
  try {
    const res = await fetch(`${BASE}/${gameId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120' }
    })
    if (!res.ok) return null
    const html = await res.text()
    const root = parse(html)
    const tables = root.querySelectorAll('table')

    const batting: BattingStat[] = []
    const pitching: PitchingStat[] = []

    // 打撃テーブル: ヘッダーに"打席"が含まれるテーブル
    // 投手テーブル: ヘッダーに"投球回"が含まれるテーブル
    for (const table of tables) {
      const rows = table.querySelectorAll('tr')
      if (rows.length < 2) continue
      const headers = rows[0].querySelectorAll('th,td').map(h => h.text.trim())
      const hi = (name: string) => headers.indexOf(name)

      if (hi('打席') >= 0) {
        // 打撃テーブル
        for (let i = 1; i < rows.length; i++) {
          const cells = rows[i].querySelectorAll('td')
          if (cells.length < 6) continue
          const num = cells[hi('#')]?.text.trim() ?? ''
          const name = cells[hi('選手名')]?.text.trim() ?? ''
          if (!name || name === '合計') continue
          const n = (col: string) => parseInt(cells[hi(col)]?.text.trim() ?? '0') || 0
          batting.push({
            number: num,
            name,
            battingOrder: n('打順'),
            position: cells[hi('守備')]?.text.trim() ?? '',
            pa: n('打席'), ab: n('打数'), hits: n('安打'), hr: n('本'),
            rbi: n('打点'), runs: n('得点'), sb: n('盗塁'),
            doubles: n('二塁打'), triples: n('三塁打'),
            strikeouts: n('三振'), walks: n('四球'),
            hitByPitch: n('死球'), sacrificeBunts: n('犠打'), sacrificeFlies: n('犠飛'),
          })
        }
      }

      if (hi('投球回') >= 0) {
        // 投手テーブル
        for (let i = 1; i < rows.length; i++) {
          const cells = rows[i].querySelectorAll('td')
          if (cells.length < 4) continue
          const num = cells[hi('#')]?.text.trim() ?? ''
          const name = cells[hi('選手名')]?.text.trim() ?? ''
          if (!name) continue
          const n = (col: string) => parseInt(cells[hi(col)]?.text.trim() ?? '0') || 0
          pitching.push({
            number: num,
            name,
            decision: cells[hi('勝敗')]?.text.trim() ?? '',
            innings: cells[hi('投球回')]?.text.trim() ?? '0',
            pitches: n('投球数'),
            runsAllowed: n('失点'), earnedRuns: n('自責点'),
            hitsAllowed: n('被安打'), strikeouts: n('奪三振'), walks: n('与四球'),
            pitchOrder: n('登板順'),
          })
        }
      }
    }

    return { batting, pitching }
  } catch (e) {
    return null
  }
}

async function main() {
  console.log(DRY_RUN ? '=== ドライラン（実際には書き込みしません）===' : '=== 実行モード（DB書き込みあり）===')
  console.log()

  // ユーザーマッピング: 背番号 → {id, name}
  const usersResult = await client.execute('SELECT id, name, number FROM "User"')
  const byNumber = new Map<string, string>()           // 一意な番号 → userId
  const byNumberMulti = new Map<string, { id: string; name: string }[]>()  // 重複番号
  const byName = new Map<string, string>()             // name → userId（補助）

  for (const row of usersResult.rows) {
    const userId = String(row[0])
    const name = String(row[1])
    const num = row[2] != null ? String(row[2]) : null
    byName.set(name, userId)
    if (num) {
      const existing = byNumberMulti.get(num) ?? []
      existing.push({ id: userId, name })
      byNumberMulti.set(num, existing)
    }
  }
  // 一意なものだけ byNumber に入れる
  for (const [num, users] of byNumberMulti) {
    if (users.length === 1) byNumber.set(num, users[0].id)
    // 重複の場合は名前で解決（後述）
  }

  function resolveUser(number: string, teamsOneName: string): string | undefined {
    const users = byNumberMulti.get(number)
    if (!users || users.length === 0) return undefined
    if (users.length === 1) return users[0].id

    // 重複背番号: 名前で解決を試みる
    const normalized = teamsOneName.replace(/\s+/g, '').toUpperCase()
    // 1. 完全一致
    for (const u of users) {
      if (u.name.replace(/\s+/g, '').toUpperCase() === normalized) return u.id
    }
    // 2. 部分一致（互いに含む）
    for (const u of users) {
      const uNorm = u.name.replace(/\s+/g, '').toUpperCase()
      if (uNorm.includes(normalized) || normalized.includes(uNorm)) return u.id
    }
    // 3. 先頭3文字一致
    for (const u of users) {
      const uNorm = u.name.replace(/\s+/g, '').toUpperCase()
      if (uNorm.startsWith(normalized.slice(0, 3)) || normalized.startsWith(uNorm.slice(0, 3))) {
        return u.id
      }
    }
    // 解決できない場合は undefined を返してスキップ（誤挿入防止）
    console.warn(`  ⚠ 背番号${number}が複数ヒット（${users.map(u => u.name).join(', ')}）、名前「${teamsOneName}」で解決できずスキップ`)
    return undefined
  }

  // 全試合取得
  const gamesResult = await client.execute(`
    SELECT g.id, g.teamsOneId, s.date, s.opponent
    FROM "Game" g
    JOIN "Schedule" s ON s.id = g.scheduleId
    WHERE g.teamsOneId IS NOT NULL
    ORDER BY s.date DESC
  `)
  const games = gamesResult.rows.map(r => ({
    id: String(r[0]),
    teamsOneId: String(r[1]),
    date: String(r[2]).slice(0, 10),
    opponent: String(r[3]),
  }))

  let updatedBatting = 0, updatedPitching = 0, skippedNoUser = 0

  for (let i = 0; i < games.length; i++) {
    const g = games[i]
    process.stdout.write(`[${i + 1}/${games.length}] ${g.date} vs ${g.opponent} (${g.teamsOneId})... `)

    const data = await fetchGame(g.teamsOneId)
    if (!data) { console.log('取得失敗'); await sleep(2000); continue }

    // 打撃成績 UPSERT
    for (const s of data.batting) {
      const userId = s.number ? resolveUser(s.number, s.name) : undefined
      if (!userId) { skippedNoUser++; continue }

      // 既存チェック
      const existing = await client.execute({
        sql: 'SELECT id FROM "GameStat" WHERE userId=? AND gameId=?',
        args: [userId, g.id]
      })

      if (DRY_RUN) {
        if (existing.rows.length === 0) {
          process.stdout.write(`+打${s.number} `)
          updatedBatting++
        }
        continue
      }

      if (existing.rows.length === 0) {
        // INSERT
        await client.execute({
          sql: `INSERT INTO "GameStat"
            (id, battingOrder, position, plateAppearances, atBats, hits, doubles, triples, homeRuns,
             rbi, runs, stolenBases, strikeouts, walks, hitByPitch, sacrificeBunts, sacrificeFlies,
             userId, gameId)
            VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [s.battingOrder || null, s.position || null, s.pa, s.ab, s.hits, s.doubles, s.triples,
                 s.hr, s.rbi, s.runs, s.sb, s.strikeouts, s.walks, s.hitByPitch, s.sacrificeBunts,
                 s.sacrificeFlies, userId, g.id]
        })
        process.stdout.write(`+打${s.number} `)
        updatedBatting++
      } else {
        // UPDATE（上書き）
        await client.execute({
          sql: `UPDATE "GameStat" SET
            battingOrder=?, position=?, plateAppearances=?, atBats=?, hits=?, doubles=?, triples=?,
            homeRuns=?, rbi=?, runs=?, stolenBases=?, strikeouts=?, walks=?, hitByPitch=?,
            sacrificeBunts=?, sacrificeFlies=?
            WHERE userId=? AND gameId=?`,
          args: [s.battingOrder || null, s.position || null, s.pa, s.ab, s.hits, s.doubles, s.triples,
                 s.hr, s.rbi, s.runs, s.sb, s.strikeouts, s.walks, s.hitByPitch, s.sacrificeBunts,
                 s.sacrificeFlies, userId, g.id]
        })
      }
    }

    // 投手成績 UPSERT
    for (const s of data.pitching) {
      const userId = s.number ? resolveUser(s.number, s.name) : undefined
      if (!userId) { skippedNoUser++; continue }

      const existing = await client.execute({
        sql: 'SELECT id FROM "PitchingStat" WHERE userId=? AND gameId=?',
        args: [userId, g.id]
      })

      if (DRY_RUN) {
        if (existing.rows.length === 0) {
          process.stdout.write(`+投${s.number} `)
          updatedPitching++
        }
        continue
      }

      const decisionVal = s.decision || null

      if (existing.rows.length === 0) {
        await client.execute({
          sql: `INSERT INTO "PitchingStat"
            (id, decision, innings, pitches, runsAllowed, earnedRuns, hitsAllowed, strikeouts, walks, userId, gameId)
            VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [decisionVal, s.innings, s.pitches, s.runsAllowed, s.earnedRuns,
                 s.hitsAllowed, s.strikeouts, s.walks, userId, g.id]
        })
        process.stdout.write(`+投${s.number} `)
        updatedPitching++
      } else {
        await client.execute({
          sql: `UPDATE "PitchingStat" SET
            decision=?, innings=?, pitches=?, runsAllowed=?, earnedRuns=?, hitsAllowed=?, strikeouts=?, walks=?
            WHERE userId=? AND gameId=?`,
          args: [decisionVal, s.innings, s.pitches, s.runsAllowed, s.earnedRuns,
                 s.hitsAllowed, s.strikeouts, s.walks, userId, g.id]
        })
      }
    }

    console.log()
    await sleep(DELAY_MS)
  }

  console.log('\n========================================')
  console.log(`打者成績 追加/更新: ${updatedBatting}件`)
  console.log(`投手成績 追加/更新: ${updatedPitching}件`)
  console.log(`スキップ（背番号なし選手）: ${skippedNoUser}件`)

  await client.close()
}

main().catch(console.error)
