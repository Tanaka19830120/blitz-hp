import { NextResponse } from 'next/server'
import { getContactRecipients } from '@/lib/settings'
import { isMailConfigured, sendMail } from '@/lib/mail'

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

  const recipients = await getContactRecipients()
  const subject = `【BLITZ お問い合わせ】${type} — ${name} 様`
  const text = [
    `BLITZ HP のお問い合わせフォームから新着があります。`,
    ``,
    `■ お名前: ${name}`,
    `■ メール: ${email}`,
    `■ 種別: ${type}`,
    `■ 内容:`,
    message,
    ``,
    `※ 返信はこのメールの「返信」で送信者(${email})宛に届きます。`,
  ].join('\n')

  // メール送信のみ（LINE 全体配信は廃止）
  if (recipients.length === 0) {
    return NextResponse.json(
      { error: '配信先メールが未設定のため送信できませんでした。管理者にご連絡ください。' },
      { status: 503 }
    )
  }
  if (!isMailConfigured()) {
    return NextResponse.json(
      { error: 'メール送信が未設定のため送信できませんでした。管理者にご連絡ください。' },
      { status: 503 }
    )
  }

  try {
    await sendMail({ to: recipients, subject, text, replyTo: email })
  } catch (e) {
    return NextResponse.json(
      { error: '送信に失敗しました。時間をおいて再度お試しください。', details: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
