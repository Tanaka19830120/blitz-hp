import { NextResponse } from 'next/server'
import { getContactRecipients } from '@/lib/settings'
import { isMailConfigured, sendMail } from '@/lib/mail'
import { sendToLineGroup } from '@/lib/line'

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

  let delivered = false
  const errors: string[] = []

  // 1) メール送信（SMTP 設定済み & 宛先あり）
  if (recipients.length > 0 && isMailConfigured()) {
    try {
      await sendMail({ to: recipients, subject, text, replyTo: email })
      delivered = true
    } catch (e) {
      errors.push(`mail: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // 2) フォールバック: LINE グループへ通知（問い合わせを取りこぼさない）
  try {
    await sendToLineGroup(
      `📨【BLITZ お問い合わせ】\n種別: ${type}\nお名前: ${name}\nメール: ${email}\n----\n${message}`
    )
    delivered = true
  } catch (e) {
    errors.push(`line: ${e instanceof Error ? e.message : String(e)}`)
  }

  if (!delivered) {
    return NextResponse.json(
      { error: '送信先が未設定のため通知できませんでした。管理者にご連絡ください。', details: errors.join('; ') },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
