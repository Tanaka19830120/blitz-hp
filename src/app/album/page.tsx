import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { SubmitButton } from '@/components/SubmitButton'

export const dynamic = 'force-dynamic'

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
}

// ── アルバム作成（ログインメンバー） ──
async function createAlbum(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.id) return
  const title = String(formData.get('title') || '').trim()
  const dateStr = String(formData.get('date') || '')
  if (!title || !dateStr) return
  await prisma.photoAlbum.create({
    data: { title, date: new Date(`${dateStr}T00:00:00`) },
  })
  revalidatePath('/album')
  redirect(`/album?toast=${encodeURIComponent('アルバムを作成しました')}`)
}

// ── アルバム削除（管理者のみ） ──
async function deleteAlbum(formData: FormData) {
  'use server'
  const session = await auth()
  if ((session?.user as { role?: string })?.role !== 'ADMIN') return
  const id = String(formData.get('id'))
  await prisma.photoAlbum.delete({ where: { id } })
  revalidatePath('/album')
  redirect(`/album?toast=${encodeURIComponent('アルバムを削除しました')}`)
}

export default async function AlbumListPage() {
  const session = await auth()
  if (!session?.user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-black text-[#e2e8f0] mb-3">📷 写真</h1>
        <p className="text-[#64748b] mb-6">写真の閲覧・投稿はメンバー専用です。ログインしてください。</p>
        <Link href="/login" className="btn-primary">ログイン</Link>
      </div>
    )
  }
  const isAdmin = (session.user as { role?: string }).role === 'ADMIN'

  const albums = await prisma.photoAlbum.findMany({
    orderBy: { date: 'desc' },
    include: {
      photos: { take: 1, orderBy: { createdAt: 'asc' }, select: { url: true } },
      _count: { select: { photos: true } },
    },
  })

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-[#e2e8f0] mb-2">📷 写真</h1>
        <p className="text-[#64748b]">試合・イベントの写真（メンバー専用）</p>
      </div>

      {/* アルバム作成 */}
      <div className="glass-card rounded-2xl p-5 mb-8">
        <h2 className="text-sm font-bold text-[#94a3b8] mb-3">アルバムを作成</h2>
        <form action={createAlbum} className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="sm:w-44">
            <label className="block text-xs text-[#64748b] mb-1">日付 *</label>
            <input type="date" name="date" required defaultValue={today} className="w-full" />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-[#64748b] mb-1">タイトル *</label>
            <input type="text" name="title" required placeholder="例: BBQ / vs 佐土" className="w-full" />
          </div>
          <SubmitButton pendingLabel="作成中…" className="btn-primary px-4 py-2.5 whitespace-nowrap">作成</SubmitButton>
        </form>
      </div>

      {/* アルバム一覧 */}
      {albums.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center text-[#64748b]">
          まだアルバムがありません。上のフォームから作成してください。
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {albums.map((a) => (
            <div key={a.id} className="glass-card rounded-2xl overflow-hidden group relative">
              <Link href={`/album/${a.id}`} className="block">
                <div className="aspect-square bg-[#0d1b2a] overflow-hidden">
                  {a.photos[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.photos[0].url} alt={a.title} loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#1e3a5f] text-4xl">📷</div>
                  )}
                </div>
                <div className="p-3">
                  <div className="text-xs text-[#64748b]">{fmtDate(a.date)}</div>
                  <div className="font-bold text-[#e2e8f0] truncate">{a.title}</div>
                  <div className="text-xs text-[#475569] mt-0.5">{a._count.photos}枚</div>
                </div>
              </Link>
              {isAdmin && (
                <form action={deleteAlbum} className="absolute top-2 right-2">
                  <input type="hidden" name="id" value={a.id} />
                  <SubmitButton
                    pendingLabel="…"
                    confirm={`アルバム「${a.title}」と中の写真をすべて削除しますか？`}
                    className="w-7 h-7 rounded-full bg-black/60 text-white text-xs hover:bg-[#ef4444]"
                  >
                    ✕
                  </SubmitButton>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
