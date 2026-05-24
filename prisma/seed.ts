import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import bcrypt from 'bcryptjs'

const adapter = new PrismaLibSql({ url: 'file:./dev.db' })
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0])

async function main() {
  console.log('Seeding...')

  // Clear existing data
  await prisma.gameStat.deleteMany()
  await prisma.game.deleteMany()
  await prisma.attendance.deleteMany()
  await prisma.schedule.deleteMany()
  await prisma.user.deleteMany()

  // Create users
  const adminPw = await bcrypt.hash('admin123', 10)
  const playerPw = await bcrypt.hash('player123', 10)

  const admin = await prisma.user.create({
    data: { name: '田中 誠', email: 'admin@blitz.jp', password: adminPw, role: 'ADMIN', position: '監督' },
  })

  const players = await Promise.all([
    prisma.user.create({ data: { name: '佐藤 健', email: 'sato@blitz.jp', password: playerPw, role: 'PLAYER', number: 1, position: 'ピッチャー' } }),
    prisma.user.create({ data: { name: '鈴木 翔', email: 'suzuki@blitz.jp', password: playerPw, role: 'PLAYER', number: 2, position: 'キャッチャー' } }),
    prisma.user.create({ data: { name: '高橋 大', email: 'takahashi@blitz.jp', password: playerPw, role: 'PLAYER', number: 3, position: '一塁手' } }),
    prisma.user.create({ data: { name: '伊藤 亮', email: 'ito@blitz.jp', password: playerPw, role: 'PLAYER', number: 4, position: '二塁手' } }),
    prisma.user.create({ data: { name: '渡辺 純', email: 'watanabe@blitz.jp', password: playerPw, role: 'PLAYER', number: 5, position: '三塁手' } }),
    prisma.user.create({ data: { name: '山本 隆', email: 'yamamoto@blitz.jp', password: playerPw, role: 'PLAYER', number: 6, position: '遊撃手' } }),
    prisma.user.create({ data: { name: '中村 光', email: 'nakamura@blitz.jp', password: playerPw, role: 'PLAYER', number: 7, position: '左翼手' } }),
    prisma.user.create({ data: { name: '小林 悠', email: 'kobayashi@blitz.jp', password: playerPw, role: 'PLAYER', number: 8, position: '中堅手' } }),
    prisma.user.create({ data: { name: '加藤 颯', email: 'kato@blitz.jp', password: playerPw, role: 'PLAYER', number: 9, position: '右翼手' } }),
    prisma.user.create({ data: { name: '松本 尚', email: 'matsumoto@blitz.jp', password: playerPw, role: 'PLAYER', number: 10, position: 'ピッチャー' } }),
    prisma.user.create({ data: { name: '井上 聡', email: 'inoue@blitz.jp', password: playerPw, role: 'PLAYER', number: 11, position: '外野手' } }),
    prisma.user.create({ data: { name: '木村 誉', email: 'kimura@blitz.jp', password: playerPw, role: 'PLAYER', number: 12, position: '内野手' } }),
  ])

  console.log(`Created ${players.length} players`)

  // Past schedules with results
  const pastGames = [
    { daysAgo: 60, opponent: 'ライオンズ', location: '中央公園球場', ourScore: 7, opponentScore: 3 },
    { daysAgo: 53, opponent: 'タイガース', location: '西部グラウンド', ourScore: 4, opponentScore: 6 },
    { daysAgo: 46, opponent: 'ドラゴンズ', location: '市営球場', ourScore: 5, opponentScore: 5 },
    { daysAgo: 39, opponent: 'スワローズ', location: '中央公園球場', ourScore: 8, opponentScore: 2 },
    { daysAgo: 32, opponent: 'ベイスターズ', location: '南部グラウンド', ourScore: 3, opponentScore: 4 },
    { daysAgo: 25, opponent: 'カープ', location: '中央公園球場', ourScore: 6, opponentScore: 1 },
    { daysAgo: 18, opponent: 'ファイターズ', location: '東部球場', ourScore: 9, opponentScore: 4 },
    { daysAgo: 11, opponent: 'マリーンズ', location: '中央公園球場', ourScore: 2, opponentScore: 3 },
    { daysAgo: 4, opponent: 'ホークス', location: '西部グラウンド', ourScore: 7, opponentScore: 0 },
  ]

  for (const g of pastGames) {
    const date = new Date()
    date.setDate(date.getDate() - g.daysAgo)
    date.setHours(10, 0, 0, 0)

    const result = g.ourScore > g.opponentScore ? 'WIN' as const : g.ourScore < g.opponentScore ? 'LOSE' as const : 'DRAW' as const

    const schedule = await prisma.schedule.create({
      data: {
        date,
        opponent: g.opponent,
        location: g.location,
        type: 'REGULAR',
        meetTime: '8:30',
        startTime: '10:00',
      },
    })

    const game = await prisma.game.create({
      data: { scheduleId: schedule.id, ourScore: g.ourScore, opponentScore: g.opponentScore, result },
    })

    // Random stats for each player
    for (const player of players.slice(0, 9)) {
      const atBats = Math.floor(Math.random() * 3) + 2
      const hits = Math.floor(Math.random() * (atBats + 1))
      await prisma.gameStat.create({
        data: {
          userId: player.id,
          gameId: game.id,
          atBats,
          hits,
          rbi: Math.floor(Math.random() * 3),
          runs: Math.floor(Math.random() * 2),
          walks: Math.floor(Math.random() * 2),
        },
      })
    }

    // Attendance
    for (const player of players) {
      const statuses = ['ATTENDING', 'ATTENDING', 'ATTENDING', 'ATTENDING', 'ATTENDING', 'ABSENT'] as const
      await prisma.attendance.create({
        data: {
          userId: player.id,
          scheduleId: schedule.id,
          status: statuses[Math.floor(Math.random() * statuses.length)],
        },
      })
    }
  }

  // Upcoming schedules
  const upcomingGames = [
    { daysAhead: 7, opponent: 'イーグルス', location: '中央公園球場', type: 'REGULAR' as const },
    { daysAhead: 14, opponent: 'バファローズ', location: '市営球場', type: 'REGULAR' as const },
    { daysAhead: 21, opponent: 'ジャイアンツ', location: '東部球場', type: 'TOURNAMENT' as const },
    { daysAhead: 28, opponent: 'オリオンズ', location: '中央公園球場', type: 'REGULAR' as const },
  ]

  for (const g of upcomingGames) {
    const date = new Date()
    date.setDate(date.getDate() + g.daysAhead)
    date.setHours(10, 0, 0, 0)

    await prisma.schedule.create({
      data: {
        date,
        opponent: g.opponent,
        location: g.location,
        type: g.type,
        meetTime: '8:30',
        startTime: '10:00',
      },
    })
  }

  console.log('Seed completed!')
  console.log('Admin login: admin@blitz.jp / admin123')
  console.log('Player login: sato@blitz.jp / player123')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
