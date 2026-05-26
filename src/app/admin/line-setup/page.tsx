import { prisma } from '@/lib/prisma'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const WEBHOOK_URL = 'https://blitz-hp.vercel.app/api/line/webhook'
const VERCEL_ENV_URL = 'https://vercel.com/tanaka-s-projects6/blitz-hp/settings/environment-variables'

export default async function LineSetupPage() {
  const tokenSet   = !!process.env.LINE_CHANNEL_ACCESS_TOKEN
  const groupIdEnv = process.env.LINE_GROUP_ID ?? ''
  const cronSet    = !!process.env.CRON_SECRET

  // Webhook 経由で自動取得したグループID
  let detectedGroupId = ''
  try {
    const s = await prisma.setting.findUnique({ where: { key: 'detectedLineGroupId' } })
    detectedGroupId = s?.value ?? ''
  } catch {}

  const groupIdReady = !!(groupIdEnv || detectedGroupId)
  const allReady     = tokenSet && groupIdReady

  function Step({
    num, title, done, children,
  }: {
    num: number
    title: string
    done: boolean
    children: React.ReactNode
  }) {
    return (
      <div className={`glass-card rounded-2xl p-6 border ${done ? 'border-[#22c55e]/30' : 'border-[#1e3a5f]'}`}>
        <div className="flex items-start gap-4">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black shrink-0 mt-0.5 ${
              done ? 'bg-[#22c55e]/20 text-[#22c55e]' : 'bg-[#1e3a5f] text-[#64748b]'
            }`}
          >
            {done ? '✓' : num}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`font-bold mb-3 ${done ? 'text-[#22c55e]' : 'text-[#e2e8f0]'}`}>{title}</h3>
            {children}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-16 max-w-2xl mx-auto px-4 py-12">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin" className="text-[#64748b] hover:text-[#94a3b8]">← 管理</Link>
        <h1 className="text-2xl font-black text-[#e2e8f0]">LINE通知 セットアップ</h1>
      </div>

      {/* 全体ステータス */}
      <div
        className={`mb-8 px-5 py-4 rounded-2xl border ${
          allReady
            ? 'border-[#22c55e]/40 bg-[#22c55e]/5 text-[#22c55e]'
            : 'border-[#fbbf24]/30 bg-[#fbbf24]/5 text-[#fbbf24]'
        }`}
      >
        {allReady
          ? '✅ LINE通知の設定が完了しています！管理ダッシュボードから送信できます。'
          : '⚠ あと少しで設定完了です。下の手順を進めてください。'}
      </div>

      <div className="flex flex-col gap-4">
        {/* STEP 1 */}
        <Step num={1} title="LINE Developers でチャネルを作成" done={tokenSet}>
          <ol className="text-sm text-[#94a3b8] space-y-1.5 list-decimal list-inside mb-3">
            <li>
              <a href="https://developers.line.biz" target="_blank" rel="noopener noreferrer"
                className="text-[#60a5fa] underline">developers.line.biz</a>
              {' '}→ LINEアカウントでログイン
            </li>
            <li>「プロバイダー作成」→「チャネル作成」→ <strong className="text-[#e2e8f0]">Messaging API</strong> を選択</li>
            <li>「Messaging API設定」タブ → 「チャネルアクセストークン（長期）」→「発行」</li>
            <li>トークンをコピー → 下の Vercel 設定画面で <code className="text-[#fbbf24] bg-[#0d1b2a] px-1 rounded">LINE_CHANNEL_ACCESS_TOKEN</code> に貼り付け</li>
          </ol>
          {tokenSet && (
            <p className="text-xs text-[#22c55e]">✓ LINE_CHANNEL_ACCESS_TOKEN が設定されています</p>
          )}
        </Step>

        {/* STEP 2 */}
        <Step num={2} title="BotをグループLINEに招待 → グループIDを自動取得" done={groupIdReady}>
          <ol className="text-sm text-[#94a3b8] space-y-1.5 list-decimal list-inside mb-4">
            <li>LINE Developers → 「Messaging API設定」→「友だち追加用QRコード」でBotを友だち追加</li>
            <li>BLITZのグループLINEにそのBotを<strong className="text-[#e2e8f0]">招待</strong></li>
            <li>LINE Developers → Webhook URL に以下を入力して「更新」:</li>
          </ol>

          <div className="bg-[#0d1b2a] rounded-xl p-3 mb-4 font-mono text-sm text-[#60a5fa] break-all select-all border border-[#1e3a5f]">
            {WEBHOOK_URL}
          </div>

          <ol className="text-sm text-[#94a3b8] space-y-1.5 list-decimal list-inside mb-4" start={4}>
            <li>「Webhookの利用」を<strong className="text-[#e2e8f0]">オン</strong>にする</li>
            <li>グループLINEで<strong className="text-[#e2e8f0]">何かメッセージを送る</strong>（Bot宛でなくてOK）</li>
            <li>このページを再読み込みするとグループIDが表示されます</li>
          </ol>

          {detectedGroupId ? (
            <div className="rounded-xl border border-[#22c55e]/40 bg-[#22c55e]/5 p-4">
              <p className="text-xs text-[#22c55e] mb-1">✓ グループIDを自動検出しました！</p>
              <p className="font-mono text-sm text-[#e2e8f0] break-all select-all">{detectedGroupId}</p>
              {!groupIdEnv && (
                <p className="text-xs text-[#fbbf24] mt-2">
                  ↓ このIDを下の Vercel 設定画面で <code className="bg-[#0d1b2a] px-1 rounded">LINE_GROUP_ID</code> にコピーしてください
                </p>
              )}
            </div>
          ) : groupIdEnv ? (
            <p className="text-xs text-[#22c55e]">✓ LINE_GROUP_ID が設定されています</p>
          ) : (
            <p className="text-xs text-[#64748b]">
              ⏳ グループLINEでメッセージを送ると、ここにグループIDが表示されます
            </p>
          )}
        </Step>

        {/* STEP 3 */}
        <Step
          num={3}
          title="Vercel に環境変数を設定して再デプロイ"
          done={tokenSet && groupIdReady && cronSet}
        >
          <p className="text-sm text-[#94a3b8] mb-3">
            以下のリンクから Vercel の環境変数設定を開き、3つの変数を追加してください。
          </p>

          <a
            href={VERCEL_ENV_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mb-5 px-4 py-2 rounded-xl border border-[#2563eb]/50 text-[#60a5fa] text-sm hover:bg-[#2563eb]/10 transition-all"
          >
            🔗 Vercel 環境変数設定を開く →
          </a>

          <div className="space-y-3">
            {[
              {
                key: 'LINE_CHANNEL_ACCESS_TOKEN',
                value: tokenSet ? '（設定済み）' : 'STEP1 で発行したトークン',
                done: tokenSet,
              },
              {
                key: 'LINE_GROUP_ID',
                value: groupIdEnv
                  ? '（設定済み）'
                  : detectedGroupId
                  ? detectedGroupId
                  : 'STEP2 でこのページに表示されたID',
                done: groupIdReady,
              },
              {
                key: 'CRON_SECRET',
                value: cronSet
                  ? '（設定済み）'
                  : 'f58b3056a5b1eefe23ba799451f5484885bad1985914e8e1bb06fce4c8e5415f',
                done: cronSet,
              },
            ].map(({ key, value, done }) => (
              <div
                key={key}
                className={`rounded-xl p-3 border ${
                  done ? 'border-[#22c55e]/30 bg-[#22c55e]/5' : 'border-[#1e3a5f] bg-[#0d1b2a]'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs ${done ? 'text-[#22c55e]' : 'text-[#fbbf24]'}`}>
                    {done ? '✓' : '○'}
                  </span>
                  <code className="text-sm text-[#e2e8f0]">{key}</code>
                </div>
                <p className={`text-xs pl-5 font-mono break-all select-all ${done ? 'text-[#22c55e]' : 'text-[#64748b]'}`}>
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-5 p-4 rounded-xl bg-[#0d1b2a] border border-[#1e3a5f]">
            <p className="text-xs text-[#64748b] mb-2">設定後、ターミナルで再デプロイ:</p>
            <code className="text-sm text-[#60a5fa] select-all">vercel --prod</code>
          </div>
        </Step>
      </div>

      <div className="mt-6 text-center">
        <Link href="/admin" className="text-sm text-[#64748b] hover:text-[#94a3b8]">
          ← 管理ダッシュボードへ戻る
        </Link>
      </div>
    </div>
  )
}
