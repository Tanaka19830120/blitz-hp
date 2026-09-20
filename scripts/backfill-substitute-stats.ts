import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import {
  calcBatterStats,
  splitBatterAppearances,
  ZERO_STATS,
  type BatterStats,
  type ScoreBookData,
} from '../src/lib/scorebook'

const apply = process.argv.includes('--apply')

type DesiredStat = {
  userId: string
  battingOrder: number
  position: string | null
  stats: BatterStats
}

function desiredStats(data: ScoreBookData): DesiredStat[] {
  const byUser = new Map<string, DesiredStat>()

  for (const batter of data.batters) {
    for (const appearance of splitBatterAppearances(batter)) {
      if (!appearance.userId) continue
      const stats = calcBatterStats(appearance.cells)
      if (stats.pa === 0) continue
      const current = byUser.get(appearance.userId) ?? {
        userId: appearance.userId,
        battingOrder: appearance.order,
        position: appearance.position || null,
        stats: { ...ZERO_STATS },
      }
      for (const key of Object.keys(ZERO_STATS) as (keyof BatterStats)[]) {
        current.stats[key] += stats[key]
      }
      byUser.set(appearance.userId, current)
    }
  }

  return [...byUser.values()]
}

async function main() {
  const games = await prisma.game.findMany({
    where: { scorebook: { not: null } },
    include: {
      schedule: { select: { date: true } },
      stats: true,
    },
    orderBy: { schedule: { date: 'asc' } },
  })

  let gamesWithSubs = 0
  let gamesNeedingUpdate = 0
  let substituteRows = 0
  let legacySubCellGames = 0

  for (const game of games) {
    let data: ScoreBookData
    try {
      data = JSON.parse(game.scorebook!) as ScoreBookData
    } catch {
      console.warn(`SKIP invalid scorebook: ${game.id}`)
      continue
    }

    const subs = data.batters.flatMap(b => b.subs ?? []).filter(s => s.userId)
    if (subs.length === 0) continue
    gamesWithSubs++
    substituteRows += subs.length
    if (subs.some(s => Object.keys(s.cells ?? {}).length > 0)) legacySubCellGames++

    const desired = desiredStats(data)
    const currentByUser = new Map(game.stats.map(s => [s.userId, s]))
    const differs = desired.length !== game.stats.length || desired.some(d => {
      const c = currentByUser.get(d.userId)
      return !c
        || c.battingOrder !== d.battingOrder
        || c.position !== d.position
        || c.plateAppearances !== d.stats.pa
        || c.atBats !== d.stats.ab
        || c.hits !== d.stats.h
        || c.doubles !== d.stats.doubles
        || c.triples !== d.stats.triples
        || c.homeRuns !== d.stats.homeRuns
        || c.rbi !== d.stats.rbi
        || c.stolenBases !== d.stats.sb
        || c.walks !== d.stats.bb
        || c.strikeouts !== d.stats.k
        || c.hitByPitch !== d.stats.hbp
        || c.sacrificeBunts !== d.stats.sac
        || c.sacrificeFlies !== d.stats.sf
    })

    if (!differs) continue
    gamesNeedingUpdate++
    console.log(`${apply ? 'UPDATE' : 'DRY-RUN'} ${game.schedule.date.toISOString().slice(0, 10)}: ${game.stats.length} -> ${desired.length} player rows`)

    if (apply) {
      await prisma.$transaction(async tx => {
        await tx.gameStat.deleteMany({ where: { gameId: game.id } })
        if (desired.length > 0) {
          await tx.gameStat.createMany({
            data: desired.map(d => ({
              gameId: game.id,
              userId: d.userId,
              battingOrder: d.battingOrder,
              position: d.position,
              plateAppearances: d.stats.pa,
              atBats: d.stats.ab,
              hits: d.stats.h,
              doubles: d.stats.doubles,
              triples: d.stats.triples,
              homeRuns: d.stats.homeRuns,
              rbi: d.stats.rbi,
              stolenBases: d.stats.sb,
              walks: d.stats.bb,
              strikeouts: d.stats.k,
              hitByPitch: d.stats.hbp,
              sacrificeBunts: d.stats.sac,
              sacrificeFlies: d.stats.sf,
              runs: 0,
            })),
          })
        }
      })
    }
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    scorebookGames: games.length,
    gamesWithSubs,
    gamesNeedingUpdate,
    substituteRows,
    legacySubCellGames,
  }, null, 2))
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
