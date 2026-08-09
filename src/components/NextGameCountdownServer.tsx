import { unstable_noStore as noStore } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { NextGameCountdown } from './NextGameCountdown'

export async function NextGameCountdownServer() {
  noStore() // キャッシュ無効化 — 毎リクエスト最新DBを参照

  // JST(UTC+9)基準で「現在」を計算
  const now = new Date()
  const next = await prisma.schedule.findFirst({
    where: { date: { gt: now } },
    orderBy: { date: 'asc' },
  })

  if (!next) return null

  // イベントは opponent がイベント名として使われる
  const label = next.type === 'EVENT'
    ? (next.opponent || 'イベント')
    : `vs ${next.opponent}`

  return (
    <NextGameCountdown
      targetDate={next.date.toISOString()}
      label={label}
      meetTime={next.meetTime}
      startTime={next.startTime}
    />
  )
}
