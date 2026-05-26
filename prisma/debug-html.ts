import { parse } from 'node-html-parser'

async function main() {
const res = await fetch('https://teams.one/teams/blitz/game/972553', {
  headers: { 'User-Agent': 'Mozilla/5.0' }
})
const html = await res.text()

// 日付パターン
const m1 = html.match(/20\d\d\/\d+\/\d+/)
const m2 = html.match(/20\d\d-\d+-\d+/)
const m3 = html.match(/20\d\d年\d+月\d+日/)
console.log('slash:', m1?.[0], '| dash:', m2?.[0], '| jp:', m3?.[0])

// ページタイトル
const root = parse(html)
console.log('title:', root.querySelector('title')?.text.trim())
console.log('h1:', root.querySelector('h1')?.text.trim())

// テーブル一覧
const tables = root.querySelectorAll('table')
console.log('tables count:', tables.length)
for (let i = 0; i < Math.min(tables.length, 8); i++) {
  const ths = tables[i].querySelectorAll('th').map(h => h.text.trim()).filter(Boolean)
  const rows = tables[i].querySelectorAll('tr')
  const r1 = rows[1]?.querySelectorAll('td').map(d => d.text.trim()).slice(0, 6) ?? []
  console.log(`T${i} | ths: ${ths.slice(0, 6).join('|')} | first-row-tds: ${r1.join('|')}`)
}

// HTML の最初の 3000 文字を出力
console.log('\n--- HTML snippet (first 3000 chars) ---')
console.log(html.substring(0, 3000))
}
main().catch(console.error)
