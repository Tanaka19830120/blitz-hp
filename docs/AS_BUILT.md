# BLITZ ソフトボールチーム HP — 完成図書（As-Built Documentation）

> 対象リポジトリ: `Tanaka19830120/blitz-hp`（GitHub）/ 本番: https://blitz-hp.vercel.app

---

## リビジョン履歴

| Rev | 日付 | 概要 |
|---|---|---|
| 1.0 | 2026-06 | 仮運用開始時点のスナップショット |
| 1.1 | 2026-06 | メンバー管理強化・統計ランキング強化・新機能追加（MVP投票/写真いいね/ライトボックス等） |

---

## 0. 目次

1. 概要・目的
2. 技術スタック
3. システム構成・デプロイ
4. 環境変数
5. 認証・権限モデル
6. データモデル（Prisma スキーマ）
7. ディレクトリ構成
8. ページ仕様（公開 / 管理）
9. API ルート
10. サーバーアクション
11. 主要コンポーネント
12. ライブラリ（`src/lib`）
13. スコアブック記法 と OCR パイプライン
14. 成績集計ロジック
15. メンバー区分の扱い
16. LINE 連携
17. 写真ストレージ（Vercel Blob）
18. データ取込（teams.one スクレイピング）
19. DB マイグレーション運用
20. 共通 UX（トースト / ローディング / 確認ダイアログ）
21. パフォーマンス設計
22. 既知の制約・注意点
23. 運用手順（よくある操作）
24. 開発・ビルド・デプロイ手順
25. 今後の TODO / 改善候補

---

## 1. 概要・目的

BLITZ（兵庫県加古川・加古郡・明石を拠点とする混合ソフトボールチーム）の公式 HP 兼チーム運営ツール。

**背景:** 既存の `teams.one`（外部サービス）の広告・機能制限を回避するため自作。過去の試合データは teams.one からスクレイピングして移行済み。

**主な機能:**
- 日程・出欠管理（メンバーがログインして出欠登録・確認ダイアログ付き）
- 試合結果の入力（スコアシート OCR + 手修正）と公開、先攻/後攻設定保存
- 個人成績（打撃・投手）の自動集計・ランキング・推移グラフ
- スタメン（打順・守備・交代）作成と LINE 配信
- LINE への出欠リマインド・出欠表・試合結果の通知（スコア行にリンク埋め込み）
- 写真アルバム（ライトボックス表示・❤️いいね機能）
- MVP投票（試合後2週間）
- メンバー管理（退団/復帰/助っ人昇格、背番号重複チェック）
- 歴代成績・元メンバー閲覧

---

## 2. 技術スタック

| 区分 | 採用技術 | バージョン |
|---|---|---|
| フレームワーク | Next.js（App Router, Turbopack） | 16.2.6 |
| 言語 | TypeScript / React | React 19.2.4 |
| スタイル | Tailwind CSS v4 | — |
| ORM | Prisma | 7.8.0 |
| DB | SQLite 互換 = **Turso（libsql）** 本番 / `dev.db` ローカル | — |
| DB アダプタ | `@prisma/adapter-libsql`（必須） | 7.8.0 |
| 認証 | NextAuth v5 beta（Credentials, JWT 戦略） | 5.0.0-beta.31 |
| ストレージ | Vercel Blob | 2.4.0 |
| OCR | Claude（Anthropic）Vision API | — |
| ホスティング | Vercel | — |
| パスワード | bcryptjs | 3.0.3 |

> ⚠️ **重要:** この Next.js は最新版で、従来の知識と異なる破壊的変更あり（`middleware.ts` → `proxy.ts`、`searchParams`/`params` が Promise 化、等）。コードを書く前に `node_modules/next/dist/docs/` の該当ガイドを確認すること（`AGENTS.md` の指示）。

### Prisma 構成の注意

