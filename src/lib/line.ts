/**
 * LINE Messaging API — グループへのプッシュ送信ユーティリティ
 * 環境変数: LINE_CHANNEL_ACCESS_TOKEN, LINE_GROUP_ID
 * LINE_GROUP_ID が未設定の場合は DB の detectedLineGroupId を使用
 */

import { prisma } from './prisma'
import type { ScoreBookData } from './scorebook'
import { calcBatterStats } from './scorebook'
import { mapsUrl } from './maps'

const LINE_PUSH_API = 'https://api.line.me/v2/bot/message/push'

async function resolveLineCredentials(): Promise<{ token: string; groupId: string } | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  // 優先順: DB(teamLineGroupId) → 環境変数(LINE_GROUP_ID) → DB(detectedLineGroupId)
  const groupId = await prisma.setting.findUnique({ where: { key: 'teamLineGroupId' } })
    .then(s => s?.value ?? '')
    .catch(() => '')
    || process.env.LINE_GROUP_ID
    || await prisma.setting.findUnique({ where: { key: 'detectedLineGroupId' } }).then(s => s?.value ?? '').catch(() => '')
  if (!token || !groupId) return null
  return { token, groupId }
}

export async function sendToLineGroup(text: string): Promise<{ ok: boolean; error?: string }> {
  return sendTextsToLineGroup([text])
}

/** 管理者専用グループへ送信（adminLineGroupId が未設定なら通常グループへ送信） */
export async function sendToAdminLineGroup(text: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) return { ok: false, error: 'LINE_CHANNEL_ACCESS_TOKEN が未設定です' }

  // adminLineGroupId を優先、なければ通常グループへフォールバック
  const adminGroupId = await prisma.setting
    .findUnique({ where: { key: 'adminLineGroupId' } })
    .then(s => s?.value ?? '')
    .catch(() => '')

  if (adminGroupId) {
    try {
      const res = await fetch(LINE_PUSH_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          to: adminGroupId,
          messages: [{ type: 'text', text }],
        }),
      })
      return res.ok ? { ok: true } : { ok: false, error: `LINE API error: ${res.status}` }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  }

  // 管理者グループ未設定 → 通常グループへ送信
  return sendToLineGroup(text)
}

