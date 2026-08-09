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
  const paRaw  = String(formData.get('qualPaPerGame')  || '2.0')
  const ipRaw  = String(formData.get('qualIpPerGame')  || '1.0')
  const paVal  = parseFloat(paRaw)
  const ipVal  = parseFloat(ipRaw)
  if (!isNaN(paVal) && paVal > 0) {
    await prisma.setting.upsert({
      where: { key: 'qualPaPerGame' },
      create: { key: 'qualPaPerGame', value: String(paVal) },
      update: { value: String(paVal) },
    })
  }
  if (!isNaN(ipVal) && ipVal > 0) {
    await prisma.setting.upsert({
      where: { key: 'qualIpPerGame' },
      create: { key: 'qualIpPerGame', value: String(ipVal) },
      update: { value: String(ipVal) },
    })
  }
  // 問い合わせ先メールアドレス
  const contactEmail = String(formData.get('contactEmail') || '').trim()
  await prisma.setting.upsert({
    where: { key: 'contactEmail' },
    create: { key: 'contactEmail', value: contactEmail },
    update: { value: contactEmail },
  })
  revalidatePath('/contact')
  revalidatePath('/stats')
  revalidatePath('/admin/settings')
}

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ presetPa?: string; presetIp?: string }>
}) {
  const sp = await searchParams
  const savedPa = await getSetting('qualPaPerGame', '2.0')
  const savedIp = await getSetting('qualIpPerGame', '1.0')
  const savedContactEmail = await getSetting('contactEmail', '')
  const displayPa = sp.presetPa ?? savedPa
  const displayIp = sp.presetIp ?? savedIp

  const PA_PRESETS = [
    { label: '1.5（緩め）', value: '1.5' },
    { label: '2.0（標準）', value: '2.0' },
    { label: '2.5（厳しめ）', value: '2.5' },
    { label: '3.1（NPB）', value: '3.1' },
  ]
  const IP_PRESETS = [
    { label: '0.5（緩め）', value: '0.5' },
    { label: '1.0（標準）', value: '1.0' },
    { label: '1.5（厳しめ）', value: '1.5' },
    { label: '2.0（NPB基準）', value: '2.0' },
  ]

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin" className="text-[#64748b] hover:text-[#94a3b8]">← 管理</Link>
        <h1 className="text-2xl font-black text-[#e2e8f0]">成績設定</h1>
      </div>

      <form action={updateSettings} className="flex flex-col gap-6">

        {/* 規定打席 */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-sm font-bold text-[#60a5fa] mb-1">規定打席の係数</h2>
          <p className="text-xs text-[#64748b] mb-4 leading-relaxed">
            規定打席 ＝ 総試合数 × 係数。打率ランキングの「規定到達者」判定に使用。<br />
            プロ野球(NPB)は 3.1、アマチュアは 2.0〜2.5 が一般的。
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-xs text-[#475569] self-center">プリセット：</span>
            {PA_PRESETS.map(({ label, value }) => (
              <Link key={value} href={`/admin/settings?presetPa=${value}&presetIp=${displayIp}`}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                  displayPa === value ? 'bg-[#2563eb] border-[#2563eb] text-white'
                    : 'border-[#1e3a5f] text-[#64748b] hover:border-[#2563eb]/50 hover:text-[#94a3b8]'
                }`}>{label}</Link>
            ))}
          </div>
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-xs text-[#64748b] mb-1.5">係数（PA / 試合）</label>
              <input type="number" name="qualPaPerGame" step="0.1" min="0.1" max="10"
                defaultValue={displayPa} required className="text-2xl font-black text-center" />
            </div>
            <div className="text-[#475569] text-sm pb-3">PA / 試合</div>
          </div>
          <div className="mt-3 text-xs text-[#475569]">
            例）20試合 × {displayPa} = <span className="text-[#60a5fa] font-bold">{Math.floor(20 * parseFloat(displayPa))} 打席</span>以上で規定到達
          </div>
          {savedPa !== displayPa && (
            <p className="text-xs text-[#fbbf24] mt-2">⚠ 現在の保存値は {savedPa} です</p>
          )}
        </div>

        {/* 規定投球回 */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-sm font-bold text-[#a78bfa] mb-1">規定投球回の係数</h2>
          <p className="text-xs text-[#64748b] mb-4 leading-relaxed">
            規定投球回 ＝ 総試合数 × 係数。投手成績ランキングの「規定到達者」判定に使用。<br />
            プロ野球(NPB)は 1試合あたり約 1回、アマチュアは 0.5〜1.0 が一般的。
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-xs text-[#475569] self-center">プリセット：</span>
            {IP_PRESETS.map(({ label, value }) => (
              <Link key={value} href={`/admin/settings?presetPa=${displayPa}&presetIp=${value}`}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                  displayIp === value ? 'bg-[#8b5cf6] border-[#8b5cf6] text-white'
                    : 'border-[#1e3a5f] text-[#64748b] hover:border-[#8b5cf6]/50 hover:text-[#94a3b8]'
                }`}>{label}</Link>
            ))}
          </div>
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-xs text-[#64748b] mb-1.5">係数（回 / 試合）</label>
              <input type="number" name="qualIpPerGame" step="0.1" min="0.1" max="10"
                defaultValue={displayIp} required className="text-2xl font-black text-center" />
            </div>
            <div className="text-[#475569] text-sm pb-3">回 / 試合</div>
          </div>
          <div className="mt-3 text-xs text-[#475569]">
            例）20試合 × {displayIp} = <span className="text-[#a78bfa] font-bold">{Math.floor(20 * parseFloat(displayIp))} 回</span>以上で規定到達
          </div>
          {savedIp !== displayIp && (
            <p className="text-xs text-[#fbbf24] mt-2">⚠ 現在の保存値は {savedIp} です</p>
          )}
        </div>

        <SaveFormButton label="保存する" />
      </form>
    </div>
  )
}