- 生成クライアント出力先: `src/generated/prisma`（`import { PrismaClient } from '@/generated/prisma/client'`）
- PrismaClient は `PrismaLibSql` アダプタ経由で初期化（`src/lib/prisma.ts`）。
- 本番（NODE_ENV=production）ではグローバルキャッシュせず、モジュールスコープのシングルトンを利用。

---

## 3. システム構成・デプロイ

```
ブラウザ / LINE
      │
      ▼
Vercel（Next.js App Router, SSR/Server Actions）
   ├─ Turso（libsql）……… アプリDB（試合・選手・成績・設定 等）
   ├─ Vercel Blob ………… 画像（メンバー写真 / スコアシート / アルバム）
   ├─ Anthropic API ……… スコアシート OCR
   └─ LINE Messaging API … グループ通知
```

- **GitHub**: `https://github.com/Tanaka19830120/blitz-hp`（`main` ブランチ）
- **本番 URL**: `https://blitz-hp.vercel.app`
- **デプロイ方式**: `git push origin main` → Vercel 自動デプロイ。または `npx vercel deploy --prod` で手動デプロイ。
- **ビルドコマンド**: `npx tsx prisma/migrate.ts && prisma generate && next build`
  - ビルド時に **冪等マイグレーション**（`prisma/migrate.ts`）が Turso に対して走る。
- **Cron**: `vercel.json` で `/api/cron/line-reminder` を毎日 `0 0 * * *`（UTC 0 時）に実行。

---

## 4. 環境変数

| 変数 | 用途 |
|---|---|
| `DATABASE_URL` | Turso libsql の URL（ローカルは `file:./dev.db`） |
| `DATABASE_DIRECT_URL` | スクリプト・migrate.ts 用の直接接続 URL（DATABASE_URL と同値でも可） |
| `DATABASE_AUTH_TOKEN` | Turso 認証トークン |
| `AUTH_SECRET` | NextAuth セッション署名鍵 |
| `AUTH_URL` / `NEXTAUTH_URL` | 認証コールバック URL |
| `ANTHROPIC_API_KEY` | Claude OCR 用 |
| `ANTHROPIC_MODEL` | OCR モデル（既定 `claude-opus-4-5`） |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob 書込トークン（未設定だと画像アップロード不可） |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE 送信トークン |
| `LINE_GROUP_ID` | 送信先グループ ID（未設定時は DB の `detectedLineGroupId` 設定を使用） |
| `CRON_SECRET` | cron エンドポイントの保護 |

> **スクリプト実行時**: `DATABASE_DIRECT_URL` が優先される。Accelerate などプロキシ URL を `DATABASE_URL` に設定した場合でも、スクリプトは libsql に直接接続できる。

---

## 5. 認証・権限モデル

- **方式**: NextAuth v5、Credentials プロバイダ、**JWT セッション**（DB セッション不使用＝ミドルウェアが高速）。
- **ログイン ID = 背番号**、**初期パスワード = 背番号×2**（例: 背番号 28 → ID `28` / PW `2828`）。内部的に email を `"{背番号}@b"` として保存。
- **ロール**: `ADMIN` / `PLAYER`。
- **アクセス制御**（`src/proxy.ts` = Next.js 16 のミドルウェア）:
  - `/admin/*` は `ADMIN` のみ。非管理者は `/login` にリダイレクト。
  - その他のページは全員アクセス可（出欠登録・写真などは未ログインだと操作不可 or ログイン案内）。

### メンバーの email 命名規則

| email のサフィックス | 区分 | ログイン可 |
|---|---|---|
| `@b` | 現メンバー | ✅ |
| `@retired` | 退団済み（退団ボタンで変更） | ❌ |
| `@former` / その他 | インポート元の過去メンバー | ❌ |
| `@guest` | 助っ人 | ❌ |

---

## 6. データモデル（Prisma スキーマ）

ファイル: `prisma/schema.prisma`。`provider = "sqlite"`（実体は Turso/libsql）。

