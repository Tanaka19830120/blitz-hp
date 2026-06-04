import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { getLineContacts } from '@/lib/settings'
import { SubmitButton } from '@/components/SubmitButton'

export const dynamic = 'force-dynamic'

async function saveRecipients(formData: FormData) {
  'use server'
  // チェックされた userId のみ通知先に
  const selected = formData.getAll('recipient').map(String)
  await prisma.setting.upsert({
    where:  { key: 'lineContactRecipients' },
    create: { key: 'lineContactRecipients', value: JSON.stringify(selected) },
    update: { value: JSON.stringify(selected) },
  })
  revalidatePath('/admin/contact')
}

export default async function AdminContactPage() {
  const [contacts, selSetting] = await Promise.all([
    getLineContacts(),
    prisma.setting.findUnique({ where: { key: 'lineContactRecipients' } }),
  ])
  let selected: string[] = []
  try { selected = selSetting?.value ? JSON.parse(selSetting.value) : [] } catch { /* ignore */ }
  // 未選択（空）なら登録者全員が通知先
  const allWhenEmpty = selected.length === 0

  return (
    <div className="pt-16 max-w-2xl mx-auto px-4 py-12">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin" className="text-[#64748b] hover:text-[#94a3b8]">← 管理</Link>
        <h1 className="text-2xl font-black text-[#e2e8f0]">問い合わせ通知先（LINE）</h1>
      </div>

      {/* 登録手順 */}
      <div className="glass-card rounded-2xl p-6 mb-6 text-sm text-[#94a3b8] leading-relaxed">
        <h2 className="text-sm font-bold text-[#60a5fa] mb-3">受け取りたい人の登録方法</h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>BLITZ の <strong className="text-[#e2e8f0]">LINE公式アカウント（ボット）を友だち追加</strong>する。</li>
          <li>そのトークに <strong className="text-[#e2e8f0]">「登録」</strong> とメッセージを送る。</li>
          <li>「✅ 登録しました」と返信が来たら、下の一覧に表示されます。</li>
        </ol>
        <p className="mt-3 text-xs text-[#64748b]">
          ※ 環境変数や再デプロイは不要。どの管理者でも自分のスマホ＋この画面だけで設定できます。
        </p>
      </div>

      {/* 通知先選択 */}
      <div className="glass-card rounded-2xl p-6">
        <h2 className="text-sm font-bold text-[#60a5fa] mb-1">通知先の選択</h2>
        <p className="text-xs text-[#64748b] mb-4">
          チェックした人に問い合わせ内容が LINE で届きます。
          {allWhenEmpty && <span className="text-[#fbbf24]">（未選択の場合は登録者全員に届きます）</span>}
        </p>

        {contacts.length === 0 ? (
          <p className="text-sm text-[#475569]">
            まだ登録者がいません。上の手順で「登録」を送ってください。送信後この画面を再読み込みすると表示されます。
          </p>
        ) : (
          <form action={saveRecipients} className="space-y-3">
            {contacts.map(c => (
              <label key={c.userId} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#0d1b2a] border border-[#1e3a5f] cursor-pointer">
                <input
                  type="checkbox"
                  name="recipient"
                  value={c.userId}
                  defaultChecked={allWhenEmpty || selected.includes(c.userId)}
                  className="w-4 h-4 accent-[#2563eb]"
                />
                <span className="text-sm text-[#e2e8f0]">{c.name}</span>
              </label>
            ))}
            <SubmitButton pendingLabel="保存中…" className="btn-primary w-full py-2.5 mt-2">通知先を保存</SubmitButton>
          </form>
        )}
      </div>
    </div>
  )
}
