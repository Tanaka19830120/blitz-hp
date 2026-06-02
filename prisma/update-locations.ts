/**
 * teams.one の各試合ページから会場（<p class="place">）を取得して
 * Schedule.location を更新するスクリプト
 *
 * 実行: npx tsx prisma/update-locations.ts
 */
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import 'dotenv/config'

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL ?? 'file:./dev.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
})
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0])

const DEFAULT_LOCATION = '加古川河川敷両荘グラウンド'

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** teams.one ページから <p class="place"> の中身を抽出（HTMLタグを除去） */
function extractPlace(html: string): string | null {
  const m = html.match(/<p class="place">\s*([\s\S]*?)\s*<\/p>/)
  if (!m) return null
  // HTMLタグを除去してテキストのみ取得
  const text = m[1].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ')
  return text || null
}

async function main() {
  console.log('=== 会場データ更新スクリプト ===')

  // teamsOneId が設定されているゲームを全取得
  const games = await prisma.game.findMany({
    where: { teamsOneId: { not: null } },
    include: { schedule: { select: { id: true, location: true, opponent: true, date: true } } },
    orderBy: { schedule: { date: 'asc' } },
  })

  console.log(`teamsOneId あり: ${games.length} 試合`)
  const toUpdate = games.filter(g => g.schedule.location === DEFAULT_LOCATION)
  const alreadyCustom = games.filter(g => g.schedule.location !== DEFAULT_LOCATION)
  console.log(`既にカスタム会場設定済み: ${alreadyCustom.length} 試合`)
  console.log(`更新対象（デフォルト会場）: ${toUpdate.length} 試合`)

  if (toUpdate.length === 0) {
    console.log('更新対象なし。終了します。')
    return
  }

  let success = 0, failed = 0, noPlace = 0

  for (let i = 0; i < toUpdate.length; i++) {
    const game = toUpdate[i]
    const teamsOneId = game.teamsOneId!
    const dateStr = game.schedule.date.toISOString().slice(0, 10)

    try {
      const url = `https://teams.one/teams/blitz/game/${teamsOneId}`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BLITZ-scraper/1.0)' }
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const html = await res.text()

      const place = extractPlace(html)
      if (!place) {
        console.log(`[場所なし] ID=${teamsOneId} | ${dateStr} vs ${game.schedule.opponent}`)
        noPlace++
      } else {
        await prisma.schedule.update({
          where: { id: game.schedule.id },
          data: { location: place },
        })
        console.log(`[更新] ID=${teamsOneId} | ${dateStr} vs ${game.schedule.opponent} => ${place}`)
        success++
      }
    } catch (err) {
      console.log(`[ERROR] ID=${teamsOneId} | ${dateStr} vs ${game.schedule.opponent}: ${err}`)
      failed++
    }

    // 進捗表示
    if ((i + 1) % 10 === 0) {
      console.log(`--- 進捗: ${i + 1}/${toUpdate.length} ---`)
    }

    // レート制限対策
    await sleep(400)
  }

  console.log('\n=== 完了 ===')
  console.log(`成功: ${success}, 場所なし: ${noPlace}, 失敗: ${failed}`)

  // 結果確認
  const distinct = await prisma.$queryRawUnsafe<{ location: string; cnt: number }[]>(
    'SELECT location, COUNT(*) as cnt FROM Schedule GROUP BY location ORDER BY cnt DESC'
  )
  console.log('\n=== 会場別件数 ===')
  for (const row of distinct) {
    console.log(` ${row.location}: ${row.cnt}件`)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
