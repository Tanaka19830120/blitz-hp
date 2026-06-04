/**
 * LINE Messaging API Webhook
 * - グループメッセージ → groupId を DB へ自動保存
 * - 1:1 で「登録」と送られたら、そのユーザーを問い合わせ通知先候補として保存
 * - LINE は常に 200 を要求するため、エラーは握り潰す
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getLineProfileName, replyLine } from '@/lib/line'
import { getLineContacts, type LineContact } from '@/lib/settings'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const events: unknown[] = body?.events ?? []

    for (const event of events as Record<string, unknown>[]) {
      const source = event.source as Record<string, string> | undefined

      // グループID 検出
      if (source?.type === 'group' && source?.groupId) {
        await prisma.setting.upsert({
          where:  { key: 'detectedLineGroupId' },
          create: { key: 'detectedLineGroupId', value: source.groupId },
          update: { value: source.groupId },
        })
      }

      // 1:1 メッセージで「登録」→ 通知先候補に追加
      if (source?.type === 'user' && source?.userId && event.type === 'message') {
        const message = event.message as Record<string, unknown> | undefined
        const text = message?.type === 'text' ? String(message.text ?? '') : ''
        const userId = source.userId
        if (text.includes('登録')) {
          const name = (await getLineProfileName(userId)) ?? 'メンバー'
          const list = await getLineContacts()
          let next: LineContact[]
          if (list.some(c => c.userId === userId)) {
            next = list.map(c => (c.userId === userId ? { ...c, name } : c))
          } else {
            next = [...list, { userId, name }]
          }
          await prisma.setting.upsert({
            where:  { key: 'lineContacts' },
            create: { key: 'lineContacts', value: JSON.stringify(next) },
            update: { value: JSON.stringify(next) },
          })
          const replyToken = String((event.replyToken as string) ?? '')
          if (replyToken) {
            await replyLine(replyToken, `✅ 登録しました（${name} さん）。\nお問い合わせの通知をこちらに受け取れます。\n※ 管理画面で通知先のON/OFFを設定できます。`)
          }
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
