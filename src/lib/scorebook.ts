/**
 * Scorebook notation library.
 *
 * Code format: <result>[<rbi>][s]
 *   O  = アウト（三振/ゴロ/フライ統合）
 *   1  = 単打   2  = 二塁打  3  = 三塁打  4  = 本塁打
 *   B  = 四球   D  = 死球   S  = 犠打    X  = 犠飛
 *   K/G/F = 旧コード（後方互換・引き続き解析可能）
 *   Digit suffix = 打点 (e.g. "12" = 単打2打点)
 *   "s" suffix   = 盗塁  (e.g. "1s" = 単打盗塁, "12s" = 単打2打点盗塁)
 *   HR with no digit defaults to 1 RBI (e.g. "4" = solo HR)
 *
 *   Multi-AB per inning: comma-separated codes in one cell (e.g. "1,O")
 */

export interface BatterSub {
  fromInning: number
  userId:     string
  position?:  string
  cells:      Record<number, string>
}

export interface BatterSlot {
  order:      number
  userId:     string
  position?:  string   // 前半守備位置
  position2?: string   // 後半守備位置（同一選手でポジション変更がある場合）
  cells:      Record<number, string>  // 1-indexed inning → code string (comma-separated for 2+ ABs)
  subs?:      BatterSub[]
}

export interface PitcherSlot {
  userId:       string
  innings:      string   // e.g. "5" | "5.1" | "5.2"
  runs:         number   // 失点
  earnedRuns?:  number   // 自責点
  hitsAllowed?: number   // 被安打
  strikeouts?:  number   // 奪三振
  walks?:       number   // 与四球
  pitches?:     number   // 投球数
  decision:     string   // '' | '勝' | '負' | 'S' | 'H'
}

export interface ScoreBookData {
  innings:        number
  batters:        BatterSlot[]
  pitchers:       PitcherSlot[]
  ourScore?:      number | null
  opponentScore?: number | null
  inningScores?:  { our: (number | null)[]; opponent: (number | null)[] }
  note?:          string
  oppFirst?:      boolean
}

export interface BatterStats {
  pa:        number
  ab:        number
  h:         number
  doubles:   number
  triples:   number
  homeRuns:  number
  rbi:       number
  sb:        number
  bb:        number
  hbp:       number
  sac:       number
  sf:        number
  k:         number
}

export const ZERO_STATS: BatterStats = {
  pa: 0, ab: 0, h: 0, doubles: 0, triples: 0, homeRuns: 0,
  rbi: 0, sb: 0, bb: 0, hbp: 0, sac: 0, sf: 0, k: 0,
}

/** Parse a single at-bat code into a stats delta. Returns null for empty/invalid input. */
export function parseCode(raw: string): BatterStats | null {
  const code = raw.trim().toUpperCase()
  if (!code) return null
  // O = generic out (アウト); K/G/F kept for backward compat
  // rest には数字と S が任意順序で現れる ("21S" も "2S1" も許容)
  const m = code.match(/^([KGFO1234BDSX])([0-9S]*)$/)
  if (!m) return null

  const r          = m[1]
  const rest       = m[2] ?? ''
  const digitMatch = rest.match(/[0-9]/)
  const rbi        = digitMatch ? parseInt(digitMatch[0]) : (r === '4' ? 1 : 0)
  const sb         = rest.includes('S') ? 1 : 0

  return {
    pa:       1,
    ab:       'KGFO1234'.includes(r) ? 1 : 0,  // O はアウト扱い（打数カウント）
    h:        '1234'.includes(r)     ? 1 : 0,
    doubles:  r === '2' ? 1 : 0,
    triples:  r === '3' ? 1 : 0,
    homeRuns: r === '4' ? 1 : 0,
    rbi,
    sb,
    bb:  r === 'B' ? 1 : 0,
    hbp: r === 'D' ? 1 : 0,
    sac: r === 'S' ? 1 : 0,
    sf:  r === 'X' ? 1 : 0,
    k:   r === 'K' ? 1 : 0,  // 旧K コードのみ三振カウント（後方互換）
  }
}

/** Aggregate all cells for one batter into total stats. */
export function calcBatterStats(cells: Record<number, string>): BatterStats {
  const stats = { ...ZERO_STATS }
  for (const raw of Object.values(cells)) {
    // comma-separated: support multiple ABs per inning (e.g. "1,O")
    for (const part of raw.split(',')) {
      const s = parseCode(part.trim())
      if (!s) continue
      for (const key of Object.keys(ZERO_STATS) as (keyof BatterStats)[]) {
        stats[key] += s[key]
      }
    }
  }
  return stats
}

/**
 * Convert a single at-bat code to a Japanese label.
 * 例: "1" → "安", "12" → "安(打点2)", "2" → "二安", "4" → "本(打点1)",
 *     "1s" → "安・盗", "O" → "凡", "B" → "四球"
 * 無効/空コードは空文字を返す。
 */
export function codeToJa(raw: string): string {
  const code = raw.trim().toUpperCase()
  if (!code) return ''
  const m = code.match(/^([KGFO1234BDSX])([0-9S]*)$/)
  if (!m) return ''
  const r          = m[1]
  const rest       = m[2] ?? ''
  const digitMatch = rest.match(/[0-9]/)
  const rbi        = digitMatch ? parseInt(digitMatch[0]) : (r === '4' ? 1 : 0)
  const stolen     = rest.includes('S')

  const base: Record<string, string> = {
    O: '凡', K: '三振', G: 'ゴロ', F: '飛',
    '1': '安', '2': '二安', '3': '三安', '4': '本',
    B: '四球', D: '死球', S: '犠打', X: '犠飛',
  }
  let label = base[r] ?? r
  if (rbi > 0) label += `(打点${rbi})`
  if (stolen) label += '・盗'
  return label
}

/**
 * 1セル（カンマ区切りで複数打席を含む）を日本語ラベル配列に変換。
 * 例: "1,O" → ["安", "凡"]
 */
export function cellToJaParts(raw: string): string[] {
  return raw.split(',').map(p => codeToJa(p)).filter(Boolean)
}

/** Return a Tailwind text color class for a given cell code (for live coloring). */
export function cellColor(code: string): string {
  const c = code.trim().toUpperCase()[0]
  if (!c) return ''
  if ('1234'.includes(c)) return 'text-[#22c55e]'     // green: hits
  if (c === 'B' || c === 'D') return 'text-[#60a5fa]'  // blue: walk/HBP
  if (c === 'S' || c === 'X') return 'text-[#fbbf24]'  // amber: sacrifice
  return 'text-[#94a3b8]'                               // gray: O, K, G, F (outs)
}
