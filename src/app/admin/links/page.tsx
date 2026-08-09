import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { SubmitButton } from '@/components/SubmitButton'
import { PhotoUploader } from '@/components/PhotoUploader'
import { unstable_noStore as noStore } from 'next/cache'

async function createLink(formData: FormData) {
  'use server'
  const title       = String(formData.get('title') ?? '').trim()
  const url         = String(formData.get('url') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim() || null
  const imageUrl    = String(formData.get('imageUrl') ?? '').trim() || null
  if (!title || !url) return
  const maxOrder = await prisma.link.aggregate({ _max: { order: true } })
  await prisma.link.create({
    data: { title, url, description, imageUrl, order: (maxOrder._max.order ?? 0) + 1 },
  })
  revalidatePath('/links')
  redirect('/admin/links?toast=' + encodeURIComponent('リンクを追加しました'))
}

async function updateLink(formData: FormData) {
  'use server'
  const id          = String(formData.get('id'))
  const title       = String(formData.get('title') ?? '').trim()
  const url         = String(formData.get('url') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim() || null
  const imageUrl    = String(formData.get('imageUrl') ?? '').trim() || null
  const order       = parseInt(String(formData.get('order') ?? '0'), 10)
  if (!title || !url) return
  await prisma.link.update({ where: { id }, data: { title, url, description, imageUrl, order } })
  revalidatePath('/links')
  redirect('/admin/links?toast=' + encodeURIComponent('更新しました'))
}

async function deleteLink(formData: FormData) {
  'use server'
  const id = String(formData.get('id'))
  await prisma.link.delete({ where: { id } })
  revalidatePath('/links')
  redirect('/admin/links?toast=' + encodeURIComponent('削除しました'))
}

export default async function AdminLinksPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>
}) {
  noStore()
  const sp = await searchParams
  const editId = sp.edit

  const links = await prisma.link.findMany({ orderBy: { order: 'asc' } })
  const editLink = editId ? links.find(l => l.id === editId) : null

  const inputClass = 'w-full bg-[#0d1f35] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#2563eb]/60'

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin" className="text-[#64748b] hover:text-[#94a3b8]">← 管理</Link>
        <h1 className="text-2xl font-black text-[#e2e8f0]">リンク集管理</h1>
        <Link href="/links" target="_blank" className="ml-auto text-xs text-[#60a5fa] hover:underline">
          公開ページを見る ↗
        </Link>
      </div>

      {/* 追加 / 編集フォーム */}
      <div className="glass-card rounded-2xl p-6 mb-8">
        <h2 className="text-sm font-bold text-[#60a5fa] mb-4">
          {editLink ? `✏️ ${editLink.title} を編集` : '➕ リンクを追加'}
        </h2>
        <form action={editLink ? updateLink : createLink} className="flex flex-col gap-3">
          {editLink && <input type="hidden" name="id" value={editLink.id} />}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#64748b] mb-1">タイトル *</label>
              <input name="title" required defaultValue={editLink?.title ?? ''} placeholder="旧HP (teams.one)" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-[#64748b] mb-1">URL *</label>
              <input name="url" type="url" required defaultValue={editLink?.url ?? ''} placeholder="https://..." className={inputClass} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#64748b] mb-1">説明文</label>
            <input name="description" defaultValue={editLink?.description ?? ''} placeholder="試合結果・成績の記録" className={inputClass} />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#64748b] mb-1">バナー画像（JPG・PNG可）</label>
              <PhotoUploader defaultUrl={editLink?.imageUrl ?? ''} name="imageUrl" />
            </div>
            {editLink && (
              <div>
                <label className="block text-xs text-[#64748b] mb-1">表示順</label>
                <input name="order" type="number" defaultValue={editLink.order} className={inputClass} />
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-1">
            <SubmitButton pendingLabel="保存中…" className="btn-primary flex-1 py-2">
              {editLink ? '更新する' : '追加する'}
            </SubmitButton>
            {editLink && (
              <Link href="/admin/links" className="btn-secondary px-6 py-2 text-center text-sm">
                キャンセル
              </Link>
            )}
          </div>
        </form>
      </div>

      {/* リンク一覧 */}
      {links.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center text-[#64748b] text-sm">
          まだリンクがありません
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {links.map((l) => (
            <div key={l.id} className={`glass-card rounded-xl px-4 py-3 flex items-center gap-4 ${l.id === editId ? 'border border-[#2563eb]/40' : ''}`}>
              {/* バナーサムネ */}
              {l.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.imageUrl} alt={l.title} className="w-12 h-10 object-cover rounded shrink-0" />
              ) : (
                <div className="w-12 h-10 rounded bg-[#1e3a5f] shrink-0 flex items-center justify-center text-[#475569] text-lg">🔗</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-[#e2e8f0] truncate">{l.title}</div>
                {l.description && <div className="text-xs text-[#64748b] truncate">{l.description}</div>}
                <div className="text-xs text-[#334155] truncate">{l.url}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-[#475569]">#{l.order}</span>
                <Link href={`/admin/links?edit=${l.id}`} className="text-xs text-[#60a5fa]/70 hover:text-[#60a5fa]">編集</Link>
                <form action={deleteLink}>
                  <input type="hidden" name="id" value={l.id} />
                  <SubmitButton
                    pendingLabel="…"
                    confirm={`「${l.title}」を削除しますか？`}
                    className="text-xs text-[#ef4444]/50 hover:text-[#ef4444] transition-colors"
                  >
                    削除
                  </SubmitButton>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
