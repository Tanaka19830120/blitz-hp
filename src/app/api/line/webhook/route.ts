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
        const groupId = source.groupId

        // テキストメッセージのキーワード判定
        const msgText: string = (event.message as Record<string, string> | undefined)?.text?.trim() ?? ''

        if (msgText === '管理者登録') {
          // このグループを管理者専用グループとして登録
          await prisma.setting.upsert({
            where:  { key: 'adminLineGroupId' },
            create: { key: 'adminLineGroupId', value: groupId },
            update: { value: groupId },
          })
        } else {
          // それ以外はチーム全体グループとして記録
          await prisma.setting.upsert({
            where:  { key: 'detectedLineGroupId' },
            create: { key: 'detectedLineGroupId', value: groupId },
            update: { value: groupId },
          })
        }
      }
    }
  } catch {
    // LINE は必ず 200 を返す必要がある
  }

  return NextResponse.json({ status: 'ok' })
}

export async function GET() {
  return NextResponse.json({ status: 'ok' })
}
