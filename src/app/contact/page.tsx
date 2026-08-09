import { prisma } from '@/lib/prisma'
import { unstable_noStore as noStore } from 'next/cache'
import { ContactForm } from '@/components/ContactForm'

export default async function ContactPage() {
  noStore()
  const [emailSetting, daySetting, areaSetting, targetSetting, openSetting] = await Promise.all([
    prisma.setting.findUnique({ where: { key: 'contactEmail' } }),
    prisma.setting.findUnique({ where: { key: 'activityDay' } }),
    prisma.setting.findUnique({ where: { key: 'activityArea' } }),
    prisma.setting.findUnique({ where: { key: 'activityTarget' } }),
    prisma.setting.findUnique({ where: { key: 'contactOpen' } }),
  ])
  const contactEmail   = emailSetting?.value  || ''
  const activityDay    = daySetting?.value    || '土・日曜日（月2回程度）'
  const activityArea   = areaSetting?.value   || '兵庫県 加古川・加古郡・明石エリア'
  const activityTarget = targetSetting?.value || 'ソフトボール経験者・未経験者問わず歓迎'
  const contactOpen    = openSetting?.value !== '0'

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-[#e2e8f0] mb-2">お問い合わせ</h1>
        <p className="text-[#64748b]">体験参加・入団希望など、お気軽にご連絡ください。</p>
      </div>

      {/* メールアドレス表示 */}
      {contactEmail && (
        <div className="glass-card rounded-2xl p-5 mb-6 flex items-center gap-4">
          <span className="text-2xl">✉️</span>
          <div>
            <div className="text-xs text-[#64748b] mb-0.5">メールでのお問い合わせ</div>
            <a
              href={`mailto:${contactEmail}`}
              className="text-[#60a5fa] font-bold hover:underline text-lg"
            >
              {contactEmail}
            </a>
          </div>
        </div>
      )}

      {/* フォーム or 受付停止メッセージ */}
      {contactOpen ? (
        <ContactForm />
      ) : (
        <div className="glass-card rounded-2xl p-10 text-center border border-[#ef4444]/30">
          <div className="text-5xl mb-4">🚫</div>
          <h2 className="text-xl font-bold text-[#e2e8f0] mb-2">現在、新規お問い合わせを停止しています</h2>
          <p className="text-[#64748b] text-sm">
            受付再開までしばらくお待ちください。<br />
            {contactEmail && (
              <>緊急の場合は <a href={`mailto:${contactEmail}`} className="text-[#60a5fa] hover:underline">{contactEmail}</a> までご連絡ください。</>
            )}
          </p>
        </div>
      )}

      <div className="mt-8 glass-card rounded-2xl p-6">
        <h2 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase mb-4">活動情報</h2>
        <dl className="space-y-2 text-sm">
          {[
            { label: '活動日',   value: activityDay },
            { label: '活動地域', value: activityArea },
            { label: '対象',     value: activityTarget },
          ].map(({ label, value }) => (
            <div key={label} className="flex gap-3">
              <dt className="text-[#64748b] w-20 shrink-0">{label}</dt>
              <dd className="text-[#94a3b8]">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
