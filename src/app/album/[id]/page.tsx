import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { revalidatePath } from 'next/cache'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { AlbumUploader } from '@/components/AlbumUploader'
import PhotoGrid from '@/components/PhotoLightbox'

export const dynamic = 'force-dynamic'

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
}

// ── 写真いいねトグル ──
async function togglePhotoLike(photoId: string): Promise<void> {
  'use server'
  const session = await auth()
  if (!session?.user?.id) return
  const existing = await prisma.photoLike.findUnique({
    where: { photoId_userId: { photoId, userId: session.user.id } },
  })
  if (existing) {
    await prisma.photoLike.delete({ where: { id: existing.id } })
  } else {
    await prisma.photoLike.create({ data: { photoId, userId: session.user.id } })
  }
  revalidatePath(`/album/${photoId}`)
}

// ── 写真削除（管理者 または 投稿者本人） ──
async function deletePhoto(photoId: string, albumId: string): Promise<void> {
  'use server'
  const session = await auth()
  if (!session?.user?.id) return
  const photo = await prisma.photo.findUnique({ where: { id: photoId } })
  if (!photo) return
  const isAdmin = (session.user as { role?: string }).role === 'ADMIN'
  if (!isAdmin && photo.uploadedById !== session.user.id) return
  await prisma.photo.delete({ where: { id: photoId } })
  revalidatePath(`/album/${albumId}`)
}

export default async function AlbumDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
  const myId = session.user.id!

  const album = await prisma.photoAlbum.findUnique({
    where: { id },
    include: {
      photos: {
        orderBy: { createdAt: 'asc' },
        include: {
          uploadedBy: { select: { name: true } },
          likes: { select: { userId: true } },
        },
      },
    },
  })
  if (!album) notFound()

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
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
        <PhotoGrid
          albumId={album.id}
          photos={album.photos.map(p => ({
            id:             p.id,
            url:            p.url,
            uploadedByName: p.uploadedBy?.name ?? null,
            likeCount:      p.likes.length,
            liked:          p.likes.some(l => l.userId === myId),
            canDelete:      isAdmin || p.uploadedById === myId,
          }))}
          toggleAction={togglePhotoLike}
          deleteAction={deletePhoto}
        />
      )}
    </div>
  )
}
