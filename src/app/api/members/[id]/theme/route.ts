import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  }

  const { id } = await params
  const sessionUser = session.user as { id?: string; role?: string }
  const isAdmin = sessionUser.role === 'ADMIN'
  const isSelf  = sessionUser.id === id

  if (!isAdmin && !isSelf) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  const body = await req.json()
  const color: string | null = body.color ?? null

  // バリデーション: null または #rrggbb 形式
  if (color !== null && !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return NextResponse.json({ error: '無効なカラーコードです' }, { status: 400 })
  }

  await prisma.user.update({
    where: { id },
    data: { themeColor: color },
  })

  return NextResponse.json({ ok: true, color })
}
