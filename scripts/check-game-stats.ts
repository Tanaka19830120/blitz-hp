import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import 'dotenv/config'

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL!, authToken: process.env.DATABASE_AUTH_TOKEN })
const p = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0])

async function main() {
  // game 972553 の詳細確認
  const game = await p.game.findUnique({
    where: { teamsOneId: '972553' },
    include: {
      schedule: true,
      stats: { include: { user: { select: { name: true, number: true } } }, orderBy: { battingOrder: 'asc' } },
      pitchingStats: { include: { user: { select: { name: true, number: true } } } },
    },
  })
  if (!game) { console.log('game 972553 not found'); return }

  console.log('=== Game 972553 ===')
  console.log(`${game.schedule.date.toLocaleDateString('ja-JP')} vs ${game.schedule.opponent} ${game.ourScore}-${game.opponentScore} ${game.result}`)
  console.log('\n打者成績:')
  for (const s of game.stats) {
    console.log(`  #${s.user.number} ${s.user.name.padEnd(10)} 打順:${s.battingOrder ?? '-'} 守:${s.position ?? '-'} 打席:${s.plateAppearances} 打数:${s.atBats} 安打:${s.hits} 打点:${s.rbi} 得点:${s.runs} 本:${s.homeRuns}`)
  }
  console.log('\n投手成績:')
  for (const s of game.pitchingStats) {
    console.log(`  #${s.user.number} ${s.user.name.padEnd(10)} ${s.decision ?? '-'} ${s.innings}回 失点:${s.runsAllowed} 自責:${s.earnedRuns}`)
  }

  // teamsOneIdなしのゲーム
  console.log('\n=== teamsOneIdなしのゲーム（個人成績なし可能性あり） ===')
  const noId = await p.game.findMany({
    where: { teamsOneId: null },
    include: { schedule: { select: { date: true, opponent: true } }, stats: { select: { id: true } } },
    orderBy: { schedule: { date: 'desc' } },
  })
  for (const g of noId) {
    console.log(`  ${g.schedule.date.toLocaleDateString('ja-JP')} vs ${g.schedule.opponent} stats:${g.stats.length}`)
  }
}
main().catch(console.error).finally(() => p.$disconnect())
