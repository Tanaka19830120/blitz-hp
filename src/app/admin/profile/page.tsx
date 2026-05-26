import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { PROFILE_DEFAULTS, getProfileSetting } from '@/lib/settings'

export const dynamic = 'force-dynamic'

async function saveProfile(formData: FormData) {
  'use server'

  const fields: Record<string, string> = {
    about:          String(formData.get('about') || '').trim(),
    info:           String(formData.get('info') || '').trim(),
    grounds:        String(formData.get('grounds') || '').trim(),
    retiredNumbers: String(formData.get('retiredNumbers') || '').trim(),
    records:        String(formData.get('records') || '').trim(),
  }

  for (const [key, value] of Object.entries(fields)) {
    await prisma.setting.upsert({
      where:  { key: `profile_${key}` },
      create: { key: `profile_${key}`, value },
      update: { value },
    })
  }

  revalidatePath('/profile')
  revalidatePath('/admin/profile')
}

export default async function AdminProfilePage() {
  const [about, info, grounds, retiredNumbers, records] = await Promise.all([
    getProfileSetting('profile_about'),
    getProfileSetting('profile_info'),
    getProfileSetting('profile_grounds'),
    getProfileSetting('profile_retiredNumbers'),
    getProfileSetting('profile_records'),
  ])

  const labelCls = 'block text-xs font-bold text-[#60a5fa] tracking-widest uppercase mb-1.5'
  const hintCls  = 'text-[#475569] normal-case font-normal text-[11px] ml-2'

  return (
    <div className="pt-16 max-w-3xl mx-auto px-4 py-12">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin" className="text-[#64748b] hover:text-[#94a3b8]">← 管理</Link>
        <h1 className="text-2xl font-black text-[#e2e8f0]">チームプロフィール編集</h1>
      </div>

      <form action={saveProfile} className="space-y-6">

        {/* チームについて */}
        <div className="glass-card rounded-2xl p-5">
          <label className={labelCls}>
            チームについて
            <span className={hintCls}>各段落を空行（改行2つ）で区切ってください</span>
          </label>
          <textarea
            name="about"
            defaultValue={about}
            rows={8}
            className="w-full bg-[#0d1b2a] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:border-[#2563eb] outline-none resize-y"
          />
        </div>

        {/* 基本情報 */}
        <div className="glass-card rounded-2xl p-5">
          <label className={labelCls}>
            基本情報
            <span className={hintCls}>1行に「ラベル: 内容」の形式で記入</span>
          </label>
          <textarea
            name="info"
            defaultValue={info}
            rows={7}
            className="w-full bg-[#0d1b2a] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:border-[#2563eb] outline-none resize-y font-mono"
            placeholder={PROFILE_DEFAULTS.info}
          />
          <p className="text-[10px] text-[#3b4f6a] mt-1.5">例: チーム名: BLITZ（ブリッツ）</p>
        </div>

        {/* 活動グラウンド */}
        <div className="glass-card rounded-2xl p-5">
          <label className={labelCls}>
            活動グラウンド
            <span className={hintCls}>1行に「ラベル: 内容」の形式で記入</span>
          </label>
          <textarea
            name="grounds"
            defaultValue={grounds}
            rows={5}
            className="w-full bg-[#0d1b2a] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:border-[#2563eb] outline-none resize-y font-mono"
            placeholder={PROFILE_DEFAULTS.grounds}
          />
        </div>

        {/* 永久欠番 */}
        <div className="glass-card rounded-2xl p-5">
          <label className={labelCls}>
            永久欠番
            <span className={hintCls}>カンマ区切りで入力（例: #6, #18）</span>
          </label>
          <input
            type="text"
            name="retiredNumbers"
            defaultValue={retiredNumbers}
            placeholder="#6, #18"
            className="w-full"
          />
        </div>

        {/* SDリーグ過去成績 */}
        <div className="glass-card rounded-2xl p-5">
          <label className={labelCls}>
            SDリーグ 過去成績
            <span className={hintCls}>1行に「年: 順位」の形式で記入（新しい年を上に）</span>
          </label>
          <textarea
            name="records"
            defaultValue={records}
            rows={6}
            className="w-full bg-[#0d1b2a] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:border-[#2563eb] outline-none resize-y font-mono"
            placeholder="2024: 1位&#10;2023: 3位"
          />
        </div>

        <button type="submit" className="btn-primary w-full py-2.5">
          プロフィールを保存
        </button>
      </form>
    </div>
  )
}
