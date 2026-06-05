import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { SubmitButton } from '@/components/SubmitButton'

export const dynamic = 'force-dynamic'

function fmt(d: Date) {
  return new Date(d).toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function toggleHandled(formData: FormData) {
  'use server'
  const id = String(formData.get('id'))
  const handled = String(formData.get('handled')) === 'true'
  await prisma.inquiry.update({ where: { id }, data: { handled: !handled } })
  revalidatePath('/admin/contact')
}

async function deleteInquiry(formData: FormData) {
  'use server'
  const id = String(formData.get('id'))
  await prisma.inquiry.delete({ where: { id } })
  revalidatePath('/admin/contact')
  revalidatePath('/admin')
}

export default async function AdminContactPage() {
  const inquiries = await prisma.inquiry.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
  const unhandled = inquiries.filter(i => !i.handled).length

  return (
    <div className="pt-16 max-w-3xl mx-auto px-4 py-12">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin" className="text-[#64748b] hover:text-[#94a3b8]">← 管理</Link>
        <h1 className="text-2xl font-black text-[#e2e8f0]">お問い合わせ一覧</h1>
        {unhandled > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-[#ef4444]/20 text-[#ef4444] font-bold">未対応 {unhandled}</span>
        )}
      </div>

      {inquiries.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center text-[#64748b]">
          お問い合わせはまだありません。
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {inquiries.map(q => (
            <div key={q.id} className={`glass-card rounded-2xl p-5 ${q.handled ? 'opacity-60' : 'border border-[#fbbf24]/30'}`}>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs px-2 py-0.5 rounded border border-[#1e3a5f] text-[#94a3b8]">{q.type}</span>
                <span className="font-bold text-[#e2e8f0]">{q.name}</span>
                <a href={`mailto:${q.email}`} className="text-xs text-[#60a5fa] hover:underline">{q.email}</a>
                <span className="text-xs text-[#475569] ml-auto">{fmt(q.createdAt)}</span>
              </div>
              <p className="text-sm text-[#94a3b8] whitespace-pre-wrap leading-relaxed bg-[#0d1b2a] rounded-xl p-3 border border-[#1e3a5f]">
                {q.message}
              </p>
              <div className="flex items-center gap-3 mt-3">
                <a href={`mailto:${q.email}?subject=${encodeURIComponent('【BLITZ】お問い合わせありがとうございます')}`}
                  className="text-xs px-3 py-1.5 rounded-lg border border-[#2563eb]/50 text-[#60a5fa] hover:bg-[#2563eb]/10 transition-all">
                  ✉️ メールで返信
                </a>
                <form action={toggleHandled}>
                  <input type="hidden" name="id" value={q.id} />
                  <input type="hidden" name="handled" value={String(q.handled)} />
                  <SubmitButton pendingLabel="…" className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                    q.handled
                      ? 'border-[#1e3a5f] text-[#64748b] hover:text-[#94a3b8]'
                      : 'border-[#22c55e]/50 text-[#22c55e] hover:bg-[#22c55e]/10'
                  }`}>
                    {q.handled ? '未対応に戻す' : '✓ 対応済みにする'}
                  </SubmitButton>
                </form>
                <form action={deleteInquiry} className="ml-auto">
                  <input type="hidden" name="id" value={q.id} />
                  <SubmitButton pendingLabel="…" confirm="この問い合わせを削除しますか？"
                    className="text-xs px-3 py-1.5 rounded-lg border border-[#ef4444]/40 text-[#ef4444]/80 hover:bg-[#ef4444]/10 transition-all">
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
