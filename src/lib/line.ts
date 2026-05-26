/**
 * LINE Messaging API — グループへのプッシュ送信ユーティリティ
 * 環境変数: LINE_CHANNEL_ACCESS_TOKEN, LINE_GROUP_ID
 * LINE_GROUP_ID が未設定の場合は DB の detectedLineGroupId を使用
 */

import { prisma } from './prisma'

const LINE_PUSH_API = 'https://api.line.me/v2/bot/message/push'

export async function sendToLineGroup(text: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  const groupId = process.env.LINE_GROUP_ID
    || await prisma.setting.findUnique({ where: { key: 'detectedLineGroupId' } }).then(s => s?.value ?? '').catch(() => '')
  if (!token || !groupId) return { ok: false, error: 'LINE_CHANNEL_ACCESS_TOKEN または LINE_GROUP_ID が未設定です' }

  try {
    const res = await fetch(LINE_PUSH_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: groupId,
        messages: [{ type: 'text', text }],
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      return { ok: false, error: `LINE API ${res.status}: ${body}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
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

/** 出欠リマインド */
export function buildReminder(schedule: {
  date: Date
  opponent: string
  location: string
  meetTime?: string | null
  startTime?: string | null
}): string {
  const days = daysUntil(schedule.date)
  const when = days <= 0 ? '本日' : days === 1 ? '明日' : `${days}日後`

  return [
    `📅【BLITZ】出欠登録のお願い`,
    ``,
    `${when}（${fmt(schedule.date)}）`,
    `⚾ vs ${schedule.opponent}`,
    `📍 ${schedule.location}`,
    schedule.meetTime ? `🕐 集合 ${schedule.meetTime}` : null,
    schedule.startTime ? `▶ 試合開始 ${schedule.startTime}` : null,
    ``,
    `出欠の登録をお願いします！`,
    `👉 https://blitz-hp.vercel.app/schedule`,
  ].filter(Boolean).join('\n')
}

/** 出欠集計 */
export function buildAttendanceSummary(
  schedule: { date: Date; opponent: string },
  attendances: { status: string; user: { name: string } }[]
): string {
  const attending = attendances.filter(a => a.status === 'ATTENDING').map(a => a.user.name)
  const absent    = attendances.filter(a => a.status === 'ABSENT').map(a => a.user.name)
  const maybe     = attendances.filter(a => a.status === 'MAYBE').map(a => a.user.name)
  const pending   = attendances.filter(a => a.status === 'PENDING').map(a => a.user.name)

  return [
    `📋【BLITZ】出欠状況`,
    `${fmt(schedule.date)} vs ${schedule.opponent}`,
    `━━━━━━━━━━━━`,
    `✅ 参加 ${attending.length}名`,
    attending.length > 0 ? attending.join('、') : '（なし）',
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
    `📍 ${schedule.location}`,
    schedule.meetTime  ? `🕐 集合 ${schedule.meetTime}`   : null,
    schedule.startTime ? `▶ 試合開始 ${schedule.startTime}` : null,
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
    `📍 ${schedule.location}`,
    schedule.meetTime  ? `🕐 集合 ${schedule.meetTime}`    : null,
    schedule.startTime ? `▶ 試合開始 ${schedule.startTime}` : null,
    `━━━━━━━━━━━━`,
  ]

  for (let i = 0; i < data.slots.length; i++) {
    const s  = data.slots[i]
    const p1 = pm.get(s.first.playerId)
    if (!p1) continue
    const pos1 = s.first.position === 'DP' ? 'DP(打)' : s.first.position
    let line = `${i + 1}番 ${pos1 ? pos1 + ' ' : ''}${p1.name}`

    // 後半で別の選手に交代
    if (s.second.playerId && s.second.playerId !== s.first.playerId) {
      const p2   = pm.get(s.second.playerId)
      const pos2 = s.second.position === 'DP' ? 'DP(打)' : s.second.position
      if (p2) line += ` → 後半: ${pos2 ? pos2 + ' ' : ''}${p2.name}`
    } else if (s.second.playerId === s.first.playerId && s.second.position && s.second.position !== s.first.position) {
      // 同じ選手でポジション変更
      const pos2 = s.second.position === 'DP' ? 'DP(打)' : s.second.position
      line += ` → 後半: ${pos2}`
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

  // 審判
  const validUmpires = (data.umpires ?? []).filter(u => u.playerId)
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

/** 試合結果 */
export function buildGameResult(
  schedule: { date: Date; opponent: string },
  game: { ourScore: number; opponentScore: number; result: string; note?: string | null }
): string {
  const emoji =
    game.result === 'WIN'  ? '🏆 勝利！' :
    game.result === 'LOSE' ? '😔 敗戦' :
                             '🤝 引き分け'

  return [
    `⚾【BLITZ】試合結果`,
    `${fmt(schedule.date)} vs ${schedule.opponent}`,
    `━━━━━━━━━━━━`,
    `BLITZ ${game.ourScore} ー ${game.opponentScore} ${schedule.opponent}`,
    ``,
    emoji,
    game.note ? `\n${game.note}` : null,
  ].filter(Boolean).join('\n')
}