### enum
- `Role`: `ADMIN` / `PLAYER`
- `AttendanceStatus`: `ATTENDING` / `ABSENT` / `PENDING` / `MAYBE`
- `GameResult`: `WIN` / `LOSE` / `DRAW`
- `GameType`: `REGULAR` / `PRACTICE` / `TOURNAMENT` / `EVENT`

### User（選手 / 管理者 / 助っ人）
| カラム | 型 | 備考 |
|---|---|---|
| id | String @id cuid | |
| name | String | |
| email | String @unique | `"{背番号}@b"` / `@retired` / `@former` / `@guest` |
| password | String | bcrypt ハッシュ |
| role | Role = PLAYER | |
| number | Int? | 背番号（0〜999、一意制約なし） |
| position | String? | |
| photoUrl | String? | Vercel Blob URL |
| isGuest | Boolean = false | 助っ人。メンバー一覧・個人成績ランキングから除外 |
| createdAt / updatedAt | DateTime | |
| リレーション | attendances / gameStats / pitchingStats / lineups / photos / **mvpVotesCast / mvpVotesGot / photoLikes** | |

### Schedule（日程）
（変更なし。省略）

### Game（試合結果）
| カラム | 型 | 備考 |
|---|---|---|
| … | … | 変更なし |
| inningScores | String? | JSON `{"blitz":[..],"opponent":[..],"blitzFirst":bool}` **blitzFirst は先攻/後攻フラグ** |
| scorebook | String? | JSON `ScoreBookData`（**oppFirst フラグを含む**） |
| リレーション | stats / pitchingStats / **mvpVotes** | |

### GameStat / PitchingStat / Lineup / Setting（変更なし）

### Setting（KV 設定）—追加分
- `qualIpPerGame`: 規定投球回（1試合あたり、既定 1.0）
- `qualPaPerGame`: 規定打席（1試合あたり、既定 2.0）
- その他は変更なし

### PhotoAlbum / Photo（変更）
- `Photo` に **`likes PhotoLike[]`** リレーション追加

### PhotoLike（新規）
| カラム | 型 | 備考 |
|---|---|---|
| id | String @id | |
| photoId | String | Photo onDelete: Cascade |
| userId | String | User onDelete: Cascade |
| createdAt | DateTime | |
| @@unique([photoId, userId]) | | 1人1いいね |

### MvpVote（新規）
| カラム | 型 | 備考 |
|---|---|---|
| id | String @id | |
| gameId | String | Game onDelete: Cascade |
| voterId | String | 投票者 User |
| nomineeId | String | 候補者 User |
| createdAt | DateTime | |
| @@unique([gameId, voterId]) | | 1試合1票 |

---

## 7. ディレクトリ構成（抜粋）

```
blitz-hp/
├─ prisma/
│  ├─ schema.prisma           … データモデル
│  ├─ migrate.ts              … ビルド時の冪等マイグレーション
│  ├─ seed.ts                 … 初期データ投入
│  └─ prisma.config.ts        … Prisma 設定（datasource URL）
├─ scripts/                   … 運用・調査・データ修正スクリプト
│  ├─ fix-historical-stats.ts … 名前ベース成績再割り当て（背番号重複修正）
│  ├─ fix-duplicate-stats.ts  … 重複背番号による誤挿入修正
│  ├─ audit-stats.ts          … teams.one との成績照合
│  └─ （その他: reset-admin, check-*, list-members 等）
├─ docs/
│  └─ AS_BUILT.md             … 本ドキュメント
├─ src/
│  ├─ auth.ts
│  ├─ proxy.ts                … ミドルウェア（/admin ガード）
│  ├─ generated/prisma/
│  ├─ app/
│  ├─ components/
│  └─ lib/
└─ vercel.json
```

---

## 8. ページ仕様

### 公開ページ

