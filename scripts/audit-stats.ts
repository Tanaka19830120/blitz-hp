/**
 * teams.one から全試合の打撃/投手成績を取得し、DBと比較して不足を洗い出す
 */
import { createClient } from '@libsql/client'
import { parse } from 'node-html-parser'
import 'dotenv/config'

const BASE = 'https://teams.one/teams/blitz/game'
const DELAY_MS = 800

const client = createClient({
  url: process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL ?? 'file:./dev.db',
  authToken: process.env.DATABASE_AUTH_TOKEN ?? undefined,
})

interface TeamsOneStat {
  number: string   // jersey number or '' if none
  name: string
  battingOrder: number
  position: string
  pa: number
  ab: number
  hits: number
  hr: number
  rbi: number
  runs: number
  sb: number
}

interface TeamsOnePitch {
  number: string
  name: string
  decision: string
  innings: string
  runsAllowed: number
  earnedRuns: number
}

interface TeamsOneGame {
  batting: TeamsOneStat[]
  pitching: TeamsOnePitch[]
}

async function fetchTeamsOne(gameId: string): Promise<TeamsOneGame | null> {
  try {
    const res = await fetch(`${BASE}/${gameId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120' }
    })
    if (!res.ok) {
      console.error(`  HTTP ${res.status} for game ${gameId}`)
      return null
    }
    const html = await res.text()
    const root = parse(html)

    const batting: TeamsOneStat[] = []
    const pitching: TeamsOnePitch[] = []

    // テーブルを全部探す
    const tables = root.querySelectorAll('table')
    for (const table of tables) {
      const rows = table.querySelectorAll('tr')
      if (rows.length < 2) continue
      const headers = rows[0].querySelectorAll('th,td').map(h => h.text.trim())

      // 打撃テーブル検出: 打席 or PA が列にある
      const paIdx = headers.findIndex(h => h === '打席' || h === 'PA' || h === 'pa')
      const abIdx = headers.findIndex(h => h === '打数' || h === 'AB' || h === 'ab')
      if (paIdx >= 0 && abIdx >= 0) {
        // 背番号列
        const numIdx = headers.findIndex(h => h === '#' || h === '背番号' || h === 'No')
        const nameIdx = headers.findIndex(h => h === '名前' || h === '選手' || h === 'name' || h === '選手名')
        const orderIdx = headers.findIndex(h => h === '打順' || h === 'order')
        const posIdx = headers.findIndex(h => h === '守備' || h === 'pos' || h === '位置' || h === 'POS')
        const hitIdx = headers.findIndex(h => h === '安打' || h === 'H' || h === 'hits')
        const hrIdx = headers.findIndex(h => h === '本塁打' || h === 'HR' || h === 'hr')
        const rbiIdx = headers.findIndex(h => h === '打点' || h === 'RBI' || h === 'rbi')
        const runsIdx = headers.findIndex(h => h === '得点' || h === 'R' || h === 'runs')
        const sbIdx = headers.findIndex(h => h === '盗塁' || h === 'SB' || h === 'sb')

        for (let i = 1; i < rows.length; i++) {
          const cells = rows[i].querySelectorAll('td')
          if (cells.length < 3) continue
          const name = nameIdx >= 0 ? cells[nameIdx]?.text.trim() : ''
          if (!name) continue
          batting.push({
            number: numIdx >= 0 ? (cells[numIdx]?.text.trim() ?? '') : '',
            name,
            battingOrder: orderIdx >= 0 ? parseInt(cells[orderIdx]?.text.trim() ?? '0') || 0 : i,
            position: posIdx >= 0 ? (cells[posIdx]?.text.trim() ?? '') : '',
            pa: parseInt(cells[paIdx]?.text.trim() ?? '0') || 0,
            ab: parseInt(cells[abIdx]?.text.trim() ?? '0') || 0,
            hits: hitIdx >= 0 ? parseInt(cells[hitIdx]?.text.trim() ?? '0') || 0 : 0,
            hr: hrIdx >= 0 ? parseInt(cells[hrIdx]?.text.trim() ?? '0') || 0 : 0,
            rbi: rbiIdx >= 0 ? parseInt(cells[rbiIdx]?.text.trim() ?? '0') || 0 : 0,
            runs: runsIdx >= 0 ? parseInt(cells[runsIdx]?.text.trim() ?? '0') || 0 : 0,
            sb: sbIdx >= 0 ? parseInt(cells[sbIdx]?.text.trim() ?? '0') || 0 : 0,
          })
        }
      }

      // 投手テーブル検出
      const ipIdx = headers.findIndex(h => h === '投球回' || h === 'IP' || h === 'ip' || h === '回')
      if (ipIdx >= 0) {
        const numIdx = headers.findIndex(h => h === '#' || h === '背番号')
        const nameIdx = headers.findIndex(h => h === '名前' || h === '選手' || h === '選手名')
        const decIdx = headers.findIndex(h => h === '勝敗' || h === '結果' || h === 'dec')
        const raIdx = headers.findIndex(h => h === '失点' || h === 'R' || h === 'runs')
        const erIdx = headers.findIndex(h => h === '自責点' || h === 'ER' || h === 'er')

        for (let i = 1; i < rows.length; i++) {
          const cells = rows[i].querySelectorAll('td')
          if (cells.length < 2) continue
          const name = nameIdx >= 0 ? cells[nameIdx]?.text.trim() : ''
          if (!name) continue
          pitching.push({
            number: numIdx >= 0 ? (cells[numIdx]?.text.trim() ?? '') : '',
            name,
            decision: decIdx >= 0 ? (cells[decIdx]?.text.trim() ?? '') : '',
            innings: cells[ipIdx]?.text.trim() ?? '0',
            runsAllowed: raIdx >= 0 ? parseInt(cells[raIdx]?.text.trim() ?? '0') || 0 : 0,
            earnedRuns: erIdx >= 0 ? parseInt(cells[erIdx]?.text.trim() ?? '0') || 0 : 0,
          })
        }
      }
    }

    return { batting, pitching }
  } catch (e) {
    console.error(`  Error fetching game ${gameId}:`, e)
    return null
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  // DBからユーザー一覧取得 (背番号 → userId マッピング)
  const usersResult = await client.execute('SELECT id, name, number FROM "User"')
  const usersByNumber = new Map<string, { id: string; name: string }>()
  const usersByName = new Map<string, { id: string; number: string | null }>()
  for (const row of usersResult.rows) {
    const num = row[2] != null ? String(row[2]) : null
    const id = String(row[0])
    const name = String(row[1])
    if (num) usersByNumber.set(num, { id, name })
    usersByName.set(name, { id, number: num })
  }

  // DBから全試合のteamsOneId取得
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

  console.log(`全${games.length}試合をチェック開始...\n`)

  let totalMissingBatting = 0
  let totalMissingPitching = 0
  const missingLog: string[] = []

  for (let i = 0; i < games.length; i++) {
    const g = games[i]
    process.stdout.write(`[${i + 1}/${games.length}] ${g.date} vs ${g.opponent} (${g.teamsOneId})... `)

    // DBの既存成績取得
    const dbStats = await client.execute({
      sql: `SELECT u.number, u.name, gs.battingOrder FROM "GameStat" gs JOIN "User" u ON u.id = gs.userId WHERE gs.gameId = ?`,
      args: [g.id]
    })
    const dbPitch = await client.execute({
      sql: `SELECT u.number, u.name FROM "PitchingStat" ps JOIN "User" u ON u.id = ps.userId WHERE ps.gameId = ?`,
      args: [g.id]
    })

    const dbStatNumbers = new Set(dbStats.rows.map(r => r[0] != null ? String(r[0]) : '').filter(Boolean))
    const dbPitchNumbers = new Set(dbPitch.rows.map(r => r[0] != null ? String(r[0]) : '').filter(Boolean))

    // teams.one からフェッチ
    const teamsData = await fetchTeamsOne(g.teamsOneId)
    if (!teamsData) {
      console.log('取得失敗')
      continue
    }

    const missingBatters = teamsData.batting.filter(s => {
      if (!s.number) return false  // 背番号なし選手はスキップ
      return !dbStatNumbers.has(s.number)
    })
    const missingPitchers = teamsData.pitching.filter(s => {
      if (!s.number) return false
      return !dbPitchNumbers.has(s.number)
    })

    if (missingBatters.length === 0 && missingPitchers.length === 0) {
      console.log('OK')
    } else {
      console.log(`不足: 打者${missingBatters.length}件, 投手${missingPitchers.length}件`)
      for (const s of missingBatters) {
        const registered = usersByNumber.has(s.number)
        missingLog.push(`  打者未登録: ${g.date} vs ${g.opponent} #${s.number} ${s.name} ${registered ? '(DB登録済み)' : '(未登録選手)'}`)
        if (registered) totalMissingBatting++
      }
      for (const s of missingPitchers) {
        const registered = usersByNumber.has(s.number)
        missingLog.push(`  投手未登録: ${g.date} vs ${g.opponent} #${s.number} ${s.name} ${registered ? '(DB登録済み)' : '(未登録選手)'}`)
        if (registered) totalMissingPitching++
      }
    }

    await sleep(DELAY_MS)
  }

  console.log('\n========== 監査結果 ==========')
  console.log(`DB登録済みメンバーで成績が欠落: 打者${totalMissingBatting}件, 投手${totalMissingPitching}件`)
  if (missingLog.length > 0) {
    console.log('\n欠落詳細:')
    for (const l of missingLog) console.log(l)
  } else {
    console.log('\n全成績OK（背番号なし選手除く）')
  }

  await client.close()
}

main().catch(console.error)
