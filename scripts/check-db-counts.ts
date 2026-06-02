import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import 'dotenv/config'

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL!, authToken: process.env.DATABASE_AUTH_TOKEN })
const p = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0])

async function main() {
  const [games, stats, pitch] = await Promise.all([p.game.count(), p.gameStat.count(), p.pitchingStat.count()])
  console.log('Games:', games)
  console.log('GameStats (打者):', stats)
  console.log('PitchingStats (投手):', pitch)
  const withId = await p.game.count({ where: { teamsOneId: { not: null } } })
  console.log('Games with teamsOneId:', withId)

  // サンプル: teamsOneId があるゲーム
  const sample = await p.game.findMany({ where: { teamsOneId: { not: null } }, take: 3, select: { teamsOneId: true, schedule: { select: { date: true, opponent: true } } } })
  console.log('Sample:', JSON.stringify(sample, null, 2))
}
main().catch(console.error).finally(() => p.$disconnect())