| ルート | 内容 |
|---|---|
| `/` | ホーム。ヒーロー、Next Game、Recent Results。 |
| `/schedule` | 日程・出欠。出欠ボタンは **確認ダイアログ付きクライアントコンポーネント**（`AttendanceButtons`）。登録中スピナー表示。同日グループは全試合一括更新。 |
| `/results` | 試合結果一覧。年タブで絞り込み。勝敗集計（W/L/D・**勝率 = 勝÷(勝+負)、引き分けを分母から除外**）。 |
| `/results/[id]` | 試合結果詳細。イニングスコア（先攻/後攻順序を `blitzFirst` フラグで制御）、打者・投手成績。**MVP投票UI**（試合後2週間）。`dynamic = 'force-dynamic'`。 |
| `/stats` | 個人成績。**「現メンバー/歴代全員」切り替え**（`?mode=all`）、年度タブ。打撃成績（規定打席到達/未到達分割）、投手成績（**規定投球回到達/未到達分割**）。**出場試合数ランキング**（出席率付き）。打率/打点/安打/HR/防御率/勝利数のランキングカード（投手系含む）。 |
| `/stats/ranking` | ランキング全順位。**タブ: 打者（打率/打点/安打/本塁打）・投手（防御率/勝利数）**。防御率は規定投球回到達者のみ昇順。各ランキングの下部に**推移グラフ**（X軸=実日付、同日複数試合は最終値を使用、規定到達者は右端まで破線延長）。 |
| `/members` | メンバー一覧。**「現メンバー/元メンバー(OB)」タブ**。背番号バッジ表示。 |
| `/members/[id]` | 選手個人ページ。**直近連続出場記録**、**今シーズン打率推移グラフ**（SVGスパークライン）。全試合成績一覧（年付き日付）。 |
| `/album` | 写真アルバム一覧（メンバー専用）。 |
| `/album/[id]` | アルバム詳細。**ライトボックス表示**（クリックで拡大、← → ナビ/キーボード操作/Escで閉じる）。**❤️いいねトグル**（1人1いいね、再押しで取り消し）。削除は管理者または投稿者本人。 |
| `/profile` | チームプロフィール（公開）。勝率は引き分け除外方式。 |
| `/contact` | お問い合わせ。 |
| `/login` | ログイン。 |

### 管理ページ（`/admin/*`、ADMIN のみ）

| ルート | 内容 |
|---|---|
| `/admin` | ダッシュボード。LINE 送信ボタン（プレビュー確認付き）。 |
| `/admin/schedule` | 日程管理。 |
| `/admin/game` | 試合結果入力。**先攻/後攻設定が保存・復元される**（`ScoreBookData.oppFirst`）。LINE 送信時はスコア行の直下に結果ページ URL を添付（クリッカブルリンク）。 |
| `/admin/lineup` | スタメン作成。 |
| `/admin/members` | **メンバー管理**（大幅強化）。3セクション（現メンバー/元メンバー/助っ人）分割表示。背番号バッジ表示。**退団ボタン**（`@b`→`@retired`、ログイン不可、成績保持）。**復帰フロー**（`?rejoin=id`、背番号重複チェック、変更可能）。**「メンバーに追加」**（助っ人→現メンバー昇格、成績引継ぎ、背番号重複チェック）。背番号は0〜999、新規/編集時に重複チェック（現メンバーのみ対象）。 |
| `/admin/masters` | マスタ管理。 |
| `/admin/settings` | 規定打席係数・**規定投球回係数**（`qualIpPerGame`、既定 1.0）を設定。 |
| `/admin/profile` | チームプロフィール編集。 |
| `/admin/scorebook-sheet` | スコア記入シート印刷。 |
| `/admin/line-setup` | LINE 連携設定。 |

---

## 9. API ルート（変更なし）

