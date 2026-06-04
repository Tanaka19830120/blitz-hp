import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { SaveFormButton } from '@/components/SaveFormButton'

export const dynamic = 'force-dynamic'

async function getSetting(key: string, fallback: string): Promise<string> {
  try {
    const s = await prisma.setting.findUnique({ where: { key } })
    return s?.value ?? fallback
  } catch {
    return fallback
  }
}

async function updateContactRecipients(formData: FormData) {
  'use server'
  const value = String(formData.get('contactRecipients') || '').trim()
  await prisma.setting.upsert({
    where: { key: 'contactRecipients' },
    create: { key: 'contactRecipients', value },
    update: { value },
  })
  revalidatePath('/admin/contact')
}

export default async function AdminContactPage() {
  const contactRecipients = await getSetting('contactRecipients', '')
  const mailReady = !!(process.env.SMTP_USER && process.env.SMTP_PASS)

  return (
    <div className="pt-16 max-w-2xl mx-auto px-4 py-12">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin" className="text-[#64748b] hover:text-[#94a3b8]">← 管理</Link>
        <h1 className="text-2xl font-black text-[#e2e8f0]">問い合わせ配信先</h1>
      </div>

      <div className="glass-card rounded-2xl p-6">
        <h2 className="text-sm font-bold text-[#60a5fa] mb-1">配信先メールアドレス</h2>
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
            : '⚠ メール送信は未設定です。Vercel に環境変数 SMTP_USER / SMTP_PASS を設定してください（設定方法は下記）。'}
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

      {/* メール送信のセットアップ手順 */}
      <div className="glass-card rounded-2xl p-6 mt-6 text-sm text-[#94a3b8] leading-relaxed">
        <h2 className="text-sm font-bold text-[#60a5fa] mb-3">メール送信の設定方法（Gmail・無料）</h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>送信に使う Gmail アカウントで <strong className="text-[#e2e8f0]">2段階認証</strong> を有効化する。</li>
          <li>Google アカウント →「セキュリティ」→「<strong className="text-[#e2e8f0]">アプリ パスワード</strong>」で16桁のパスワードを発行する。</li>
          <li>Vercel のプロジェクト → <strong className="text-[#e2e8f0]">Settings → Environment Variables</strong> に以下を登録：
            <div className="mt-2 bg-[#050a15] rounded-lg p-3 font-mono text-xs text-[#cbd5e1] space-y-1">
              <div>SMTP_USER = 送信元のGmailアドレス</div>
              <div>SMTP_PASS = 発行した16桁のアプリパスワード</div>
              <div className="text-[#475569]">SMTP_HOST = smtp.gmail.com （任意・既定値）</div>
              <div className="text-[#475569]">SMTP_PORT = 465 （任意・既定値）</div>
              <div className="text-[#475569]">SMTP_FROM = 差出人表示名/アドレス （任意）</div>
            </div>
          </li>
          <li>保存後に <strong className="text-[#e2e8f0]">再デプロイ</strong>（Vercel が自動で再ビルド）。</li>
          <li>このページの表示が「✅ メール送信は有効」になれば完了。上の配信先アドレスに届きます。</li>
        </ol>
        <p className="mt-3 text-xs text-[#64748b]">
          ※ 返信は届いたメールの「返信」で、問い合わせ者のアドレス宛にそのまま送れます。<br />
          ※ Gmail 以外の SMTP を使う場合は SMTP_HOST / SMTP_PORT を各サービスの値に変更してください。
        </p>
      </div>
    </div>
  )
}
