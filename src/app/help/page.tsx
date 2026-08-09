import { auth } from '@/auth'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function Section({ title, emoji, children }: { title: string; emoji: string; children: React.ReactNode }) {
  return (
    <section className="glass-card rounded-2xl p-6 mb-5">
      <h2 className="text-lg font-bold text-[#e2e8f0] mb-3 flex items-center gap-2">
        <span>{emoji}</span>{title}
      </h2>
      <div className="text-sm text-[#94a3b8] leading-relaxed space-y-2">{children}</div>
    </section>
  )
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-[#1d4ed8] text-white text-xs font-bold flex items-center justify-center">{n}</span>
      <div className="flex-1 pt-0.5">{children}</div>
    </div>
  )
}

export default async function HelpPage() {
  const session = await auth()
  if (!session?.user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-black text-[#e2e8f0] mb-3">📖 使い方ガイド</h1>
        <p className="text-[#64748b] mb-6">使い方ガイドはメンバー専用です。ログインしてください。</p>
        <Link href="/login" className="btn-primary">ログイン</Link>
      </div>
    )
  }
  const isAdmin = (session.user as { role?: string }).role === 'ADMIN'

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-[#e2e8f0] mb-2">📖 使い方ガイド（メンバー向け）</h1>
        <p className="text-[#64748b]">BLITZ チームサイトの基本的な使い方をまとめています。</p>
        {isAdmin && (
          <Link href="/admin/help" className="inline-block mt-3 text-sm text-[#fbbf24] hover:underline">
            → 管理者向けガイドはこちら
          </Link>
        )}
      </div>

      <Section title="ログインについて" emoji="🔑">
        <p>ログインIDは<strong className="text-[#e2e8f0]">背番号</strong>、初期パスワードは<strong className="text-[#e2e8f0]">背番号を2回続けた数字</strong>です。</p>
        <p className="text-[#64748b]">例）背番号が <span className="font-mono text-[#60a5fa]">28</span> の場合 → ID: <span className="font-mono">28</span> ／ パスワード: <span className="font-mono">2828</span></p>
        <p>ログインすると、出欠登録・写真の閲覧/投稿ができるようになります。パスワードが分からない場合は管理者にリセットを依頼してください。</p>
      </Section>

      <Section title="日程の確認と出欠登録" emoji="📅">
        <p>上部メニュー「<strong className="text-[#e2e8f0]">日程・出欠</strong>」から、今後の試合・イベントを確認できます。</p>
        <div className="space-y-2 mt-2">
          <Step n={1}>「日程・出欠」を開く</Step>
          <Step n={2}>各試合の<strong className="text-[#e2e8f0]">出席 / 欠席 / 未定</strong>ボタンを押して出欠を登録</Step>
          <Step n={3}>登録すると「✅ 出欠を登録しました」と表示されます</Step>
        </div>
        <ul className="list-disc pl-5 mt-2 space-y-1 text-[#64748b]">
          <li><strong className="text-[#94a3b8]">📍 場所名</strong>をタップすると Google マップが開きます。</li>
          <li>同じ日に複数試合がある場合、出欠は<strong className="text-[#94a3b8]">まとめて登録</strong>されます。</li>
          <li>イベント（BBQ など）は「🎉 内容」で表示されます。</li>
          <li>備考欄に集合場所や持ち物などの連絡が書かれていることがあります。</li>
        </ul>
      </Section>

      <Section title="LINE のお知らせ" emoji="💬">
        <p>出欠リマインドやスタメン、試合結果は <strong className="text-[#e2e8f0]">LINE グループ</strong>にも届きます。</p>
        <p>LINE 内の <strong className="text-[#94a3b8]">🗺 地図リンク</strong>からも会場を確認できます。出欠は LINE のリンク（👉 日程ページ）から登録してください。</p>
      </Section>

      <Section title="試合結果・成績を見る" emoji="⚾">
        <p>メニュー「<strong className="text-[#e2e8f0]">試合結果</strong>」で過去の試合一覧、各試合の「詳細」で打者・投手成績を確認できます。</p>
        <ul className="list-disc pl-5 mt-2 space-y-1 text-[#64748b]">
          <li>打者成績は<strong className="text-[#94a3b8]">イニングごとの結果（安・二安・本・打点 など）</strong>と、その日の合計（打数・安打・打率・打点・盗塁・四球 ほか）を表示します。</li>
          <li>選手名をタップすると、その選手のページに移動します。</li>
          <li>メニュー「<strong className="text-[#e2e8f0]">成績</strong>」では年度別／通算の個人成績とランキングが見られます（ランキング見出しから全順位へ）。</li>
        </ul>
      </Section>

      <Section title="写真アルバム" emoji="📷">
        <p>メニュー「<strong className="text-[#e2e8f0]">写真</strong>」は<strong className="text-[#e2e8f0]">メンバー専用</strong>です。試合・イベントの写真を共有できます。</p>
        <div className="space-y-2 mt-2">
          <Step n={1}>「写真」を開く</Step>
          <Step n={2}>「アルバムを作成」で<strong className="text-[#e2e8f0]">日付とタイトル</strong>（例: 6/14 BBQ）を入れて作成</Step>
          <Step n={3}>アルバムを開き「📷 写真を追加」で<strong className="text-[#e2e8f0]">複数枚</strong>まとめてアップロード</Step>
        </div>
        <ul className="list-disc pl-5 mt-2 space-y-1 text-[#64748b]">
          <li>写真は自動で圧縮して保存されます（容量節約）。</li>
          <li>自分が投稿した写真は自分で削除できます（その他の削除は管理者）。</li>
          <li>写真をタップすると拡大表示します。</li>
        </ul>
      </Section>

      <Section title="お問い合わせ" emoji="✉️">
        <p>体験参加・入団希望などは、メニュー「<strong className="text-[#e2e8f0]">お問い合わせ</strong>」から送信できます（チーム代表に届きます）。</p>
      </Section>

      <Section title="困ったときは" emoji="🆘">
        <ul className="list-disc pl-5 space-y-1 text-[#64748b]">
          <li>ログインできない／パスワードを忘れた → 管理者にリセットを依頼</li>
          <li>背番号・名前・写真を変えたい → 管理者に連絡</li>
          <li>成績の間違いに気づいた → 管理者に連絡（修正できます）</li>
        </ul>
      </Section>
    </div>
  )
}