| ルート | 用途 |
|---|---|
| `auth/[...nextauth]` | NextAuth ハンドラ |
| `ocr-scorebook` | スコアシート OCR（Claude Vision） |
| `upload-image` | メンバー写真アップロード |
| `upload-score-photo` | スコアシート写真アップロード |
| `upload-photo` | アルバム写真アップロード |
| `cron/line-reminder` | 毎日の出欠リマインド自動送信 |
| `line/webhook` | LINE Webhook（グループ ID 自動検出） |
| `line/test` | LINE 送信テスト |

---

## 10. サーバーアクション（主要・Rev1.1 追記分）

| ファイル | アクション | 概要 |
|---|---|---|
| `results/[id]/page.tsx` | `castMvpVote` | MVP投票（1人1票、試合後2週間）。`@@unique([gameId, voterId])` で重複防止。 |
| `album/[id]/page.tsx` | `togglePhotoLike` | 写真いいねトグル（あれば削除、なければ作成）。 |
| `album/[id]/page.tsx` | `deletePhoto` | シグネチャ変更: `(photoId, albumId)` を引数で受取（FormData 方式→引数方式）。 |
| `admin/members/page.tsx` | `retireMember` | 退団処理（`@b`→`@retired`）。 |
| | `rejoinMember` | 復帰処理。背番号を変更可能。重複時は redirect でエラー返し。 |
| | `promoteMember` | 助っ人→現メンバー昇格。isGuest:false、email:`@b`、password 設定。成績データ引継ぎ。 |
| | `createMember` | 背番号重複チェック追加。背番号 max: 999。 |
| | `updateMember` | 背番号変更時の重複チェック。退団中は `@retired` を維持（`@b` で上書きしない）。 |
| `schedule/page.tsx` | `updateAttendance` | シグネチャ変更: `(scheduleId, status)` 引数方式（FormData 方式→引数方式）。 |

---

## 11. 主要コンポーネント

| コンポーネント | 役割 |
|---|---|
| `ScoreBookEditor` | 試合結果入力の中核。**`oppFirst` ステートを `ScoreBookData` に保存**（先攻/後攻設定の永続化）。 |
| `AttendanceButtons` | **出欠登録ボタン**（クライアント）。確認ダイアログ + 登録中スピナー付き。 |
| `MvpVote` | **MVP投票UI**（クライアント）。投票前: 候補一覧、投票後: 得票バー+パーセント表示。 |
| `PhotoGrid` | **アルバムグリッド + ライトボックス**（クライアント統合コンポーネント）。グリッド・拡大表示・前後ナビ・いいね・削除を1コンポーネントに統合。 |
| `PhotoLikeButton` | **写真いいねトグルボタン**（クライアント）。再押しで取り消し。 |
| `AdminEditLink` | 結果詳細の「編集」リンク（クライアント側で useSession によるロール判定。ISR 対応のため Server Action で auth() を呼ばない）。 |
| `Toast` | URL `?toast=` 検出して共通トースト表示。 |
| `SubmitButton` | 送信中ラベル + 確認ダイアログ対応。 |
| `SaveFormButton` | 保存系ボタン（保存中.../✓保存しました）。 |
| `AlbumUploader` | アルバム写真アップロード + クライアント圧縮。 |
| `LineConfirmModal` / `LineAdminButton` | LINE 送信プレビュー・確認。 |
| `Navbar` / `Providers` / `MemberAvatar` / `PrintButton` / `LineupProgressPanel` / `ScheduleCreateForm` | 共通 UI。 |

---

## 12. ライブラリ（`src/lib`）

