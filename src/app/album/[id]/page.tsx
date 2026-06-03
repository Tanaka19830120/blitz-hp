import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { AlbumUploader } from '@/components/AlbumUploader'
import { SubmitButton } from '@/components/SubmitButton'

export const dynamic = 'force-dynamic'

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
}

// ── 写真削除（投稿者本人 or 管理者） ──
async function deletePhoto(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.id) return
  const id = String(formData.get('id'))
  const albumId = String(formData.get('albumId'))
  const photo = await prisma.photo.findUnique({ where: { id } })
  if (!photo) return
  const isAdmin = (session.user as { role?: string }).role === 'ADMIN'
  if (!isAdmin && photo.uploadedById !== session.user.id) return
  await prisma.photo.delete({ where: { id } })
  revalidatePath(`/album/${albumId}`)
  redirect(`/album/${albumId}?toast=${encodeURIComponent('写真を削除しました')}`)
}

export default async function AlbumDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) {
    return (
      <div className="pt-16 max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-black text-[#e2e8f0] mb-3">📷 写真</h1>
        <p className="text-[#64748b] mb-6">写真の閲覧・投稿はメンバー専用です。ログインしてください。</p>
        <Link href="/login" className="btn-primary">ログイン</Link>
      </div>
    )
  }
  const isAdmin = (session.user as { role?: string }).role === 'ADMIN'
  const myId = session.user.id

  const album = await prisma.photoAlbum.findUnique({
    where: { id },
    include: {
      photos: {
        orderBy: { createdAt: 'asc' },
        include: { uploadedBy: { select: { name: true } } },
      },
    },
  })
  if (!album) notFound()

  return (
    <div className="pt-16 max-w-5xl mx-auto px-4 py-12">
      <div className="flex items-center gap-2 text-sm text-[#64748b] mb-6">
        <Link href="/album" className="hover:text-[#60a5fa] transition-colors">写真</Link>
        <span>›</span>
        <span className="text-[#94a3b8]">{album.title}</span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div className="text-sm text-[#64748b]">{fmtDate(album.date)}</div>
          <h1 className="text-2xl font-black text-[#e2e8f0]">{album.title}</h1>
          <div className="text-xs text-[#475569] mt-1">{album.photos.length}枚</div>
        </div>
        <AlbumUploader albumId={album.id} />
      </div>

      {album.photos.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center text-[#64748b]">
          まだ写真がありません。「写真を追加」からアップロードしてください。
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {album.photos.map((p) => {
            const canDelete = isAdmin || p.uploadedById === myId
            return (
              <div key={p.id} className="relative group glass-card rounded-xl overflow-hidden">
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="block aspect-square bg-[#0d1b2a]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" loading="lazy"
                    className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" />
                </a>
                {canDelete && (
                  <form action={deletePhoto} className="absolute top-1.5 right-1.5">
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="albumId" value={album.id} />
                    <SubmitButton
                      pendingLabel="…"
                      confirm="この写真を削除しますか？"
                      className="w-7 h-7 rounded-full bg-black/60 text-white text-xs hover:bg-[#ef4444]"
                    >
                      ✕
                    </SubmitButton>
                  </form>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
