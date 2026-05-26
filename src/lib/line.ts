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