| ファイル | 役割 |
|---|---|
| `prisma.ts` | PrismaClient（libsql アダプタ）シングルトン。 |
| `scorebook.ts` | スコアブック記法の型・パース・集計・日本語変換。**`ScoreBookData` に `oppFirst?: boolean` フィールド追加**（先攻/後攻設定）。 |
| `cellExtractor.ts` | スコアシート画像前処理（クライアント側）。 |
| `statsQueries.ts` | **大幅追加**: `getBattingStats(year, includeAlumni)` / `getPitchingStats(year, includeAlumni)`（歴代モード対応）/ `getQualIpPerGame()` 規定投球回係数 / **`getPlayerTrends(playerIds, year, stat)`** 打率・安打・打点・HR の時系列データ（同日複数試合は最終値に集約） / `TrendStat` 型。 |
| `line.ts` | LINE 送信・メッセージ生成。**試合結果メッセージ: スコア行直下に結果ページ URL（自動リンク化）**。 |
| `maps.ts` | 場所名 → Google マップ URL 生成。 |
| `settings.ts` | KV 設定・マスタ・プロフィールのヘルパー。 |
| `markSheetConfig.ts` | マークシートレイアウト定義。 |

---

## 13. スコアブック記法 と OCR パイプライン（変更なし）

1打席を 1 コードで表す: `<結果>[<打点>][s]`
- 結果: `O`=アウト、`1`=単打、`2`=二塁打、`3`=三塁打、`4`=本塁打、`B`=四球、`D`=死球、`S`=犠打、`X`=犠飛
- 末尾数字 = 打点、末尾 `s` = 盗塁

OCR パイプライン（変更なし、詳細は Rev1.0 参照）。

---

## 14. 成績集計ロジック

- **試合単位**: GameStat / PitchingStat に保存（`saveGame` が ScoreBookData から自動計算）。
- **通算/年度**: `getBattingStats(year, includeAlumni)` / `getPitchingStats(year, includeAlumni)` で集計。助っ人は基本除外。`includeAlumni=true` で元メンバーも含む（歴代モード）。
- **指標**: 打率 `H/AB`、出塁率 `(H+BB+HBP)/(AB+BB+HBP+SF)`、長打率、防御率 `自責 × 21 / アウト数`（7イニング想定）。
- **勝率**: `勝 ÷（勝 + 負）` **引き分けを分母から除外**（`/profile` ページ）。
- **規定打席** = `floor(試合数 × qualPaPerGame)`（既定 2.0、`/admin/settings` で変更可）。
- **規定投球回** = `floor(試合数 × qualIpPerGame)`（既定 1.0、`/admin/settings` で変更可）。
- **推移グラフ**: 同日複数試合は最終試合後の累積値のみプロット（垂直線を防ぐため）。規定到達者は最終出場日以降も右端まで破線延長。
- **先攻/後攻**: `Game.inningScores` の `blitzFirst` フラグ（true=BLITZ が先攻）でイニングスコアの表示順を制御。`ScoreBookData.oppFirst` として保存・復元。

---

## 15. メンバー区分の扱い（Rev1.1 強化）

### 区分の定義

| 区分 | email | isGuest | ログイン | 成績ランキング | メンバー一覧 |
|---|---|---|---|---|---|
| 現メンバー | `@b` | false | ✅ | 現メンバーモード | 現メンバータブ |
| 退団済み | `@retired` | false | ❌ | 歴代モードのみ | 元メンバータブ |
| インポート済み過去メンバー | `@former` 等 | false | ❌ | 歴代モードのみ | 元メンバータブ |
| 助っ人 | `@guest` | true | ❌ | 除外 | 助っ人タブ（管理画面のみ） |

### 退団フロー

1. 管理画面「退団」ボタン → email `@b` → `@retired` に変更
2. ログイン不可、成績データは保持
3. 元メンバータブ・歴代モードで閲覧可能
4. 「復帰」ボタンで `?rejoin=id` → 背番号重複チェック → `@b` に戻す

### 助っ人昇格フロー

1. 管理画面「メンバーに追加」ボタン → `?promote=id`
2. 背番号・重複チェック画面 → 「メンバーに追加する」
3. `isGuest=false`、email `@b`、password 設定（背番号×2）
4. 過去の GameStat がそのまま引き継がれる（userId は変わらない）

