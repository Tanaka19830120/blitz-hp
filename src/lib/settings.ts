import { prisma } from './prisma'

export const GAME_TYPE_KEYS = ['REGULAR', 'PRACTICE', 'TOURNAMENT', 'EVENT'] as const
export type GameTypeKey = (typeof GAME_TYPE_KEYS)[number]

export const GAME_TYPE_DEFAULT_LABELS: Record<GameTypeKey, string> = {
  REGULAR:    '公式戦',
  PRACTICE:   '練習試合',
  TOURNAMENT: 'トーナメント',
  EVENT:      'イベント',
}

export async function getGameTypeLabels(): Promise<Record<GameTypeKey, string>> {
  const result = { ...GAME_TYPE_DEFAULT_LABELS }
  try {
    const settings = await prisma.setting.findMany({
      where: { key: { startsWith: 'gameTypeLabel_' } },
    })
    for (const s of settings) {
      const type = s.key.replace('gameTypeLabel_', '') as GameTypeKey
      if (GAME_TYPE_KEYS.includes(type)) result[type] = s.value
    }
  } catch {}
  return result
}

export async function getMasterList(key: string): Promise<string[]> {
  try {
    const s = await prisma.setting.findUnique({ where: { key } })
    if (!s?.value) return []
    return JSON.parse(s.value) as string[]
  } catch {
    return []
  }
}

export async function saveMasterList(key: string, list: string[]): Promise<void> {
  await prisma.setting.upsert({
    where:  { key },
    create: { key, value: JSON.stringify(list) },
    update: { value: JSON.stringify(list) },
  })
}

// ─── Profile helpers ────────────────────────────────────────────

export interface KVPair { label: string; value: string }
export interface LeagueRecord { year: string; result: string }

export const PROFILE_DEFAULTS = {
  about: [
    'BLITZは兵庫県加古川・加古郡・明石エリアを拠点とする混合ソフトボールチームです。SDリーグに所属し、毎年20試合以上を戦っています。',
    '試合には女性2〜5名が参加し、チームワークを大切にしながら活動しています。勝利を目指しながらも、楽しく仲間と切磋琢磨することを大切にしています。',
    '試合だけでなく、バーベキューやビアガーデン、バス旅行などチームや家族・友人を含めた交流イベントも積極的に行っています。',
  ].join('\n\n'),

  info: [
    'チーム名: BLITZ（ブリッツ）',
    '種目: ソフトボール（混合）',
    '所属リーグ: SD リーグ',
    '活動地域: 兵庫県（加古川・加古郡・明石）',
    '活動日: 土・日曜日（月2回程度）',
    '年間試合数: 20試合以上',
  ].join('\n'),

  grounds: [
    '公式戦: 住友ゴム グラウンド（岩岡・神戸）',
    '練習試合: 成岡グラウンド（稲美町・加古郡）',
    '遠征: 姫路〜神戸エリアを中心に',
  ].join('\n'),

  retiredNumbers: '#6, #18',

  records: [
    '2018: 4位',
    '2017: 6位',
    '2016: 2位',
    '2015: 5位',
  ].join('\n'),
}

/** "ラベル: 値" 形式のテキストを KVPair[] にパース */
export function parseKVLines(text: string): KVPair[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const idx = line.indexOf(': ')
      if (idx === -1) return { label: line, value: '' }
      return { label: line.slice(0, idx).trim(), value: line.slice(idx + 2).trim() }
    })
}

/** "年: 結果" 形式のテキストを LeagueRecord[] にパース */
export function parseRecordLines(text: string): LeagueRecord[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const idx = line.indexOf(': ')
      if (idx === -1) return { year: line, result: '' }
      return { year: line.slice(0, idx).trim(), result: line.slice(idx + 2).trim() }
    })
}

/**
 * key は "profile_about" など "profile_" プレフィックス付きで渡す。
 * フォールバックは PROFILE_DEFAULTS の同名キー（プレフィックスなし）から引く。
 */
export async function getProfileSetting(key: string): Promise<string> {
  const shortKey = key.replace(/^profile_/, '') as keyof typeof PROFILE_DEFAULTS
  const fallback = PROFILE_DEFAULTS[shortKey] ?? ''
  try {
    const s = await prisma.setting.findUnique({ where: { key } })
    return s?.value ?? fallback
  } catch {
    return fallback
  }
}
