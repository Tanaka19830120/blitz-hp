import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { SubmitButton } from '@/components/SubmitButton'

export const dynamic = 'force-dynamic'

async function toggleContactOpen(formData: FormData) {
  'use server'
  const next = String(formData.get('contactOpen'))
  await prisma.setting.upsert({
    where: { key: 'contactOpen' },
    create: { key: 'contactOpen', value: next },
    update: { value: next },
  })
  revalidatePath('/contact')
  revalidatePath('/admin/contact')
}

async function saveContactEmail(formData: FormData) {
  'use server'
  const email = String(formData.get('contactEmail') ?? '').trim()
  await prisma.setting.upsert({
    where: { key: 'contactEmail' },
    create: { key: 'contactEmail', value: email },
    update: { value: email },
  })
  revalidatePath('/contact')
  revalidatePath('/admin/contact')
}

async function saveActivityInfo(formData: FormData) {
  'use server'
  const fields = ['activityDay', 'activityArea', 'activityTarget'] as const
  await Promise.all(fields.map(key => {
    const value = String(formData.get(key) ?? '').trim()
    return prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    })
  }))
  revalidatePath('/contact')
  revalidatePath('/admin/contact')
}

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
  const [inquiries, emailSetting, daySetting, areaSetting, targetSetting, openSetting] = await Promise.all([
    prisma.inquiry.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.setting.findUnique({ where: { key: 'contactEmail' } }),
    prisma.setting.findUnique({ where: { key: 'activityDay' } }),
    prisma.setting.findUnique({ where: { key: 'activityArea' } }),
    prisma.setting.findUnique({ where: { key: 'activityTarget' } }),
    prisma.setting.findUnique({ where: { key: 'contactOpen' } }),
  ])
  const unhandled = inquiries.filter(i => !i.handled).length
  const contactEmail    = emailSetting?.value  ?? ''
  const activityDay     = daySetting?.value    ?? '土・日曜日（月2回程度）'
  const activityArea    = areaSetting?.value   ?? '兵庫県 加古川・加古郡・明石エリア'
  const activityTarget  = targetSetting?.value ?? 'ソフトボール経験者・未経験者問わず歓迎'
  const contactOpen     = openSetting?.value !== '0' // デフォルト受付中

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin" className="text-[#64748b] hover:text-[#94a3b8]">← 管理</Link>
        <h1 className="text-2xl font-black text-[#e2e8f0]">お問い合わせ一覧</h1>
        {unhandled > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-[#ef4444]/20 text-[#ef4444] font-bold">未対応 {unhandled}</span>
        )}
      </div>

      {/* 受付ステータス */}
      <div className={`glass-card rounded-2xl p-5 mb-4 flex items-center justify-between gap-4 border ${
        contactOpen ? 'border-[#22c55e]/40' : 'border-[#ef4444]/40'
      }`}>
        <div>
          <div className="text-sm font-bold text-[#e2e8f0] mb-0.5">
            {contactOpen ? '✅ 受付中' : '🚫 受付停止中'}
          </div>
          <div className="text-xs text-[#64748b]">
            {contactOpen
              ? 'お問い合わせフォームを公開しています'
              : 'フォームを非表示にしています。停止中のメッセージが表示されます'}
          </div>
        </div>
        <form action={toggleContactOpen}>
          <input type="hidden" name="contactOpen" value={contactOpen ? '0' : '1'} />
          <button
            type="submit"
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${
              contactOpen
                ? 'bg-[#ef4444]/20 text-[#ef4444] hover:bg-[#ef4444]/30 border border-[#ef4444]/40'
                : 'bg-[#22c55e]/20 text-[#22c55e] hover:bg-[#22c55e]/30 border border-[#22c55e]/40'
            }`}
          >
            {contactOpen ? '受付を停止する' : '受付を再開する'}
          </button>
        </form>
      </div>

      {/* 問い合わせ先メールアドレス設定 */}
      <div className="glass-card rounded-2xl p-5 mb-8 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="shrink-0">
          <div className="text-sm font-bold text-[#e2e8f0] mb-0.5">✉️ 公開メールアドレス</div>
          <div className="text-xs text-[#64748b]">お問い合わせページに表示するアドレス</div>
        </div>
        <form action={saveContactEmail} className="flex-1 flex gap-2 w-full">
          <input
            name="contactEmail"
            type="email"
            defaultValue={contactEmail}
            placeholder="example@gmail.com"
            className="flex-1 bg-[#0d1f35] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#2563eb]/60 min-w-0"
          />
          <SubmitButton pendingLabel="保存中…" className="btn-primary px-4 py-2 text-sm shrink-0">
            保存
          </SubmitButton>
        </form>
      </div>

      {/* 活動情報の編集 */}
      <div className="glass-card rounded-2xl p-5 mb-8">
        <div className="text-sm font-bold text-[#e2e8f0] mb-3">📋 活動情報（お問い合わせページに表示）</div>
        <form action={saveActivityInfo} className="flex flex-col gap-3">
          {[
            { name: 'activityDay',    label: '活動日',   value: activityDay },
            { name: 'activityArea',   label: '活動地域', value: activityArea },
            { name: 'activityTarget', label: '対象',     value: activityTarget },
          ].map(({ name, label, value }) => (
            <div key={name} className="flex items-center gap-3">
              <span className="text-xs text-[#64748b] w-16 shrink-0">{label}</span>
              <input
                name={name}
                defaultValue={value}
                className="flex-1 bg-[#0d1f35] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#2563eb]/60"
              />
            </div>
          ))}
          <SubmitButton pendingLabel="保存中…" className="btn-primary py-2 text-sm self-end px-6">
            保存
          </SubmitButton>
        </form>
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
