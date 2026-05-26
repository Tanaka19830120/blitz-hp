/**
 * Vercel Cron — 毎朝9時 JST（0:00 UTC）に出欠リマインドを自動送信
 * vercel.json の crons セクションで設定
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendToLineGroup, buildReminder } from '@/lib/line'

export async function GET(request: Request) {
  // Vercel Cron からのリクエストのみ許可
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const results: string[] = []

  // 1日後・3日後の試合を取得
  for (const targetDays of [1, 3]) {
    const targetDate = new Date(now)
    targetDate.setDate(targetDate.getDate() + targetDays)

    const schedules = await prisma.schedule.findMany({
      where: {
        date: {
          gte: new Date(targetDate.setHours(0, 0, 0, 0)),
          lte: new Date(targetDate.setHours(23, 59, 59, 999)),
        },
        game: null, // 結果未登録（これから行われる試合）
      },
    })

    for (const s of schedules) {
      const msg = buildReminder({
        date: s.date,
        opponent: s.opponent,
        location: s.location,
        meetTime: s.meetTime,
        startTime: s.startTime,
      })
      const { ok, error } = await sendToLineGroup(msg)
      results.push(ok ? `✓ ${s.opponent}（${targetDays}日前）` : `✗ ${s.opponent}: ${error}`)
    }
  }

  return NextResponse.json({ sent: results })
}
