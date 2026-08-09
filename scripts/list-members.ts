import { createClient } from '@libsql/client'
import 'dotenv/config'

async function main() {
  const client = createClient({
    url: process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL ?? 'file:./dev.db',
    authToken: process.env.DATABASE_AUTH_TOKEN ?? undefined,
  })
  const rows = await client.execute('SELECT id, name, photoUrl FROM "User" ORDER BY name')
  for (const row of rows.rows) {
    console.log(row[0]?.toString().slice(0, 8), JSON.stringify(row[1]), row[2] ? '✓ has photo' : '— no photo')
  }
  await client.close()
}
main().catch(console.error)
