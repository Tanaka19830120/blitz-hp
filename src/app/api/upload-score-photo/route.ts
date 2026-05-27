import { put } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: 'BLOB_READ_WRITE_TOKEN が未設定です。Vercel Blob を有効化してください。' },
      { status: 503 }
    )
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const scheduleId = (formData.get('scheduleId') as string | null) ?? 'unknown'

    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'ファイルが見つかりません' }, { status: 400 })
    }

    const ext = file.type.includes('png') ? 'png' : 'jpg'
    const blob = await put(
      `score-photos/${scheduleId}/${Date.now()}.${ext}`,
      file,
      { access: 'public' }
    )

    return NextResponse.json({ url: blob.url })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
