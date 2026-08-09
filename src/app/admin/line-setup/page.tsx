import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { SubmitButton } from '@/components/SubmitButton'

export const dynamic = 'force-dynamic'

const WEBHOOK_URL = 'https://blitz-hp.vercel.app/api/line/webhook'

async function saveGroupIds(formData: FormData) {
  'use server'
  const teamId  = String(formData.get('teamLineGroupId')  ?? '').trim()
  const adminId = String(formData.get('adminLineGroupId') ?? '').trim()

  await Promise.all([
    prisma.setting.upsert({
      where: { key: 'teamLineGroupId' },
      create: { key: 'teamLineGroupId', value: teamId },
      update: { value: teamId },
    }),
    prisma.setting.upsert({
      where: { key: 'adminLineGroupId' },
      create: { key: 'adminLineGroupId', value: adminId },
      update: { value: adminId },
    }),
  ])
  revalidatePath('/admin/line-setup')
}

export default async function LineSetupPage() {
  const tokenSet = !!process.env.LINE_CHANNEL_ACCESS_TOKEN

  const [teamSetting, adminSetting, detectedSetting] = await Promise.all([
    prisma.setting.findUnique({ where: { key: 'teamLineGroupId' } }).catch(() => null),
    prisma.setting.findUnique({ where: { key: 'adminLineGroupId' } }).catch(() => null),
    prisma.setting.findUnique({ where: { key: 'detectedLineGroupId' } }).catch(() => null),
  ])

  const teamGroupId    = teamSetting?.value    || process.env.LINE_GROUP_ID || ''
  const adminGroupId   = adminSetting?.value   || ''
  const detectedGroupId = detectedSetting?.value || ''

  const allReady = tokenSet && !!teamGroupId

  const inputClass = 'flex-1 bg-[#0d1f35] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm font-mono text-[#e2e8f0] focus:outline-none focus:border-[#2563eb]/60 min-w-0'

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin" className="text-[#64748b] hover:text-[#94a3b8]">← 管理</Link>
        <h1 className="text-2xl font-black text-[#e2e8f0]">LINE通知 設定</h1>
      </div>

      {/* ステータス */}
      <div className={`mb-8 px-5 py-4 rounded-2xl border ${
        allReady
          ? 'border-[#22c55e]/40 bg-[#22c55e]/5 text-[#22c55e]'
          : 'border-[#fbbf24]/30 bg-[#fbbf24]/5 text-[#fbbf24]'
      }`}>
        {allReady ? '✅ LINE通知の設定が完了しています！' : '⚠ グループIDを設定してください。'}
      </div>

      <div className="flex flex-col gap-4">

        {/* STEP 1: トークン確認 */}
        <div className={`glass-card rounded-2xl p-6 border ${tokenSet ? 'border-[#22c55e]/30' : 'border-[#1e3a5f]'}`}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${tokenSet ? 'bg-[#22c55e]/20 text-[#22c55e]' : 'bg-[#1e3a5f] text-[#64748b]'}`}>
              {tokenSet ? '✓' : '1'}
            </div>
            <h3 className={`font-bold ${tokenSet ? 'text-[#22c55e]' : 'text-[#e2e8f0]'}`}>LINEチャネルアクセストークン</h3>
          </div>
          {tokenSet ? (
            <p className="text-xs text-[#22c55e] pl-11">✓ 設定済み（Vercel環境変数）</p>
          ) : (
            <div className="pl-11">
              <p className="text-sm text-[#94a3b8] mb-2">
                <a href="https://developers.line.biz" target="_blank" rel="noopener noreferrer" className="text-[#60a5fa] underline">LINE Developers</a> でMessaging APIチャネルを作成し、
                チャネルアクセストークンをVercelの環境変数 <code className="text-[#fbbf24] bg-[#0d1b2a] px-1 rounded text-xs">LINE_CHANNEL_ACCESS_TOKEN</code> に設定してください。
              </p>
            </div>
          )}
        </div>

        {/* STEP 2: Webhook */}
        <div className="glass-card rounded-2xl p-6 border border-[#1e3a5f]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black shrink-0 bg-[#1e3a5f] text-[#64748b]">2</div>
            <h3 className="font-bold text-[#e2e8f0]">WebhookをLINE Developersに登録</h3>
          </div>
          <p className="text-sm text-[#94a3b8] mb-3 pl-11">LINE Developers → Webhook URL に以下を設定し「Webhookの利用」をオンにする：</p>
          <div className="ml-11 bg-[#0d1b2a] rounded-xl p-3 font-mono text-sm text-[#60a5fa] break-all select-all border border-[#1e3a5f]">
            {WEBHOOK_URL}
          </div>
        </div>

        {/* STEP 3: グループID設定（管理画面から） */}
        <div className="glass-card rounded-2xl p-6 border border-[#2563eb]/30">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black shrink-0 ${teamGroupId && adminGroupId ? 'bg-[#22c55e]/20 text-[#22c55e]' : 'bg-[#2563eb]/20 text-[#60a5fa]'}`}>
              {teamGroupId && adminGroupId ? '✓' : '3'}
            </div>
            <h3 className="font-bold text-[#e2e8f0]">グループIDを設定</h3>
          </div>

          {/* 自動検出のヒント */}
          {detectedGroupId && !teamSetting?.value && (
            <div className="ml-11 mb-4 rounded-xl border border-[#fbbf24]/30 bg-[#fbbf24]/5 p-3">
              <p className="text-xs text-[#fbbf24] mb-1">💡 Webhook経由でグループIDを自動検出しました</p>
              <p className="font-mono text-xs text-[#e2e8f0] break-all select-all">{detectedGroupId}</p>
              <p className="text-xs text-[#64748b] mt-1">↓ このIDを下のフォームにコピーしてください</p>
            </div>
          )}

          <form action={saveGroupIds} className="ml-11 flex flex-col gap-4">
            {/* チーム全体グループ */}
            <div>
              <label className="block text-xs font-bold text-[#94a3b8] mb-1">
                チーム全体グループID
                <span className="text-[#64748b] font-normal ml-2">（日程リマインドなどチーム向け通知）</span>
              </label>
              <div className="flex gap-2">
                <input name="teamLineGroupId" defaultValue={teamGroupId} placeholder="C0f8bc4742e28cd0..." className={inputClass} />
              </div>
              {teamGroupId && <p className="text-xs text-[#22c55e] mt-1">✓ 設定済み</p>}
            </div>

            {/* 管理者グループ */}
            <div>
              <label className="block text-xs font-bold text-[#94a3b8] mb-1">
                管理者グループID
                <span className="text-[#64748b] font-normal ml-2">（問い合わせ通知など管理者向け）</span>
              </label>
              <div className="flex gap-2">
                <input name="adminLineGroupId" defaultValue={adminGroupId} placeholder="C1d56e04faf2b9..." className={inputClass} />
              </div>
              {adminGroupId && <p className="text-xs text-[#22c55e] mt-1">✓ 設定済み</p>}
              {!adminGroupId && <p className="text-xs text-[#64748b] mt-1">未設定の場合はチーム全体グループに送信されます</p>}
            </div>

            <SubmitButton pendingLabel="保存中…" className="btn-primary py-2.5 text-sm">
              保存する
            </SubmitButton>
          </form>

          {/* グループIDの取得方法 */}
          <details className="ml-11 mt-4">
            <summary className="text-xs text-[#64748b] cursor-pointer hover:text-[#94a3b8]">グループIDの取得方法 ▶</summary>
            <ol className="text-xs text-[#64748b] space-y-1 list-decimal list-inside mt-2">
              <li>BotをLINEグループに招待</li>
              <li>そのグループで何かメッセージを送る</li>
              <li>このページを再読み込みすると上の「自動検出」に表示される</li>
              <li>コピーして上のフォームに貼り付けて保存</li>
            </ol>
          </details>
        </div>
      </div>

      <div className="mt-6 text-center">
        <Link href="/admin" className="text-sm text-[#64748b] hover:text-[#94a3b8]">← 管理ダッシュボードへ戻る</Link>
      </div>
    </div>
  )
}
