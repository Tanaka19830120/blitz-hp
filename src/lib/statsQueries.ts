import { prisma } from '@/lib/prisma'

export interface PlayerStats {
  id: string
  name: string
  number: number | null
  position: string | null
  games: number
  plateAppearances: number
  atBats: number
  hits: number
  doubles: number
  triples: number
  homeRuns: number
  rbi: number
  runs: number
  stolenBases: number
  walks: number
  strikeouts: number
  hitByPitch: number
  sacrificeBunts: number
  sacrificeFlies: number
  avg: string
  obp: string
  slg: string
}

function yearFilter(year?: number) {
  if (!year) return undefined
  return { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31T23:59:59`) }
}

/** 打撃成績を取得（year 未指定なら通算）。打率降順でソート。
 *  includeAlumni=true のとき元メンバーも含む（歴代モード）
 */
export async function getBattingStats(year?: number, includeAlumni = false): Promise<PlayerStats[]> {
  const dateFilter = yearFilter(year)

  const players = await prisma.user.findMany({
    where: includeAlumni
      ? { isGuest: false }
      : { isGuest: false, email: { endsWith: '@b' } },
    include: {
      gameStats: {
        include: { game: { include: { schedule: { select: { date: true } } } } },
        ...(dateFilter ? { where: { game: { schedule: { date: dateFilter } } } } : {}),
      },
    },
    orderBy: { name: 'asc' },
  })

  return players
    .map((p) => {
      const stats = p.gameStats
      const pa = stats.reduce((s, g) => s + g.plateAppearances, 0)
      const ab = stats.reduce((s, g) => s + g.atBats, 0)
      const h = stats.reduce((s, g) => s + g.hits, 0)
      const d = stats.reduce((s, g) => s + g.doubles, 0)
      const t = stats.reduce((s, g) => s + g.triples, 0)
      const hr = stats.reduce((s, g) => s + g.homeRuns, 0)
      const bb = stats.reduce((s, g) => s + g.walks, 0)
      const hbp = stats.reduce((s, g) => s + g.hitByPitch, 0)
      const sf = stats.reduce((s, g) => s + g.sacrificeFlies, 0)

      const obpDenom = ab + bb + hbp + sf
      const obpVal = obpDenom > 0 ? (h + bb + hbp) / obpDenom : 0
      const singles = h - d - t - hr
      const slgVal = ab > 0 ? (singles + 2 * d + 3 * t + 4 * hr) / ab : 0

      return {
        id: p.id,
        name: p.name,
        number: p.number,
        position: p.position,
        games: stats.length,
        plateAppearances: pa,
        atBats: ab,
        hits: h,
        doubles: d,
        triples: t,
        homeRuns: hr,
        rbi: stats.reduce((s, g) => s + g.rbi, 0),
        runs: stats.reduce((s, g) => s + g.runs, 0),
        stolenBases: stats.reduce((s, g) => s + g.stolenBases, 0),
        walks: bb,
        strikeouts: stats.reduce((s, g) => s + g.strikeouts, 0),
        hitByPitch: hbp,
        sacrificeBunts: stats.reduce((s, g) => s + g.sacrificeBunts, 0),
        sacrificeFlies: sf,
        avg: ab > 0 ? (h / ab).toFixed(3).replace('0.', '.') : '---',
        obp: obpDenom > 0 ? obpVal.toFixed(3).replace('0.', '.') : '---',
        slg: ab > 0 ? slgVal.toFixed(3).replace('0.', '.') : '---',
      }
    })
    .filter((p) => p.games > 0)
    .sort((a, b) => {
      const avgA = a.atBats > 0 ? a.hits / a.atBats : 0
      const avgB = b.atBats > 0 ? b.hits / b.atBats : 0
      return avgB - avgA
    })
}

export type TrendStat = 'avg' | 'hits' | 'rbi' | 'homeRuns'

/** 全選手の試合別累積成績を日付順で返す（グラフ用） */
export async function getPlayerTrends(
  playerIds: string[],
  year?: number,
  stat: TrendStat = 'avg',
  includeAlumni = false,
): Promise<{ id: string; name: string; number: number | null; points: { date: string; value: number }[] }[]> {
  if (playerIds.length === 0) return []
  const dateFilter = year
    ? { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31T23:59:59`) }
    : undefined

  const players = await prisma.user.findMany({
    where: {
      id: { in: playerIds },
      ...(includeAlumni ? { isGuest: false } : { isGuest: false, email: { endsWith: '@b' } }),
    },
    select: {
      id: true, name: true, number: true,
      gameStats: {
        where: dateFilter ? { game: { schedule: { date: dateFilter } } } : {},
        include: { game: { include: { schedule: { select: { date: true } } } } },
        orderBy: { game: { schedule: { date: 'asc' } } },
      },
    },
  })

  return players.map(p => {
    let cumAb = 0, cumH = 0, cumVal = 0

    // 同じ日の複数試合を累積して、その日の最終値だけを1点として使う
    const byDate = new Map<string, number>()
    for (const gs of p.gameStats) {
      const date = new Date(gs.game.schedule.date).toISOString().slice(0, 10)
      cumAb += gs.atBats
      cumH  += gs.hits
      if      (stat === 'avg')      cumVal = cumAb > 0 ? cumH / cumAb : 0
      else if (stat === 'hits')     cumVal += gs.hits
      else if (stat === 'rbi')      cumVal += gs.rbi
      else if (stat === 'homeRuns') cumVal += gs.homeRuns
      byDate.set(date, cumVal)  // 同じ日は上書き → その日の最終値のみ残る
    }

    const points: { date: string; value: number; dashed?: boolean }[] =
      [...byDate.entries()].map(([date, value]) => ({ date, value }))

    return { id: p.id, name: p.name, number: p.number, points }
  }).filter(p => p.points.length >= 2)
}

/** 成績データが存在する年度の一覧（降順） */
export async function getAvailableYears(): Promise<number[]> {
  const schedules = await prisma.schedule.findMany({
    where: { game: { isNot: null } },
    select: { date: true },
    orderBy: { date: 'asc' },
  })
  const years = [...new Set(schedules.map((s) => new Date(s.date).getFullYear()))]
  return years.sort((a, b) => b - a)
}

/** 対象期間の試合数 */
export async function getTotalGames(year?: number): Promise<number> {
  const dateFilter = yearFilter(year)
  return prisma.game.count({
    where: dateFilter ? { schedule: { date: dateFilter } } : undefined,
  })
}

/** 1試合あたりの規定打席（設定値・デフォルト2.0） */
export async function getQualPaPerGame(): Promise<number> {
  try {
    const s = await prisma.setting.findUnique({ where: { key: 'qualPaPerGame' } })
    const v = s ? parseFloat(s.value) : NaN
    return isNaN(v) || v <= 0 ? 2.0 : v
  } catch {
    return 2.0
  }
}

/** 1試合あたりの規定投球回（設定値・デフォルト1.0） */
export async function getQualIpPerGame(): Promise<number> {
  try {
    const s = await prisma.setting.findUnique({ where: { key: 'qualIpPerGame' } })
    const v = s ? parseFloat(s.value) : NaN
    return isNaN(v) || v <= 0 ? 1.0 : v
  } catch {
    return 1.0
  }
}