### 背番号重複チェック

- 新規登録・編集・復帰・助っ人昇格の全操作でチェック
- 対象: 現メンバー（`@b` email）のみ。元メンバーとの重複は許容
- 重複時: 警告メッセージ表示、処理中断（強制上書き機能なし）

---

## 16. LINE 連携（`src/lib/line.ts`）

- グループへのプッシュ送信。
- **試合結果メッセージ**: スコア行（`BLITZ X ー Y 相手`）の直下に結果ページ URL を出力 → LINE がリンクとして認識・タップ可能。
- メッセージ生成: `buildReminder`（出欠リマインド）、`buildAttendanceSummary`（出欠集計）、`buildLineup`/`buildLineupFromJson`（スタメン）、`buildGameResult`（試合結果）。
- cron（`/api/cron/line-reminder`）で定期リマインド。

---

## 17. 写真ストレージ（Vercel Blob）

（変更なし。詳細は Rev1.0 参照）

**追加機能（Rev1.1）:**
- **ライトボックス**: `PhotoGrid` コンポーネントで写真クリック時にモーダル表示。← → キーボードナビ対応。
- **いいね**: `PhotoLike` テーブルで管理。1人1いいね、再押しで取り消し（トグル方式）。

---

## 18. データ取込（teams.one スクレイピング）

（既存の `prisma/scrape-details.ts` は変更なし）

**追加スクリプト（Rev1.1）:**

| スクリプト | 用途 |
|---|---|
| `scripts/fix-historical-stats.ts` | 全試合の成績を teams.one から再取得し**名前ベース**で正しい選手に再割り当て。未登録選手は元メンバーとして自動作成。背番号重複による誤帰属を根本修正。 |
| `scripts/fix-duplicate-stats.ts` | 背番号重複選手の成績を名前マッチングで修正。 |
| `scripts/fix-shinnosuke.ts` | 特定選手の入団前データ削除（一時利用）。 |
| `scripts/check-tsurasan.ts` | 特定選手の teams.one データ照合（一時利用）。 |

**名前解決ロジック（Rev1.1 強化）:**
1. 完全一致
2. エイリアス解決（表記揺れ: `りゅうせい` ↔ `RYUSEI` 等）
3. 省略名（`…` 末尾: `K .KA…` → `K.KAZU`）
4. 部分一致（元DB選手のみ対象、候補1件の場合のみ採用）
5. 解決不能 → スキップ（誤挿入防止）

---

## 19. DB マイグレーション運用

**方式**: `prisma/migrate.ts` がビルド時に冪等 SQL を libsql に直接適用。

**Rev1.1 追加テーブル:**
- `MvpVote`: MVP投票（v11）
- `PhotoLike`: 写真いいね（v12）

**新カラム追加の手順（変更なし）:**
1. `schema.prisma` にカラム/モデル追加
2. `migrate.ts` に冪等 SQL を追記
3. `npx tsx prisma/migrate.ts && npx prisma generate`（ローカル確認）
4. commit → デプロイ（ビルド時に本番 Turso へ適用）

---

## 20. 共通 UX

- **トースト**: `Toast`（URL `?toast=` 方式、2.8 秒で自動消去）。
- **確認ダイアログ**: 削除等は `SubmitButton confirm=...` または `window.confirm`。
- **出欠ボタン**: `AttendanceButtons`（クライアント）。確認ダイアログ → 登録中スピナー → 完了。
- **loading.tsx**: `/schedule`、`/stats`、`/stats/ranking`、`/members`、`/members/[id]`、`/results`、`/results/[id]`、`/admin` に配置。

---

## 21. パフォーマンス設計（Rev1.1 追加）

