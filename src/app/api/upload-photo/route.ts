import { put } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

// 写真アルバムへの画像アップロード（ログインメンバーのみ）
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'BLOB_READ_WRITE_TOKEN が未設定です' }, { status: 503 })
  }

  const form = await req.formData()
  const file = form.get('file') as File | null
  const albumId = String(form.get('albumId') || '')

  if (!albumId) {
    return NextResponse.json({ error: 'アルバムが指定されていません' }, { status: 400 })
  }
  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'ファイルがありません' }, { status: 400 })
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: '画像ファイルを選択してください' }, { status: 400 })
  }
  // 圧縮済みを前提に上限を設定（保険）
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: 'ファイルサイズは8MB以内にしてください' }, { status: 400 })
  }

  const album = await prisma.photoAlbum.findUnique({ where: { id: albumId } })
  if (!album) {
    return NextResponse.json({ error: 'アルバムが見つかりません' }, { status: 404 })
  }

  const ext = file.type.includes('png') ? 'png' : 'jpg'
  const blob = await put(`albums/${albumId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`, file, {
    access: 'public',
  })

  const photo = await prisma.photo.create({
    data: { albumId, url: blob.url, uploadedById: session.user.id },
  })

  return NextResponse.json({ url: blob.url, id: photo.id })
}
