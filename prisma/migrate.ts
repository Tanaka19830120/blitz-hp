/**
 * Safe incremental migration script using libsql client.
 * Runs at build time. Each statement is idempotent.
 */
import { createClient } from '@libsql/client'
import 'dotenv/config'

const client = createClient({
  url: process.env.DATABASE_URL ?? 'file:./dev.db',
  authToken: process.env.DATABASE_AUTH_TOKEN ?? undefined,
})

async function safeAddColumn(table: string, column: string, definition: string) {
  try {
    await client.execute(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition};`)
    console.log(`✓ Added ${table}.${column}`)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('duplicate column') || msg.includes('already exists')) {
      // Column already exists — this is fine
    } else {
      console.error(`✗ Failed to add ${table}.${column}:`, msg)
      // Non-fatal: column might not be critical
    }
  }
}

async function main() {
  console.log('Running migrations...')

  // v2: Add photoUrl to User
  await safeAddColumn('User', 'photoUrl', 'TEXT')

  // v3: Add EVENT to GameType (no-op for SQLite, already TEXT)
  // GameType is stored as TEXT in SQLite, no migration needed

  // v5: Scorebook JSON on Game
  await safeAddColumn('Game', 'scorebook', 'TEXT')

  // v6: Multi-game day grouping on Schedule
  await safeAddColumn('Schedule', 'dayGroupId', 'TEXT')
  try {
    await client.execute(`CREATE INDEX IF NOT EXISTS "Schedule_dayGroupId_idx" ON "Schedule"("dayGroupId");`)
    console.log('✓ Schedule.dayGroupId index')
  } catch { /* already exists */ }

  // v7: Score photo URL on Game
  await safeAddColumn('Game', 'scorePhoto', 'TEXT')

  // v4: Setting table for admin-configurable values
  await client.execute(`
    CREATE TABLE IF NOT EXISTS "Setting" (
      "key"   TEXT PRIMARY KEY,
      "value" TEXT NOT NULL
    );
  `)
  // Default: qualifying PA = 2.0 PA per game
  await client.execute(
    `INSERT OR IGNORE INTO "Setting" ("key", "value") VALUES ('qualPaPerGame', '2.0');`
  )
  console.log('✓ Setting table ready')

  console.log('Migrations complete.')
  await client.close()
}

main().catch((e) => {
  console.error('Migration error:', e)
  process.exit(1)
})
