import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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

  try {
    await prisma.inquiry.create({ data: { name, email, type, message } })
  } catch (e) {
    return NextResponse.json(
      { error: '送信に失敗しました。時間をおいて再度お試しください。', details: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
