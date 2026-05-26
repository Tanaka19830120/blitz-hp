/**
 * LINE Messaging API Webhook
 * - グループメッセージを受け取ったときに groupId を DB へ自動保存
 * - LINE は常に 200 を要求するため、エラーは握り潰す
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const events: unknown[] = body?.events ?? []

    for (const event of events as Record<string, unknown>[]) {
      const source = event.source as Record<string, string> | undefined
      if (source?.type === 'group' && source?.groupId) {
        // グループIDを DB に保存（管理画面で表示するだけ / 送信には env var を使う）
        await prisma.setting.upsert({
          where:  { key: 'detectedLineGroupId' },
          create: { key: 'detectedLineGroupId', value: source.groupId },
          update: { value: source.groupId },
        })
      }
    }
  } catch {
    // LINE は必ず 200 を返す必要がある
  }

  return NextResponse.json({ status: 'ok' })
}

// LINE の Webhook 検証リクエスト（GET）にも応答
export async function GET() {
  return NextResponse.json({ status: 'ok' })
}