/** 複数テキストを1回のプッシュで送信（LINE API 上限: 5メッセージ/回） */
export async function sendTextsToLineGroup(texts: string[]): Promise<{ ok: boolean; error?: string }> {
  const creds = await resolveLineCredentials()
  if (!creds) return { ok: false, error: 'LINE_CHANNEL_ACCESS_TOKEN または LINE_GROUP_ID が未設定です' }

  try {
    // LINE API は1リクエスト最大5メッセージ → 5件ずつ送信
    for (let i = 0; i < texts.length; i += 5) {
      const chunk = texts.slice(i, i + 5)
      const res = await fetch(LINE_PUSH_API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: creds.groupId,
          messages: chunk.map(text => ({ type: 'text', text })),
        }),
      })
      if (!res.ok) {
        const body = await res.text()
        return { ok: false, error: `LINE API ${res.status}: ${body}` }
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/** 個別ユーザー（友だち追加済み）へ順次プッシュ送信 */
export async function pushToLineUsers(userIds: string[], text: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) return { ok: false, error: 'LINE_CHANNEL_ACCESS_TOKEN が未設定です' }
  if (userIds.length === 0) return { ok: false, error: '通知先が登録されていません' }
  try {
    for (const to of userIds) {
      const res = await fetch(LINE_PUSH_API, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
      })
      if (!res.ok) return { ok: false, error: `LINE API ${res.status}: ${await res.text()}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

/** LINE ユーザーの表示名を取得 */
export async function getLineProfileName(userId: string): Promise<string | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) return null
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const j = await res.json()
    return (j.displayName as string) ?? null
  } catch {
    return null
  }
}

/** reply token で返信 */
export async function replyLine(replyToken: string, text: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) return
  try {
    await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
    })
  } catch { /* ignore */ }
}

// ─── メッセージ整形 ────────────────────────────

function fmt(date: Date) {
  return new Date(date).toLocaleDateString('ja-JP', {
    month: 'long', day: 'numeric', weekday: 'short',
  })
}

function daysUntil(date: Date) {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000)
}

/** 出欠リマインド（単体 or 複数試合対応） */
export function buildReminder(schedules: {
  date: Date
  opponent: string
  location: string
  meetTime?: string | null
  startTime?: string | null
  note?: string | null
} | {
  date: Date
  opponent: string
  location: string
  meetTime?: string | null
  startTime?: string | null
  note?: string | null
}[]): string {
  const list = Array.isArray(schedules) ? schedules : [schedules]
  const primary = list[0]
  const days = daysUntil(primary.date)
  const when = days <= 0 ? '本日' : days === 1 ? '明日' : `${days}日後`

  // 場所・集合時間を目立つブロックに（単体: 場所も含む / 複数: meetTime のみ）
  const infoBlock: (string | null)[] = list.length === 1
    ? [
        `━━━━━━━━━━━━`,
        `📍 ${primary.location}`,
        `🗺 地図：${mapsUrl(primary.location)}`,
        primary.meetTime  ? `🔔 集合：${primary.meetTime}`     : null,
        primary.startTime ? `▶ 試合開始：${primary.startTime}` : null,
        `━━━━━━━━━━━━`,
      ]
    : primary.meetTime
      ? [
          `━━━━━━━━━━━━`,
          `🔔 集合：${primary.meetTime}`,
          `━━━━━━━━━━━━`,
        ]
      : []

  const gameLines = list.length === 1
    ? [`⚾ vs ${primary.opponent}`]
    : list.flatMap((s, i) => [
        `⚾ 第${i + 1}試合 vs ${s.opponent}`,
        `📍 ${s.location}${s.startTime ? ` ▶ ${s.startTime}` : ''}`,
        `🗺 地図：${mapsUrl(s.location)}`,
      ])

  // 備考（メモ）— いずれかの試合に note があれば表示
  const note = list.map(s => s.note).find(n => n && n.trim())
  const noteBlock = note
    ? ['', `📝 ${note.trim()}`]
    : []

  return [
    `📅【BLITZ】出欠登録のお願い`,
    ``,
    `${when}（${fmt(primary.date)}）`,
    ...infoBlock,
    ``,
    ...gameLines,
    ...noteBlock,
    ``,
    `出欠の登録をお願いします！`,
    `👉 https://blitz-hp.vercel.app/schedule`,
  ].filter(Boolean).join('\n')
}

/** 出欠集計（単体 or 複数試合対応）
 *  members を渡すと、回答していない現メンバーを「未回答」として全員表示する。
 */
export function buildAttendanceSummary(
  schedule: { date: Date; opponent: string } | { date: Date; opponent: string }[],
  attendances: { status: string; userId: string; guestCount: number; user: { name: string } }[],
  members?: { id: string; name: string }[]
): string {
  // 複数試合の場合 opponent を結合
  const primary = Array.isArray(schedule) ? schedule[0] : schedule
  const opponentLabel = Array.isArray(schedule)
    ? schedule.map((s, i) => `第${i + 1}試合 vs ${s.opponent}`).join(' / ')
    : `vs ${schedule.opponent}`
  const attendingRows = attendances.filter(a => a.status === 'ATTENDING')
  const attending = attendingRows.map(a => a.user.name)
  const guests = attendingRows.flatMap(a =>
    Array.from({ length: a.guestCount }, () => a.user.name)
  )
  const guestLabels = guests.map((ownerName, index) => `助っ人${index + 1}（${ownerName}）`)
  const allAttending = [...attending, ...guestLabels]
  const absent    = attendances.filter(a => a.status === 'ABSENT').map(a => a.user.name)
  const maybe     = attendances.filter(a => a.status === 'MAYBE').map(a => a.user.name)

  // 未回答 = 現メンバーのうち、参加/欠席/未定 を回答していない人（未登録も含む）
  const respondedIds = new Set(
    attendances.filter(a => ['ATTENDING', 'ABSENT', 'MAYBE'].includes(a.status)).map(a => a.userId)
  )
  const pending = (members ?? [])
    .filter(m => !respondedIds.has(m.id))
    .map(m => m.name)

  return [
    `📋【BLITZ】出欠状況`,
    `${fmt(primary.date)} ${opponentLabel}`,
    `━━━━━━━━━━━━`,
    `✅ 参加 ${allAttending.length}名${guests.length > 0 ? `（助っ人${guests.length}名）` : ''}`,
    allAttending.length > 0 ? allAttending.join('、') : '（なし）',
    absent.length > 0    ? `\n❌ 欠席 ${absent.length}名\n${absent.join('、')}` : null,
    maybe.length > 0     ? `\n🤔 未定 ${maybe.length}名\n${maybe.join('、')}` : null,
    pending.length > 0   ? `\n⏳ 未回答 ${pending.length}名\n${pending.join('、')}` : null,
    `━━━━━━━━━━━━`,
  ].filter(Boolean).join('\n')
}

/** スタメン */
export function buildLineup(
  schedule: {
    date: Date
    opponent: string
    location: string
    meetTime?: string | null
    startTime?: string | null
  },
  lineups: {
    battingOrder: number | null
    position: string | null
    isDH: boolean
    user: { name: string; number: number | null }
  }[],
  note?: string
): string {
  const batters = [...lineups]
    .filter(l => l.battingOrder != null)
    .sort((a, b) => (a.battingOrder ?? 99) - (b.battingOrder ?? 99))

  // FP = battingOrder なし・position あり
  const fpPlayers = lineups.filter(l => l.battingOrder == null && l.position)

  return [
    `📋【BLITZ】スタメン`,
    `${fmt(schedule.date)} vs ${schedule.opponent}`,
    `━━━━━━━━━━━━`,
    `📍 ${schedule.location}`,
    `🗺 地図：${mapsUrl(schedule.location)}`,
    schedule.meetTime  ? `🔔 集合：${schedule.meetTime}`    : null,
    schedule.startTime ? `▶ 試合開始：${schedule.startTime}` : null,
    `━━━━━━━━━━━━`,
    ...batters.map(l => {
      const pos = l.position ?? ''
      // DP は「打つだけ」と注記
      const posLabel = pos === 'DP' ? 'DP(打つだけ)' : pos
      return `${l.battingOrder}番 ${posLabel ? posLabel + ' ' : ''}${l.user.name}`
    }),
    fpPlayers.length > 0
      ? `━━━━━━━━━━━━\nFP（守るだけ）: ${fpPlayers.map(l => `${l.user.name}(${l.position})`).join('、')}`
      : null,
    note ? `━━━━━━━━━━━━\n📝 ${note}` : null,
  ].filter(Boolean).join('\n')
}

/** スタメン（前半/後半形式） */
export function buildLineupFromJson(
  schedule: {
    date: Date; opponent: string; location: string
    meetTime?: string | null; startTime?: string | null
  },
  data: {
    slots:        Array<{ first: { playerId: string; position: string }; second: { playerId: string; position: string } }>
    fpSlots:      Array<{ playerId: string; position: string }>
    umpires:  Array<{ playerId: string; half: string }>
    note:     string
  },
  players: Array<{ id: string; name: string; number: number | null }>
): string {
  // 助っ人（固定4枠）を追加
  const guestPlayers = [
    { id: '__guest_1', name: '助っ人1', number: null },
    { id: '__guest_2', name: '助っ人2', number: null },
    { id: '__guest_3', name: '助っ人3', number: null },
    { id: '__guest_4', name: '助っ人4', number: null },
  ]
  const pm = new Map([...players, ...guestPlayers].map(p => [p.id, p]))

  const lines: (string | null)[] = [
    `📋【BLITZ】スタメン`,
    `${fmt(schedule.date)} vs ${schedule.opponent}`,
    `━━━━━━━━━━━━`,
    `📍 ${schedule.location}`,
    `🗺 地図：${mapsUrl(schedule.location)}`,
    schedule.meetTime  ? `🔔 集合：${schedule.meetTime}`    : null,
    schedule.startTime ? `▶ 試合開始：${schedule.startTime}` : null,
    `━━━━━━━━━━━━`,
  ]

  for (let i = 0; i < data.slots.length; i++) {
    const s  = data.slots[i]
    const p1 = pm.get(s.first.playerId)
    if (!p1) continue
    const pos1 = s.first.position === 'DP' ? 'DP(打)' : s.first.position
    let line = `${i + 1}番 ${pos1 ? pos1 + ' ' : ''}${p1.name}`

    // '─' = 意図的に守備なし（前半ポジションを継承しない）
    const secondPos = s.second.position === '─' ? '' : s.second.position

    // 後半で別の選手に交代
    if (s.second.playerId && s.second.playerId !== s.first.playerId) {
      const p2   = pm.get(s.second.playerId)
      const pos2 = secondPos === 'DP' ? 'DP(打)' : secondPos
      if (p2) line += ` → 後半: ${pos2 ? pos2 + ' ' : ''}${p2.name}`
    } else {
      // 同じ選手：後半の守備が変わる場合のみ注記
      const samePlayer = !s.second.playerId || s.second.playerId === s.first.playerId
      if (samePlayer) {
        if (s.second.position === '─' && s.first.position && s.first.position !== 'DP') {
          // 後半は守備から退く
          line += ` → 後半: 守備なし`
        } else if (secondPos && secondPos !== s.first.position) {
          const pos2 = secondPos === 'DP' ? 'DP(打)' : secondPos
          line += ` → 後半: ${pos2}`
        }
      }
    }
    lines.push(line)
  }

  // FP
  const validFp = data.fpSlots.filter(f => f.playerId && f.position)
  if (validFp.length > 0) {
    const fpStr = validFp.map(f => {
      const p = pm.get(f.playerId)
      return p ? `${p.name}(${f.position})` : ''
    }).filter(Boolean).join('、')
    if (fpStr) lines.push(`━━━━━━━━━━━━\nFP（守るだけ）: ${fpStr}`)
  }

  // 審判（前半 → 後半 → 全試合 の順に固定）
  const halfOrder = ['前半', '後半', '全試合']
  const validUmpires = (data.umpires ?? [])
    .filter(u => u.playerId)
    .sort((a, b) => halfOrder.indexOf(a.half) - halfOrder.indexOf(b.half))
  if (validUmpires.length > 0) {
    const parts = validUmpires.map(u => {
      const name = pm.get(u.playerId)?.name ?? ''
      return name ? `${u.half}: ${name}` : ''
    }).filter(Boolean)
    if (parts.length > 0) lines.push(`━━━━━━━━━━━━\n⚖️ 審判 ${parts.join(' / ')}`)
  }

  if (data.note?.trim()) lines.push(`━━━━━━━━━━━━\n📝 ${data.note}`)

  return lines.filter(Boolean).join('\n')
}

/** 試合結果（オプションで打者・投手成績も含む） */
export function buildGameResult(
  schedule: { id: string; date: Date; opponent: string },
  game: { ourScore: number; opponentScore: number; result: string; note?: string | null },
  extras?: {
    scorebook:   ScoreBookData
    playerNames: Map<string, string>   // userId → name
  }
): string {
  const emoji =
    game.result === 'WIN'  ? '🏆 勝利！' :
    game.result === 'LOSE' ? '😔 敗戦' :
                             '🤝 引き分け'

  const lines: (string | null)[] = [
    `⚾【BLITZ】試合結果`,
    `${fmt(schedule.date)} vs ${schedule.opponent}`,
    `━━━━━━━━━━━━`,
    `BLITZ ${game.ourScore} ー ${game.opponentScore} ${schedule.opponent}`,
    `https://blitz-hp.vercel.app/results/${schedule.id}`,
    ``,
    emoji,
    game.note ? `\n${game.note}` : null,
  ]

  if (extras) {
    const { scorebook, playerNames } = extras

    // ── 打者成績 ──
    const hitters = scorebook.batters
      .filter(b => b.userId && playerNames.has(b.userId))
      .map(b => ({ name: playerNames.get(b.userId)!, order: b.order, stats: calcBatterStats(b.cells) }))
      .filter(h => h.stats.pa > 0)

    if (hitters.length > 0) {
      lines.push(``)
      lines.push(`━━━━━━━━━━━━`)
      lines.push(`【打者成績】安打/打数`)
      for (const h of hitters) {
        let line = `${h.order}番 ${h.name}: ${h.stats.h}/${h.stats.ab}`
        const pts: string[] = []
        if (h.stats.rbi      > 0) pts.push(`${h.stats.rbi}打点`)
        if (h.stats.homeRuns > 0) pts.push('HR')
        if (h.stats.triples  > 0) pts.push('3塁打')
        if (h.stats.doubles  > 0) pts.push('2塁打')
        if (h.stats.sb       > 0) pts.push('盗塁')
        if (h.stats.bb       > 0) pts.push(`${h.stats.bb}四球`)
        if (pts.length > 0) line += ` (${pts.join('・')})`
        lines.push(line)
      }
    }

    // ── 投手成績 ──
    const validPitchers = scorebook.pitchers
      .filter(p => p.userId && playerNames.has(p.userId) && p.innings)

    if (validPitchers.length > 0) {
      lines.push(``)
      lines.push(`━━━━━━━━━━━━`)
      lines.push(`【投手成績】`)
      for (const p of validPitchers) {
        const name = playerNames.get(p.userId)!
        let line = `${name}: ${p.innings}回 ${p.runs}失点`
        if (p.earnedRuns != null && p.earnedRuns !== p.runs) line += `(${p.earnedRuns}自責)`
        const pts: string[] = []
        if (p.strikeouts) pts.push(`${p.strikeouts}K`)
        if (p.walks)      pts.push(`${p.walks}BB`)
        if (pts.length > 0) line += ` ${pts.join(' ')}`
        if (p.decision)   line += ` [${p.decision}]`
        lines.push(line)
      }
    }
  }

  return lines.filter(Boolean).join('\n')
}
