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
      <span className="shrink-0 w-6 h-6 rounded-full bg-[#fbbf24] text-[#0d1b2a] text-xs font-bold flex items-center justify-center">{n}</span>
      <div className="flex-1 pt-0.5">{children}</div>
    </div>
  )
}

export default function AdminHelpPage() {
  return (
    <div className="pt-16 max-w-3xl mx-auto px-4 py-12">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin" className="text-[#64748b] hover:text-[#94a3b8]">← 管理</Link>
        <h1 className="text-2xl font-black text-[#e2e8f0]">🛠 管理者ガイド</h1>
      </div>
      <p className="text-[#64748b] mb-8 text-sm">チーム運営の操作手順をまとめています。管理メニューは管理者のみアクセスできます。</p>

      <Section title="全体の流れ" emoji="🗺">
        <p>ふだんの運営は、おおむね次の流れです。</p>
        <div className="space-y-2 mt-2">
          <Step n={1}><strong className="text-[#e2e8f0]">日程を追加</strong>（/admin/日程）</Step>
          <Step n={2}>試合前に<strong className="text-[#e2e8f0]">出欠リマインドを LINE 送信</strong>（/admin トップ）</Step>
          <Step n={3}>必要なら<strong className="text-[#e2e8f0]">スタメンを作成</strong>して LINE 配信（/admin/スタメン）</Step>
          <Step n={4}>試合後に<strong className="text-[#e2e8f0]">結果を入力</strong>（スコアシートを撮影して読み込み or 手入力）</Step>
          <Step n={5}>保存（必要なら<strong className="text-[#e2e8f0]">試合結果を LINE 配信</strong>）</Step>
        </div>
      </Section>

      <Section title="日程の管理" emoji="📅">
        <p className="text-[#94a3b8]">管理 → 日程の追加・編集</p>
        <ul className="list-disc pl-5 space-y-1 text-[#64748b]">
          <li>対戦相手・球場は<strong className="text-[#94a3b8]">マスタから選択</strong>（無ければ「その他（直接入力）」）。</li>
          <li>種別を「<strong className="text-[#94a3b8]">イベント</strong>」にすると対戦相手は不要になり、代わりに<strong className="text-[#94a3b8]">イベント内容</strong>（例: BBQ）を入力します。</li>
          <li>メモ・備考は改行可。LINE のお知らせにも記載されます。</li>
          <li>同じ日に2試合以上ある場合は「<strong className="text-[#94a3b8]">＋試合追加</strong>」で同日グループにできます。</li>
          <li>削除は確認ダイアログ付き。<strong className="text-[#94a3b8]">試合結果がある日程を削除すると、結果・個人成績も一緒に消えます</strong>（警告が出ます）。</li>
        </ul>
      </Section>

      <Section title="スタメンの作成と配信" emoji="📋">
        <p className="text-[#94a3b8]">管理 → スタメン</p>
        <div className="space-y-2 mt-1">
          <Step n={1}>対象の試合を選ぶ</Step>
          <Step n={2}>打順・守備位置・途中交代（前半/後半）を設定して<strong className="text-[#e2e8f0]">保存</strong></Step>
          <Step n={3}>必要なら<strong className="text-[#e2e8f0]">LINE にスタメンを配信</strong></Step>
        </div>
        <p className="mt-2">ここで保存したスタメンは、<strong className="text-[#94a3b8]">結果入力画面に自動でプリセット</strong>されます（打順・守備・交代）。</p>
        <p className="text-[#64748b]">※ 日程を削除して作り直すとスタメンが引き継がれない場合があります。その際は再登録してください。</p>
      </Section>

      <Section title="試合結果の入力（スコアシート読み込み）" emoji="⚾">
        <p className="text-[#94a3b8]">管理 → 試合結果を入力</p>
        <div className="space-y-2 mt-1">
          <Step n={1}>上部で<strong className="text-[#e2e8f0]">試合を選択</strong>（別の試合に切り替えると内容も切り替わります）</Step>
          <Step n={2}>スタメン登録済みなら打順・守備・選手が<strong className="text-[#e2e8f0]">プリセット</strong>されています</Step>
          <Step n={3}>「<strong className="text-[#e2e8f0]">シートから読み込み</strong>」でスコアシートを撮影/選択 → AI が各打席を読み取り</Step>
          <Step n={4}>読み取り結果を確認し、<strong className="text-[#e2e8f0]">間違いを手修正</strong></Step>
          <Step n={5}>BLITZの得点は読み取った打点が初期表示されます。<strong className="text-[#e2e8f0]">エラー等で打点の付かない得点はイニング欄を直接修正</strong></Step>
          <Step n={6}>相手チームのイニング得点を入力</Step>
          <Step n={7}><strong className="text-[#e2e8f0]">保存</strong>（必要なら LINE 送信にチェック）</Step>
        </div>
        <p className="font-bold text-[#94a3b8] mt-3">スコア記入のコツ</p>
        <ul className="list-disc pl-5 space-y-1 text-[#64748b]">
          <li>スマホ撮影は画質・サイズの制約で誤読が出ることがあります。<strong className="text-[#94a3b8]">読み取り後は必ず確認・修正</strong>してください（PCの方が精度良好）。</li>
          <li>記号の意味: O=アウト、1=単打、2=二塁打、3=三塁打、4=本塁打、B=四球、D=死球、S=犠打、X=犠飛。末尾の数字=打点、末尾 s=盗塁（例 <span className="font-mono">12</span> = 単打2打点）。1イニング複数打席はカンマ区切り。</li>
          <li>飛び入り参加は「打者追加」→選手選択。<strong className="text-[#94a3b8]">助っ人は選択肢の末尾</strong>にまとまっています。</li>
          <li>読み込んだスコアシートの写真は、結果入力画面の<strong className="text-[#94a3b8]">最下部に表示</strong>されます（管理者のみ閲覧）。</li>
        </ul>
        <p className="text-[#64748b] mt-2">現場用に「📄 記入シートを印刷」も使えます（QRコード付き）。</p>
      </Section>

      <Section title="試合結果の削除" emoji="🗑">
        <p>公開ページ「試合結果」一覧で、管理者には各試合に<strong className="text-[#94a3b8]">削除</strong>ボタンが出ます。</p>
        <p className="text-[#64748b]">押すと<strong className="text-[#94a3b8]">試合結果と個人成績のみ削除</strong>し、日程は残ります（再入力できます）。</p>
      </Section>

      <Section title="メンバー管理" emoji="👥">
        <p className="text-[#94a3b8]">管理 → メンバー</p>
        <ul className="list-disc pl-5 space-y-1 text-[#64748b]">
          <li>追加時、ログインID＝背番号、パスワード＝背番号×2 で自動設定。</li>
          <li><strong className="text-[#94a3b8]">背番号を変更するとログインID・パスワードも更新</strong>されます。</li>
          <li>「PW リセット」で初期パスワードに戻せます。</li>
          <li>権限（管理者/選手）のトグル、写真の登録ができます。</li>
        </ul>
      </Section>

      <Section title="助っ人（ゲスト）の扱い" emoji="🤝">
        <ul className="list-disc pl-5 space-y-1 text-[#64748b]">
          <li>過去データでは、<strong className="text-[#94a3b8]">当時背番号があった人＝元メンバー</strong>、<strong className="text-[#94a3b8]">背番号が無い人＝助っ人</strong>として扱います。</li>
          <li>助っ人は<strong className="text-[#94a3b8]">メンバー一覧・個人成績ランキングから除外</strong>され、試合結果では「助っ人」バッジで表示されます。</li>
          <li>もし助っ人扱いが間違っている場合は管理者に調整を依頼してください（データ修正可能）。</li>
        </ul>
      </Section>

      <Section title="LINE 連携" emoji="💬">
        <p className="text-[#94a3b8]">管理トップの各ボタン</p>
        <ul className="list-disc pl-5 space-y-1 text-[#64748b]">
          <li><strong className="text-[#94a3b8]">出欠リマインド</strong>／<strong className="text-[#94a3b8]">出欠表送信</strong>：プレビューを確認してから送信。送信成功でトースト表示。</li>
          <li>出欠リマインドには場所の地図リンク・備考が入ります。毎日の自動リマインドも動作します。</li>
          <li>スタメン・試合結果も LINE 配信できます。</li>
        </ul>
      </Section>

      <Section title="マスタ・各種設定" emoji="⚙️">
        <ul className="list-disc pl-5 space-y-1 text-[#64748b]">
          <li><strong className="text-[#94a3b8]">マスタ管理</strong>：対戦相手・球場の登録、試合種別ラベル、過去データからの取込。</li>
          <li><strong className="text-[#94a3b8]">成績設定</strong>：規定打席の係数（規定打席＝総試合数×係数）。</li>
          <li><strong className="text-[#94a3b8]">問い合わせの配信先メール</strong>：成績設定ページで複数アドレスを設定（改行/カンマ区切り）。メール送信には SMTP の環境変数設定が必要。未設定時は LINE に通知。</li>
          <li><strong className="text-[#94a3b8]">チームプロフィール</strong>：公開ページの紹介文などを編集。</li>
        </ul>
      </Section>

      <Section title="写真アルバム（管理）" emoji="📷">
        <ul className="list-disc pl-5 space-y-1 text-[#64748b]">
          <li>投稿はログインメンバー全員。<strong className="text-[#94a3b8]">写真の削除は管理者または投稿者本人</strong>、アルバム削除は管理者。</li>
          <li>容量節約のため自動圧縮されます。</li>
        </ul>
      </Section>

      <div className="text-center mt-8">
        <Link href="/help" className="text-sm text-[#60a5fa] hover:underline">→ メンバー向けガイドを見る</Link>
      </div>
    </div>
  )
}
