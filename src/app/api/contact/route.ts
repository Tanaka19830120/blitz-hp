import { NextResponse } from 'next/server'
import { getLineContactRecipients } from '@/lib/settings'
import { pushToLineUsers } from '@/lib/line'

const TYPE_LABELS: Record<string, string> = {
  trial: '体験参加について',
  join: '入団希望',
  practice: '練習試合の申し込み',
  other: 'その他',
}

export async function POST(req: Request) {
  let body: { name?: string; email?: string; type?: string; message?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 })
  }

  const name = String(body.name ?? '').trim()
  const email = String(body.email ?? '').trim()
  const type = TYPE_LABELS[String(body.type ?? 'other')] ?? 'その他'
  const message = String(body.message ?? '').trim()

  if (!name || !email || !message) {
    return NextResponse.json({ error: '必須項目が未入力です' }, { status: 400 })
  }

  const recipients = await getLineContactRecipients()
  if (recipients.length === 0) {
    return NextResponse.json(
      { error: '通知先が未設定のため送信できませんでした。管理者にご連絡ください。' },
      { status: 503 }
    )
  }

  const text = [
    `📨【BLITZ お問い合わせ】`,
    `種別: ${type}`,
    `お名前: ${name}`,
    `メール: ${email}`,
    `――――――`,
    message,
  ].join('\n')

  const r = await pushToLineUsers(recipients, text)
  if (!r.ok) {
    return NextResponse.json(
      { error: '送信に失敗しました。時間をおいて再度お試しください。', details: r.error },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
