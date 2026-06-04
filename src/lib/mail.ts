import nodemailer from 'nodemailer'

/**
 * SMTP メール送信ユーティリティ。
 * 環境変数:
 *   SMTP_HOST  (既定: smtp.gmail.com)
 *   SMTP_PORT  (既定: 465)
 *   SMTP_USER  送信元アドレス（Gmail の場合は Gmail アドレス）
 *   SMTP_PASS  パスワード（Gmail はアプリパスワード）
 *   SMTP_FROM  差出人表示（既定: SMTP_USER）
 */
export function isMailConfigured(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS)
}

export async function sendMail(opts: {
  to: string[]
  subject: string
  text: string
  replyTo?: string
}): Promise<void> {
  if (!isMailConfigured()) throw new Error('SMTP が未設定です')
  const host = process.env.SMTP_HOST ?? 'smtp.gmail.com'
  const port = parseInt(process.env.SMTP_PORT ?? '465', 10)
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  })
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER!,
    to: opts.to.join(', '),
    subject: opts.subject,
    text: opts.text,
    replyTo: opts.replyTo,
  })
}
