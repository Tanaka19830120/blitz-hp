# BLITZ HP — ソフトボールチーム公式サイト

**URL**: https://blitz-hp.vercel.app/

ソフトボールチーム BLITZ の公式ホームページ。試合スケジュール・出欠管理・スコアブック入力・成績集計・LINE通知などを統合したチーム運営支援アプリ。

---

## 目次

1. [技術スタック](#技術スタック)
2. [開発・デプロイ](#開発デプロイ)
3. [環境変数](#環境変数)
4. [DB スキーマ](#dbスキーマ)
5. [ページ一覧](#ページ一覧)
6. [スコアシート OCR システム](#スコアシート-ocr-システム)
7. [スコアブックデータ仕様](#スコアブックデータ仕様)
8. [LINE 連携](#line-連携)
9. [認証・権限](#認証権限)
10. [グローバルスタイル](#グローバルスタイル)
11. [ファイル構成](#ファイル構成)

---

## 技術スタック

| 項目 | 内容 |
|------|------|
| フレームワーク | Next.js 16.2.6 (App Router, Turbopack) |
| 言語 | TypeScript 5 |
| DB | Turso (libSQL / SQLite 互換) |
| ORM | Prisma 7.8.0 (`@prisma/adapter-libsql`) |
| 認証 | NextAuth v5 (`next-auth@5.0.0-beta.31`) |
| ストレージ | Vercel Blob (`@vercel/blob`) |
| CSS | Tailwind CSS v4 + カスタムクラス |
| AI | Anthropic Claude API (Vision) |
| ホスティング | Vercel (Production) |
| LINE | LINE Messaging API (プッシュ通知) |

---

## 開発・デプロイ

### ⚠️ 重要なルール

> **本番環境でしかテストできない。**
> `ANTHROPIC_API_KEY` 等の機密環境変数はすべて Vercel 側にのみ設定されており、
> ローカルでは `npm start` で正常動作しない。

### デプロイ手順（コード変更後は毎回必ず実施）

```bash
cd "C:\dev\02_soft_ball_homepage\blitz-hp"
vercel deploy --prod 2>&1
```

`Aliased https://blitz-hp.vercel.app` が表示されるまで待つ（約1〜2分）。

### ローカル開発（UI確認のみ）

```bash
npm run dev
```

API（OCR・LINE・認証など）は Vercel 環境でしか動作しない。

### ビルドコマンド

```bash
npm run build
# 内部的に: npx tsx prisma/migrate.ts && prisma generate && next build
```

マイグレーションは `build` の中で自動実行される。

---

## 環境変数

Vercel ダッシュボードで設定。ローカル `.env` は使用しない。

| 変数名 | 説明 |
|--------|------|
| `DATABASE_URL` | Turso の libSQL URL (`libsql://...`) |
| `TURSO_AUTH_TOKEN` | Turso 認証トークン |
| `AUTH_SECRET` | NextAuth の署名鍵（ランダム文字列） |
| `AUTH_URL` | 本番 URL (`https://blitz-hp.vercel.app`) |
| `ANTHROPIC_API_KEY` | Claude API キー（OCR 用） |
| `ANTHROPIC_MODEL` | 使用モデル（省略時: `claude-opus-4-5`） |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Bot チャンネルアクセストークン |
| `LINE_GROUP_ID` | 送信先 LINE グループ ID（未設定時は DB の `detectedLineGroupId` を使用） |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob トークン |

---

## DB スキーマ

### User

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | String (cuid) | PK |
| name | String | 選手名 |
| email | String | ユニーク。ログイン用 |
| password | String | bcrypt ハッシュ |
| role | Role | `ADMIN` / `PLAYER` |
| number | Int? | 背番号 |
| position | String? | 守備位置 |
| photoUrl | String? | プロフィール写真 URL |

### Schedule

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | String (cuid) | PK |
| date | DateTime | 試合日 |
| opponent | String | 対戦相手 |
| location | String | 球場 |
| type | GameType | `REGULAR` / `PRACTICE` / `TOURNAMENT` / `EVENT` |
| meetTime | String? | 集合時間 |
| startTime | String? | 開始時間 |
| note | String? | メモ |
| dayGroupId | String? | 同日複数試合グループ ID（同値のレコードを1カードで表示） |

### Game

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | String (cuid) | PK |
| scheduleId | String | FK → Schedule（ユニーク） |
| ourScore | Int | BLITZ 得点 |
| opponentScore | Int | 相手得点 |
| result | GameResult | `WIN` / `LOSE` / `DRAW` |
| note | String? | コメント |
| inningScores | String? | JSON: `{"blitz":[0,1,2],"opponent":[1,0,0]}` |
| scorebook | String? | JSON: ScoreBookData |
| scorePhoto | String? | Vercel Blob URL（スコア写真） |
| teamsOneId | String? | Teams One 連携 ID |

### GameStat（打者成績）

| フィールド | 型 |
|-----------|-----|
| atBats, hits, doubles, triples, homeRuns | Int |
| rbi, runs, stolenBases | Int |
| strikeouts, walks, hitByPitch | Int |
| sacrificeBunts, sacrificeFlies, plateAppearances | Int |
| position | String? |
| battingOrder | Int? |

### PitchingStat（投手成績）

| フィールド | 型 |
|-----------|-----|
| decision | String? | `勝` / `負` / `S` / `H` / null |
| innings | String | 例: `"5"`, `"5回0/3"` |
| pitches | Int |
| runsAllowed, earnedRuns, hitsAllowed | Int |
| strikeouts, walks | Int |

### Attendance

| フィールド | 型 |
|-----------|-----|
| status | AttendanceStatus | `ATTENDING` / `ABSENT` / `PENDING` / `MAYBE` |
| note | String? |

### Lineup

スケジュール別のスタメン情報。`battingOrder` が付与された選手が打順入り。

### Setting

汎用 KV ストア。

| キー例 | 値 |
|--------|-----|
| `lineupData_{scheduleId}` | LineupData JSON（打順・守備位置の新形式） |
| `detectedLineGroupId` | LINE グループ ID（Webhook から自動検出） |

---

## ページ一覧

### 公開ページ（認証不要）

| URL | 内容 |
|-----|------|
| `/` | トップページ（チーム紹介・最新試合結果） |
| `/schedule` | 試合スケジュール一覧 |
| `/results` | 試合結果一覧 |
| `/results/[id]` | 試合結果詳細（イニングスコア・個人成績） |
| `/members` | メンバー一覧 |
| `/members/[id]` | 選手個人ページ（通算成績） |
| `/stats` | チーム成績一覧 |
| `/contact` | お問い合わせ |
| `/login` | ログイン |

### 管理ページ（要ログイン）

| URL | 内容 |
|-----|------|
| `/admin` | 管理トップ（スケジュール一覧・出欠・LINE 送信） |
| `/admin/schedule` | スケジュール管理（作成・編集・削除・dayGroup設定） |
| `/admin/members` | メンバー管理（追加・編集・削除） |
| `/admin/game` | 試合入力（スコア・スコアブック・個人成績） |
| `/admin/lineup` | スタメン・打順編集 |
| `/admin/line-setup` | LINE Webhook 設定確認 |
| `/admin/masters` | マスタ設定（将来拡張用） |
| `/admin/profile` | 自分のプロフィール編集 |
| `/admin/settings` | アプリ設定 |
| `/admin/scorebook-sheet` | スコア記入シート（印刷用 PDF） |

### API

| URL | 内容 |
|-----|------|
| `/api/auth/[...nextauth]` | NextAuth ハンドラ |
| `/api/ocr-scorebook` | スコアシート OCR（Anthropic Vision） |
| `/api/upload-image` | プロフィール写真アップロード（Vercel Blob） |
| `/api/upload-score-photo` | スコア写真アップロード（Vercel Blob） |
| `/api/line/webhook` | LINE Webhook 受信（グループ ID 自動検出） |
| `/api/line/test` | LINE テスト送信 |
| `/api/cron/line-reminder` | リマインド自動送信（Cron） |

---

## スコアシート OCR システム

手書きスコア用紙を写真撮影 → AI 自動読み取りする機能。

### 全体フロー

```
[スコア用紙印刷] → [手書き記入] → [スマホ撮影] → [📷 シートから読み込み]
     ↓                   ↓クライアント JS                ↓サーバー API
/admin/scorebook-sheet  cellExtractor.ts           /api/ocr-scorebook
```

1. **印刷**: `/admin/scorebook-sheet?scheduleId=xxx` → ブラウザ印刷（A4）
2. **撮影**: 記入済み用紙を写真撮影
3. **クライアント処理**: `cellExtractor.ts` がセル画像を切り出し
4. **AI 読み取り**: Anthropic Vision API が各サブ画像の1文字を OCR
5. **反映**: エディタのセルに自動入力

---

### スコア記入シート仕様（`/admin/scorebook-sheet`）

#### レイアウト（A4 縦、余白 6mm）

```
[TL●]  タイトル / 日付・vs・球場・集合・開始  [TR●][QR]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
イニングスコア表（先攻/後攻、1〜7回）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
スコアブック表（打順1〜9行 × 7イニング列）

  │打順│番│名前  │守│  1  │  2  │  3  │  4  │  5  │  6  │  7  │打│安│点│盗│四│

  各イニングセル（14mm高）:
  ┌─────────────┬──────┐
  │  1打席コード  │ 打点 │  ← ab1  7mm高
  ├─────────────┼──────┤
  │  2打席コード  │ 打点 │  ← ab2  7mm高
  └─────────────┴──────┘
  左部（ab-left）: 幅 70% — 打撃コード手書き欄
  右部（ab-right）: 幅 30% — 打点数字欄（背景 #efefef）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
投手記録（3行）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[BL●]  7回戦 BLITZ HP スコア記入シート  [BR●]
```

#### 列幅比率

| 列 | 幅 |
|----|-----|
| 打順 | 4.5% |
| 番（背番号） | 4% |
| 名前 | 15% |
| 守（守備位置） | 5% |
| イニング列 × 7 | 残り ÷ 7 ≈ 8.07% 各 |
| 統計 5列（打安点盗四） | 3% 各 |

#### CSS クラス（イニングセル）

```css
.inn-cell  { display: flex; flex-direction: column; min-height: 14mm; }
.ab1, .ab2 { height: 7mm; min-height: 7mm; display: flex; flex-shrink: 0; }
.ab2       { border-top: 0.5pt dashed #555; }
.ab-left   { flex: 1; min-width: 0; }
.ab-right  { width: 30%; flex-shrink: 0;
             border-left: 1.2pt solid #555; background: #efefef; }
```

`height: 7mm; min-height: 7mm; flex-shrink: 0` の明示が必要。  
`flex: 1` のみだとテーブルセル内のサイズが循環依存になり等分にならない。

#### ターゲットマーカー（計8個）

OCR の基準点として四隅と打者グリッド四隅に印刷される特殊記号。

**外角マーカー（TL / TR / BL / BR）— 7mm×7mm**

```
bull's-eye 形状:
  外枠 2mm 黒 → 白リング → 中心点 1.5mm×1.5mm 黒
```

紙座標（A4 余白 6mm 基準、単位: mm / 紙サイズ mm）:

| 位置 | x (÷210) | y (÷297) |
|------|-----------|-----------|
| TL | 8.5/210 = 0.04048 | 9.0/297 = 0.03030 |
| TR | 201.5/210 = 0.95952 | 9.0/297 = 0.03030 |
| BL | 8.5/210 = 0.04048 | 288.5/297 = 0.97138 |
| BR | 201.5/210 = 0.95952 | 288.5/297 = 0.97138 |

TL y の計算: `6mm 余白 + 0.5mm marginTop + 3.5mm（マーカー中心）= 9mm`

**内部マーカー（打者グリッド四隅）— 4mm×4mm**

```
bull's-eye 形状:
  外枠 1mm 黒 → 白リング → 中心点 0.8mm×0.8mm 黒
```

セルの絶対コーナーに `position: absolute; top/right/bottom/left: 0` で配置。
マーカー中心は各コーナーから 2mm 内側。

紙座標（`INNER_PAPER` 定数）:

```typescript
const INNER_PAPER = {
  left:  TMPL.innStart + 2/210,   // 0.2970 + 0.00952 = 0.3065
  right: TMPL.innEnd   - 2/210,   // 0.8300 - 0.00952 = 0.8205
  top:   TMPL.tableTop + 2/297,   // 0.1430 + 0.00673 = 0.1497
  bot:   TMPL.tableTop + 9×0.0472 - 2/297,  // ≈ 0.5619
}
```

---

### cellExtractor.ts — セル切り出しライブラリ

ブラウザ上で実行（Canvas API 使用）。Node.js では動作しない。

#### テンプレート定数（`TMPL`）

```typescript
const TMPL = {
  innStart:     0.297,   // イニング列左端 / 紙幅
  innEnd:       0.830,   // イニング列右端 / 紙幅
  tableTop:     0.143,   // 打者行上端 / 紙高
  rowHeight:    0.0472,  // 14mm / 297mm
  templateInns: 7,       // 常に7列分スキャン（実際の innings 状態に依らない）
  batters:      9,
  abLeftRatio:  0.70,    // ab-left の幅比率
}

export const TEMPLATE_INNINGS = 7
```

**`TEMPLATE_INNINGS` を export する理由**:  
`ScoreBookEditor` の `innings` state は 5〜7 可変。セル切り出しは常に7列分スキャンしないと、  
6回目・7回目が読まれない。`extractCellsFromImage(file, TEMPLATE_INNINGS)` と呼ぶこと。

#### 処理フロー

```
① stretchContrastInPlace()   — ヒストグラム 2%〜98% を 0〜255 に伸長
② findCornerMarkers()        — 画像四隅 16% 領域で外角マーカー検出
③ findInnerMarkers()         — 外角 UV 予測位置 ±6% 領域で内部マーカー検出
④ gridRef 計算               — 内部マーカーで精密化 or TMPL フォールバック
⑤ extractQuad()              — バイリニア補間で各サブセル画像を抽出
⑥ hasContent()               — 空セル判定（darkRatio < 3.5% → スキップ）
⑦ デバッグ画像生成           — マーカー位置・グリッド重ねた確認用画像
```

#### `findTargetMarker` — 3ゾーン検出アルゴリズム

旧 `findHollowSquareMarker`（2ゾーン: outerR − innerR）を置き換え。  
中心点の存在を検出することで、テーブル罫線・QR コードとの誤検出を防ぐ。

```
スコア = outerR × (1 - middleR) × centerR

  outerR:  外リング内の暗ピクセル比率  （高 → 外枠が黒い）
  middleR: 中間ゾーンの暗ピクセル比率  （低 → リングが白い）
  centerR: 中心ゾーンの暗ピクセル比率  （高 → 中心点が黒い）
```

早期棄却: `outerR < 0.25` または `middleR > 0.60`

| 用途 | outerFrac | centerFrac | markerFrac | minScore |
|------|-----------|------------|------------|---------|
| 外角マーカー 7mm | 0.286 (2mm/7mm) | 0.214 (1.5mm/7mm) | 0.033 | 0.06 |
| 内部マーカー 4mm | 0.25 (1mm/4mm) | 0.20 (0.8mm/4mm) | 0.019 | 0.04 |

3つのウィンドウサイズ（×0.55 / ×1.0 / ×1.55）でスキャンし最高スコアを採用。

#### gridRef バイリニアマッピング

```typescript
// 内部マーカー検出成功時: 2mm オフセット分を逆算してグリッドコーナーを得る
const pxPerMmX = 横幅[px] / ((INNER_PAPER.right - INNER_PAPER.left) × 210)
const pxPerMmY = 縦幅[px] / ((INNER_PAPER.bot - INNER_PAPER.top) × 297)
gridRef = {
  tl: { x: inner.tl.x - 2×pxPerMmX, y: inner.tl.y - 2×pxPerMmY },
  tr: { x: inner.tr.x + 2×pxPerMmX, y: inner.tr.y - 2×pxPerMmY },
  bl: { x: inner.bl.x - 2×pxPerMmX, y: inner.bl.y + 2×pxPerMmY },
  br: { x: inner.br.x + 2×pxPerMmX, y: inner.br.y + 2×pxPerMmY },
}

// フォールバック（内部マーカー未検出）:
gridRef = { tl: uvToPhoto(markers, toU(TMPL.innStart), toV(TMPL.tableTop)), ... }
```

各セルの UV → 写真座標変換:

```typescript
u_left  = (inn - 1) / TMPL.templateInns
u_right = inn / TMPL.templateInns
u_mid   = u_left + TMPL.abLeftRatio × (u_right - u_left)  // 70% 分割点
v_top   = (order - 1) / TMPL.batters
v_bot   = order / TMPL.batters
v_mid   = (v_top + v_bot) / 2  // ab1/ab2 境界（等分）
```

---

### `/api/ocr-scorebook` — AI 読み取り API

認証必須（`session?.user` チェック）。

#### リクエスト（FormData）

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `image` | File | 元写真（イニングスコア読み取り用） |
| `innings` | string | イニング数 |
| `cells` | JSON string | `{ "1": { "1": {ab1, rbi1, ab2, rbi2}, ... }, ... }` |

`ab1` / `rbi1` / `ab2` / `rbi2` はいずれも `data:image/jpeg;base64,...` 形式の Data URL。

#### API コール構成

| コール | 内容 | max_tokens |
|--------|------|-----------|
| スコア読み取り | 元画像全体 × 1コール | 512 |
| 打者 OCR | 打順3行ずつ × 3コール（並列） | 512 × 3 |

合計最大 4 並列。モデルは `ANTHROPIC_MODEL` 環境変数（省略時 `claude-opus-4-5`）。

#### ルールベース組み立て（サーバー側）

AI は「1文字を返す」だけ。コード組み立ては `buildAtBat()` + `assembleCode()` で処理。

```
buildAtBat("1", "2")  → "12"    （単打2打点）
buildAtBat("1s", "2") → "12s"   （単打2打点盗塁）
buildAtBat("O", null) → "O"     （アウト）
assembleCode({ab1:"O", rbi1:null, ab2:"1", rbi2:"1"}) → "O,11"  （2打席目）
```

#### フォールバック（セル切り出しなし）

`cells` が空の場合、元画像全体を渡して全行一括読み取りする旧モードにフォールバック。  
精度は大幅に低下するが、クライアント側処理が失敗した場合の保険として残存。

---

## スコアブックデータ仕様

`Game.scorebook` に JSON で保存。`src/lib/scorebook.ts` で型定義・集計関数を提供。

### 型定義

```typescript
interface ScoreBookData {
  innings:        number
  batters:        BatterSlot[]
  pitchers:       PitcherSlot[]
  ourScore?:      number | null
  opponentScore?: number | null
  inningScores?:  { our: (number|null)[]; opponent: (number|null)[] }
  note?:          string
}

interface BatterSlot {
  order:      number             // 打順 1-9
  userId:     string             // User.id
  position?:  string             // 前半守備位置（日本語: 投捕一二三遊左中右指）
  position2?: string             // 後半守備位置
  cells:      Record<number, string>   // イニング番号 → 打撃コード文字列
  subs?:      BatterSub[]        // 交代選手リスト
}

interface BatterSub {
  fromInning: number             // 何回から交代
  userId:     string
  position?:  string
  cells:      Record<number, string>   // 実質未使用（元打者 cells を共有）
}

interface PitcherSlot {
  userId:       string
  innings:      string           // 投球回: "5" | "5.1" | "5回0/3"
  runs:         number           // 失点
  earnedRuns?:  number           // 自責点（失点と異なる場合のみ表示）
  hitsAllowed?: number
  strikeouts?:  number
  walks?:       number
  pitches?:     number
  decision:     string           // "" | "勝" | "負" | "S" | "H"
}
```

### 打撃コード体系

```
書式: <result>[<rbi>][s]

result コード:
  O = アウト（三振・ゴロ・フライを区別しない）
  1 = 単打   2 = 二塁打   3 = 三塁打   4 = 本塁打
  B = 四球   D = 死球
  S = 犠打（打席あり・打数なし）
  X = 犠飛（打席あり・打数なし）

  旧コード（後方互換のみ）: K=三振, G=ゴロ, F=フライ

rbi （数字）: 打点 1〜9
s   （末尾小文字）: 盗塁フラグ

例:
  "O"    = アウト
  "1"    = 単打
  "12"   = 単打・2打点
  "1s"   = 単打・盗塁
  "12s"  = 単打・2打点・盗塁
  "4"    = 本塁打（打点1自動付与）
  "41"   = 本塁打・1打点（ソロ HR 明示）
  "B"    = 四球
  "Bs"   = 四球・盗塁
  "S"    = 犠打

2打席目（同イニングで打順が2巡）: カンマ区切り
  "O,1"  = 1打席目アウト・2打席目単打
  "1s,O" = 1打席目単打盗塁・2打席目アウト
```

### 統計集計（`calcBatterStats`）

`cells` の全コードを集計して `BatterStats` を返す。  
交代がある場合は `fromInning` より前のイニングのみ元打者に集計。  
交代後は交代選手行のセルに同じ `b.cells` を共有して入力するが、  
集計時は `fromInning` 以降のみ交代選手に加算する。

---

## LINE 連携

### 機能一覧

| 機能 | トリガー | API |
|------|---------|-----|
| リマインド送信 | 管理者が `/admin` から手動送信 | `sendToLineGroup()` |
| 出欠集計送信 | 管理者が `/admin` から手動送信 | `sendTextsToLineGroup()` |
| 試合結果送信 | スコアブック保存時に「LINE送信」チェック | `sendTextsToLineGroup()` |
| 自動リマインド | Vercel Cron（`/api/cron/line-reminder`） | |

### グループ ID の検出

1. LINE Bot をチームの LINE グループに招待
2. グループ内で誰かがメッセージを送る
3. Webhook (`/api/line/webhook`) がグループ ID を受信
4. `Setting.detectedLineGroupId` に自動保存
5. 以降の送信はこの ID を使用（`LINE_GROUP_ID` 環境変数が優先）

### 試合結果 LINE フォーマット

```
⚾【BLITZ】試合結果
5月31日（土）vs 〇〇チーム
━━━━━━━━━━━━
BLITZ 5 ー 3 〇〇チーム

🏆 勝利！
（コメントがあれば）

━━━━━━━━━━━━
【打者成績】安打/打数
1番 田中: 2/3 (1打点・盗塁)
2番 山田: 1/2 (HR)
...

━━━━━━━━━━━━
【投手成績】
山本: 7回 3失点 5K [勝]
```

---

## 認証・権限

| 項目 | 内容 |
|------|------|
| 方式 | NextAuth v5 Credentials（メール + パスワード） |
| セッション | JWT（Edge Runtime 対応） |
| パスワード | bcrypt ハッシュ保存（`bcryptjs`） |
| ロール | `ADMIN` / `PLAYER` |
| ガード | `src/proxy.ts` Middleware で `/admin/*` を保護 |

管理者のみが使える操作:
- メンバー追加・削除
- スケジュール管理
- LINE 送信

---

## グローバルスタイル

`src/app/globals.css`。Tailwind v4 の `@theme inline` でカスタムカラーを定義。

### カラーパレット

```css
--color-blitz-bg:         #050a15  /* 最暗背景 */
--color-blitz-surface:    #0d1b2a  /* カード背景 */
--color-blitz-surface2:   #1a2744  /* 少し明るい面 */
--color-blitz-border:     #1e3a5f  /* 罫線 */
--color-blitz-blue:       #2563eb  /* プライマリ */
--color-blitz-blue-light: #60a5fa
--color-blitz-gold:       #d97706  /* アクセント */
--color-blitz-gold-light: #fbbf24
--color-blitz-text:       #e2e8f0
--color-blitz-muted:      #64748b
--color-blitz-win:        #16a34a
--color-blitz-lose:       #dc2626
--color-blitz-draw:       #ca8a04
```

### 共通クラス

| クラス | 用途 |
|--------|------|
| `.btn-primary` | 青グラデーション主ボタン |
| `.btn-secondary` | ボーダー系サブボタン |
| `.btn-gold` | 金色アクセントボタン |
| `.glass-card` | blur + 半透明カード |
| `.text-gradient` | 青→金グラデーションテキスト |
| `.hero-bg` | トップページ背景 |
| `.badge-win/lose/draw` | 結果バッジ |
| `.badge-attending/absent/pending` | 出欠バッジ |

### フォーム要素リセット

`@layer base` で `input / select / textarea` をダークテーマ（背景 `#0d1b2a`）に統一。  
`type="checkbox"` / `radio` は除外。

### 印刷制御

```css
@media print {
  nav, footer { display: none !important; }
}
```

スコアシートページには別途 `<style>` タグで以下を適用:

```css
@page { size: A4 portrait; margin: 6mm; }
* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
html, body { margin: 0 !important; background: white !important; }
.no-print { display: none !important; }
```

---

## ファイル構成

```
src/
├── app/
│   ├── admin/
│   │   ├── game/page.tsx              試合入力（スコアブックエディタ）
│   │   ├── lineup/page.tsx            スタメン・打順編集
│   │   ├── members/page.tsx           メンバー管理
│   │   ├── schedule/page.tsx          スケジュール管理
│   │   ├── scorebook-sheet/page.tsx   スコア記入シート（印刷用）
│   │   ├── settings/page.tsx          アプリ設定
│   │   └── page.tsx                   管理トップ（出欠・LINE）
│   ├── api/
│   │   ├── ocr-scorebook/route.ts     スコアシート OCR API
│   │   ├── upload-image/route.ts      プロフィール写真アップロード
│   │   ├── upload-score-photo/route.ts スコア写真アップロード
│   │   ├── line/webhook/route.ts      LINE Webhook
│   │   ├── line/test/route.ts         LINE テスト送信
│   │   └── cron/line-reminder/route.ts 自動リマインド
│   ├── results/[id]/page.tsx          試合結果詳細
│   ├── members/[id]/page.tsx          選手個人ページ
│   ├── globals.css                    グローバルスタイル
│   └── layout.tsx                     ルートレイアウト（Navbar・Footer）
│
├── components/
│   ├── ScoreBookEditor.tsx            スコアブック編集UI（Client Component）
│   ├── LineupEditor.tsx               打順編集（Client Component）
│   ├── LineupProgressPanel.tsx        打順進行状況
│   ├── LineConfirmModal.tsx           LINE送信確認モーダル
│   ├── LineAdminButton.tsx            LINE管理ボタン
│   ├── LineSendButton.tsx             LINE送信ボタン
│   ├── MemberAvatar.tsx               メンバーアバター
│   ├── Navbar.tsx                     ナビゲーションバー
│   ├── PhotoUploader.tsx              写真アップロードUI
│   ├── PrintButton.tsx                印刷ボタン（Client Component）
│   ├── Providers.tsx                  NextAuth SessionProvider ラッパー
│   └── SaveFormButton.tsx             フォーム保存ボタン
│
├── lib/
│   ├── cellExtractor.ts               スコアシート OCR セル切り出し（ブラウザ専用）
│   ├── scorebook.ts                   打撃コード解析・成績集計ライブラリ
│   ├── line.ts                        LINE Messaging API ユーティリティ
│   ├── prisma.ts                      Prisma Client シングルトン
│   └── settings.ts                    Setting テーブルアクセスヘルパー
│
├── auth.ts                            NextAuth 設定
└── proxy.ts                           Middleware（認証ガード）

prisma/
├── schema.prisma                      DB スキーマ定義
└── migrate.ts                         起動時マイグレーションスクリプト
```

---

## 既知の制約・注意事項

### OCR 精度

- マーカー検出は写真の傾き・強い影・手ブレで失敗することがある
- デバッグ表示（🔍ボタン）で探索領域（赤枠）・検出位置（色付き円）を確認可能
- 内部マーカーが4つとも検出できた場合のみ精密グリッドが有効になる
- 検出失敗時は TMPL 定数フォールバックで処理を続行（精度低下）

### 画像サイズ

- 3MB 超の画像は `compressImage()` で自動圧縮（品質 0.85、最大 2400px）
- iOS Safari では大きな画像の Canvas 操作でメモリ不足になる場合がある

### LINE グループ ID

- Bot 招待後にグループ内でメッセージを1件送ると自動取得できる
- `LINE_GROUP_ID` 環境変数 > DB `detectedLineGroupId` の優先順

### モデル選択

- デフォルト `claude-opus-4-5`（高精度・高コスト）
- `claude-haiku-4-5` に変更するとコスト削減できるが OCR 精度が低下する

### Turso DB

- 無料プランには接続数・ストレージの上限あり
- `prisma/migrate.ts` がビルド時に自動実行されるため、手動マイグレーション不要

---

*最終更新: 2025年5月31日*
