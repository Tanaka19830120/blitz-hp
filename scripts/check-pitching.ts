import { createClient } from '@libsql/client'
import 'dotenv/config'

async function main() {
  const client = createClient({
    url: process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL ?? 'file:./dev.db',
    authToken: process.env.DATABASE_AUTH_TOKEN ?? undefined,
  })

  const r = await client.execute('SELECT COUNT(*) FROM "PitchingStat"')
  console.log('PitchingStat件数:', r.rows[0][0])

  // innings フォーマットを確認
  const samples = await client.execute('SELECT innings, decision, earnedRuns, userId FROM "PitchingStat" LIMIT 15')
  console.log('\n--- innings サンプル ---')
  for (const row of samples.rows) {
    console.log(`innings="${row[0]}"  decision="${row[1]}"  earnedRuns=${row[2]}  userId=${String(row[3]).slice(0, 8)}`)
  }

  // ユーザーごとの集計チェック
  const byUser = await client.execute(`
    SELECT u.name, COUNT(p.id) as games, SUM(p.earnedRuns) as er
    FROM "PitchingStat" p
    JOIN "User" u ON u.id = p.userId
    GROUP BY p.userId, u.name
    ORDER BY games DESC
    LIMIT 10
  `)
  console.log('\n--- ユーザー別投手成績 ---')
  for (const row of byUser.rows) {
    console.log(`${row[0]}: ${row[1]}試合, 自責点合計${row[2]}`)
  }

  await client.close()
}
main().catch(console.error)
