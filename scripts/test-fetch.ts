/**
 * teams.one game page の HTML 構造を確認
 */
import { parse } from 'node-html-parser'

async function main() {
  const gameId = '972553'
  const res = await fetch(`https://teams.one/teams/blitz/game/${gameId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120' }
  })
  console.log('Status:', res.status)
  const html = await res.text()

  // テーブルをすべてリスト
  const root = parse(html)
  const tables = root.querySelectorAll('table')
  console.log(`テーブル数: ${tables.length}`)

  for (let ti = 0; ti < tables.length; ti++) {
    const rows = tables[ti].querySelectorAll('tr')
    if (rows.length === 0) continue
    const headers = rows[0].querySelectorAll('th,td').map(h => h.text.trim())
    console.log(`\n[テーブル${ti}] ヘッダー: ${headers.join(' | ')}`)
    // 最初の3データ行
    for (let ri = 1; ri < Math.min(4, rows.length); ri++) {
      const cells = rows[ri].querySelectorAll('td').map(c => c.text.trim())
      console.log(`  行${ri}: ${cells.join(' | ')}`)
    }
  }
}
main().catch(console.error)
