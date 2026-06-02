/**
 * game 972553 の parsing テスト
 */
import { parse } from 'node-html-parser'

async function fetchGame(gameId: string) {
  const res = await fetch(`https://teams.one/teams/blitz/game/${gameId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120' }
  })
  const html = await res.text()
  const root = parse(html)
  const tables = root.querySelectorAll('table')

  const batting: any[] = []
  const pitching: any[] = []

  for (const table of tables) {
    const rows = table.querySelectorAll('tr')
    if (rows.length < 2) continue
    const headers = rows[0].querySelectorAll('th,td').map(h => h.text.trim())
    const hi = (name: string) => headers.indexOf(name)

    if (hi('打席') >= 0) {
      for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll('td')
        if (cells.length < 6) continue
        const name = cells[hi('選手名')]?.text.trim() ?? ''
        if (!name || name === '合計') continue
        const n = (col: string) => parseInt(cells[hi(col)]?.text.trim() ?? '0') || 0
        batting.push({
          number: cells[hi('#')]?.text.trim() ?? '',
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
      for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll('td')
        if (cells.length < 4) continue
        const name = cells[hi('選手名')]?.text.trim() ?? ''
        if (!name) continue
        const n = (col: string) => parseInt(cells[hi(col)]?.text.trim() ?? '0') || 0
        pitching.push({
          number: cells[hi('#')]?.text.trim() ?? '',
          name,
          decision: cells[hi('勝敗')]?.text.trim() ?? '',
          innings: cells[hi('投球回')]?.text.trim() ?? '0',
          pitches: n('投球数'),
          runsAllowed: n('失点'), earnedRuns: n('自責点'),
          hitsAllowed: n('被安打'), strikeouts: n('奪三振'), walks: n('与四球'),
        })
      }
    }
  }
  return { batting, pitching }
}

async function main() {
  const data = await fetchGame('972553')
  console.log('=== 打撃成績 ===')
  for (const s of data.batting) {
    console.log(`#${s.number} ${s.name.padEnd(12)} 打順${s.battingOrder} 守:${s.position} 打席:${s.pa} 打数:${s.ab} 安打:${s.hits} 本:${s.hr} 打点:${s.rbi} 得点:${s.runs} 二:${s.doubles} 三:${s.triples} 三振:${s.strikeouts} 四:${s.walks} 死:${s.hitByPitch}`)
  }
  console.log('\n=== 投手成績 ===')
  for (const s of data.pitching) {
    console.log(`#${s.number} ${s.name} ${s.decision} ${s.innings} 失:${s.runsAllowed} 自責:${s.earnedRuns}`)
  }
}
main().catch(console.error)
