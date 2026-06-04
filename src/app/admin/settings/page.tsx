import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { SaveFormButton } from '@/components/SaveFormButton'

async function getSetting(key: string, fallback: string): Promise<string> {
  try {
    const s = await prisma.setting.findUnique({ where: { key } })
    return s?.value ?? fallback
  } catch {
    return fallback
  }
}

async function updateSettings(formData: FormData) {
  'use server'
  const raw = String(formData.get('qualPaPerGame') || '2.0')
  const val = parseFloat(raw)
  if (!isNaN(val) && val > 0) {
    await prisma.setting.upsert({
      where: { key: 'qualPaPerGame' },
      create: { key: 'qualPaPerGame', value: String(val) },
      update: { value: String(val) },
    })
  }
  revalidatePath('/stats')
  revalidatePath('/admin/settings')
}

async function updateContactRecipients(formData: FormData) {
  'use server'
  const value = String(formData.get('contactRecipients') || '').trim()
  await prisma.setting.upsert({
    where: { key: 'contactRecipients' },
    create: { key: 'contactRecipients', value },
    update: { value },
  })
  revalidatePath('/admin/settings')
}

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string }>
}) {
  const sp = await searchParams
  const savedValue = await getSetting('qualPaPerGame', '2.0')
  const contactRecipients = await getSetting('contactRecipients', '')
  const mailReady = !!(process.env.SMTP_USER && process.env.SMTP_PASS)
  // If a preset link was clicked, pre-fill with that value (but don't save yet)
  const displayValue = sp.preset ?? savedValue

  const PRESETS = [
    { label: '1.5（緩め）', value: '1.5' },
    { label: '2.0（標準）', value: '2.0' },
    { label: '2.5（厳しめ）', value: '2.5' },
    { label: '3.1（NPB）', value: '3.1' },
  ]

  return (
    <div className="pt-16 max-w-2xl mx-auto px-4 py-12">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin" className="text-[#64748b] hover:text-[#94a3b8]">← 管理</Link>
        <h1 className="text-2xl font-black text-[#e2e8f0]">成績設定</h1>
      </div>

      <div className="glass-card rounded-2xl p-6 mb-4">
        <h2 className="text-sm font-bold text-[#60a5fa] mb-1">規定打席の係数</h2>
        <p className="text-xs text-[#64748b] mb-5 leading-relaxed">
          規定打席 ＝ 総試合数 × 係数。この値以上の打席数がある選手が「規定到達者」として扱われます。<br />
          プロ野球(NPB)は 3.1、アマチュアは 2.0〜2.5 が一般的。
        </p>

        {/* Preset links */}
        <div className="flex flex-wrap gap-2 mb-5">
          <span className="text-xs text-[#475569] self-center">プリセット：</span>
          {PRESETS.map(({ label, value }) => (
            <Link
              key={value}
              href={`/admin/settings?preset=${value}`}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                displayValue === value
                  ? 'bg-[#2563eb] border-[#2563eb] text-white'
                  : 'border-[#1e3a5f] text-[#64748b] hover:border-[#2563eb]/50 hover:text-[#94a3b8]'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        <form action={updateSettings}>
          <div className="flex items-end gap-4 mb-4">
            <div className="flex-1">
              <label className="block text-xs text-[#64748b] mb-1.5">係数（PA / 試合）</label>
              <input
                type="number"
                name="qualPaPerGame"
                step="0.1"
                min="0.1"
                max="10"
                defaultValue={displayValue}
                required
                className="text-2xl font-black text-center"
              />
            </div>
            <div className="text-[#475569] text-sm pb-3">PA / 試合</div>
          </div>
          {savedValue !== displayValue && (
            <p className="text-xs text-[#fbbf24] mb-3">
              ⚠ 現在の保存値は {savedValue} です。「保存」を押すと反映されます。
            </p>
          )}
          <SaveFormButton label="保存する" />
        </form>
      </div>

      {/* 説明 */}
      <div className="glass-card rounded-xl p-4 text-xs text-[#64748b] space-y-1 mb-8">
        <div className="flex justify-between">
          <span>現在の保存値</span>
          <span className="text-[#60a5fa] font-bold">{savedValue} PA/試合</span>
        </div>
        <div className="flex justify-between">
          <span>例）試合数 20試合 × {savedValue} =</span>
          <span className="text-[#94a3b8] font-bold">{Math.floor(20 * parseFloat(savedValue))} 打席以上で規定到達</span>
        </div>
      </div>

      {/* 問い合わせ配信先 */}
      <div className="glass-card rounded-2xl p-6">
        <h2 className="text-sm font-bold text-[#60a5fa] mb-1">問い合わせの配信先メール</h2>
        <p className="text-xs text-[#64748b] mb-3 leading-relaxed">
          お問い合わせフォームの内容を送るメールアドレス。<br />
          <span className="text-[#94a3b8]">複数指定する場合は改行またはカンマ区切り</span>で入力してください。
        </p>
        <div className={`text-xs mb-4 px-3 py-2 rounded-lg border ${
          mailReady
            ? 'border-[#22c55e]/40 text-[#22c55e] bg-[#22c55e]/5'
            : 'border-[#fbbf24]/40 text-[#fbbf24] bg-[#fbbf24]/5'
        }`}>
          {mailReady
            ? '✅ メール送信は有効です（SMTP 設定済み）'
            : '⚠ メール送信は未設定です（環境変数 SMTP_USER / SMTP_PASS が必要）。設定されるまでは問い合わせを LINE グループに通知します。'}
        </div>
        <form action={updateContactRecipients}>
          <textarea
            name="contactRecipients"
            rows={4}
            defaultValue={contactRecipients}
            placeholder={"example1@gmail.com\nexample2@gmail.com"}
            className="w-full resize-y mb-3"
          />
          <SaveFormButton label="配信先を保存" />
        </form>
      </div>
    </div>
  )
}