| ページ | 方式 | 備考 |
|---|---|---|
| `/members` | ISR `revalidate=3600` | メンバー追加/退団/復帰時に `revalidatePath` で即時更新 |
| `/members/[id]` | ISR `revalidate=3600` | 成績保存時に `revalidatePath` で更新 |
| `/results/[id]` | `dynamic='force-dynamic'` | MVP投票があるため動的（Rev1.1 で変更） |
| `/stats` | `dynamic='force-dynamic'` | searchParams 使用のため |
| `/stats/ranking` | ISR `revalidate=3600` | 成績保存時に更新 |
| `/admin/*` | `dynamic='force-dynamic'` または `force-dynamic` | 管理画面は常に最新 |

---

## 22. 既知の制約・注意点

1. **OCR 精度**: モバイル撮影は誤読あり。手修正前提。
2. **背番号の再利用**: 同じ番号が年代をまたいで別人に使われる場合、`fix-historical-stats.ts` で名前ベース修正が必要。
3. **助っ人の臨時番号**: 取込で `#100〜#102` 等が「元メンバー」判定される場合あり。
4. **スケジュール削除と lineupData**: 日程削除→再作成で `lineupData_{旧ID}` が孤立。
5. **Blob は公開 URL**: ページはログインでガードしているが URL 直接アクセスは可能。
6. **退団→復帰後の背番号重複**: 退団中に別の人が同じ番号を使った場合、復帰時に番号変更が必要。

---

## 23. 運用手順（よくある操作）

- **日程追加**: `/admin/schedule` → 入力 → 追加。
- **スタメン登録**: `/admin/lineup` → 対象試合 → 打順/守備/交代 → 保存。LINE 配信可。
- **試合結果入力**: `/admin/game` → 試合選択 → 先攻/後攻設定 → OCR or 手入力 → 保存（LINE 送信可）。
- **退団処理**: `/admin/members` → 対象選手「退団」ボタン → 確認ダイアログ。
- **復帰処理**: `/admin/members` → 元メンバーセクションの「復帰」リンク → 背番号確認/変更 → 「復帰する」。
- **助っ人昇格**: `/admin/members` → 助っ人セクションの「メンバーに追加」→ 確認ダイアログ → 背番号入力 → 「メンバーに追加する」。
- **規定打席/投球回の調整**: `/admin/settings`。
- **写真アルバム**: `/album`（ログイン）→ アルバム作成 → 写真追加 → クリックでライトボックス表示。
- **歴代成績の閲覧**: `/stats?mode=all` または `/stats/ranking?stat=avg` などランキングページ。

---

## 24. 開発・ビルド・デプロイ手順

```bash
# 依存インストール（postinstall で prisma generate）
npm install

# 開発サーバ
npm run dev

# 型チェック
npx tsc --noEmit

# 本番ビルド（migrate.ts → prisma generate → next build）
npm run build

# デプロイ
git push origin main          # Vercel 自動デプロイ
npx vercel deploy --prod      # 手動デプロイ

# スクリプト実行（DATABASE_DIRECT_URL または DATABASE_URL が必要）
npx tsx scripts/fix-historical-stats.ts --dry  # ドライラン
npx tsx scripts/fix-historical-stats.ts        # 本番実行
```

---

## 25. 今後の TODO / 改善候補

- 日程削除時に `lineupData_/lineupNote_` 設定も連動削除（孤立防止）。
- スコアシート OCR の精度向上。
- アルバムの厳格な非公開化（認証付き配信）が必要なら検討。
- ~~退団メンバーの「現役/OB」区分の導入~~ → **Rev1.1 で実装済み（退団/復帰フロー）**。
- ~~公開ページのキャッシュ化（ISR）~~ → **Rev1.1 で主要ページに ISR 適用済み**。
- MVP投票結果の LINE 通知（投票締切後に自動送信）。
- 月間表彰（打率王・打点王・出席率1位）のホーム表示。

---

_本ドキュメントは Rev1.1（2026-06）時点のスナップショット。仕様変更時は本ファイル（`docs/AS_BUILT.md`）も更新すること。_
