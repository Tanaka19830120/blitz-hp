/**
 * Safe incremental migration script using libsql client.
 * Runs at build time. Each statement is idempotent.
 */
import { createClient } from '@libsql/client'
import 'dotenv/config'

const client = createClient({
  url: process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL ?? 'file:./dev.db',
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

  // v9: Add isGuest to User (助っ人)
  await safeAddColumn('User', 'isGuest', 'BOOLEAN NOT NULL DEFAULT 0')

  // v13: 個人ページテーマカラー
  await safeAddColumn('User', 'themeColor', 'TEXT')

  // v14: リンク集
  await client.execute(`
    CREATE TABLE IF NOT EXISTS "Link" (
      "id"          TEXT PRIMARY KEY,
      "title"       TEXT NOT NULL,
      "url"         TEXT NOT NULL,
      "description" TEXT,
      "imageUrl"    TEXT,
      "order"       INTEGER NOT NULL DEFAULT 0,
      "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  try {
    await client.execute(`CREATE INDEX IF NOT EXISTS "Link_order_idx" ON "Link"("order");`)
    console.log('✓ Link table ready')
  } catch { /* already exists */ }

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

  // v8: 写真アルバム
  await client.execute(`
    CREATE TABLE IF NOT EXISTS "PhotoAlbum" (
      "id"        TEXT PRIMARY KEY,
      "title"     TEXT NOT NULL,
      "date"      DATETIME NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS "Photo" (
      "id"           TEXT PRIMARY KEY,
      "albumId"      TEXT NOT NULL,
      "url"          TEXT NOT NULL,
      "uploadedById" TEXT,
      "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Photo_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "PhotoAlbum"("id") ON DELETE CASCADE,
      CONSTRAINT "Photo_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL
    );
  `)
  try {
    await client.execute(`CREATE INDEX IF NOT EXISTS "PhotoAlbum_date_idx" ON "PhotoAlbum"("date");`)
    await client.execute(`CREATE INDEX IF NOT EXISTS "Photo_albumId_idx" ON "Photo"("albumId");`)
    console.log('✓ PhotoAlbum / Photo tables ready')
  } catch { /* already exists */ }

  // v10: お問い合わせ
  await client.execute(`
    CREATE TABLE IF NOT EXISTS "Inquiry" (
      "id"        TEXT PRIMARY KEY,
      "name"      TEXT NOT NULL,
      "email"     TEXT NOT NULL,
      "type"      TEXT NOT NULL,
      "message"   TEXT NOT NULL,
      "handled"   BOOLEAN NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  try {
    await client.execute(`CREATE INDEX IF NOT EXISTS "Inquiry_createdAt_idx" ON "Inquiry"("createdAt");`)
    console.log('✓ Inquiry table ready')
  } catch { /* already exists */ }

  // v11: MVP投票
  await client.execute(`
    CREATE TABLE IF NOT EXISTS "MvpVote" (
      "id"        TEXT PRIMARY KEY,
      "gameId"    TEXT NOT NULL,
      "voterId"   TEXT NOT NULL,
      "nomineeId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "MvpVote_gameId_fkey"    FOREIGN KEY ("gameId")    REFERENCES "Game"("id") ON DELETE CASCADE,
      CONSTRAINT "MvpVote_voterId_fkey"   FOREIGN KEY ("voterId")   REFERENCES "User"("id") ON DELETE CASCADE,
      CONSTRAINT "MvpVote_nomineeId_fkey" FOREIGN KEY ("nomineeId") REFERENCES "User"("id") ON DELETE CASCADE,
      UNIQUE("gameId", "voterId")
    );
  `)
  console.log('✓ MvpVote table ready')

  // v12: 写真いいね
  await client.execute(`
    CREATE TABLE IF NOT EXISTS "PhotoLike" (
      "id"        TEXT PRIMARY KEY,
      "photoId"   TEXT NOT NULL,
      "userId"    TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PhotoLike_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE,
      CONSTRAINT "PhotoLike_userId_fkey"  FOREIGN KEY ("userId")  REFERENCES "User"("id") ON DELETE CASCADE,
      UNIQUE("photoId", "userId")
    );
  `)
  console.log('✓ PhotoLike table ready')

  console.log('Migrations complete.')
  await client.close()
}

main().catch((e) => {
  console.error('Migration error:', e)
  process.exit(1)
})
