import { put } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'

export async function POST(req: Request) {
  const session = await auth()
  if (!session || (session.user as { role?: string }).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'ファイルがありません' }, { status: 400 })
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: '画像ファイルを選択してください' }, { status: 400 })
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'ファイルサイズは5MB以内にしてください' }, { status: 400 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const filename = `members/${Date.now()}.${ext}`
  const blob = await put(filename, file, { access: 'public' })

  return NextResponse.json({ url: blob.url })
}
