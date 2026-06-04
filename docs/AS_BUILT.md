# BLITZ ソフトボールチーム HP — 完成図書（As-Built Documentation）

> 仮運用開始時点の全仕様をまとめた技術ドキュメント。
> 対象リポジトリ: `Tanaka19830120/blitz-hp`（GitHub）/ 本番: https://blitz-hp.vercel.app
> 最終更新: 2026-06 仮運用開始時点

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
15. 助っ人（ゲスト）の扱い
16. LINE 連携
17. 写真ストレージ（Vercel Blob）
18. データ取込（teams.one スクレイピング）
19. DB マイグレーション運用
20. 共通 UX（トースト / ローディング / 確認ダイアログ）
21. 既知の制約・注意点
22. 運用手順（よくある操作）
23. 開発・ビルド・デプロイ手順
24. 今後の TODO / 改善候補

---

## 1. 概要・目的

BLITZ（兵庫県加古川・加古郡・明石を拠点とする混合ソフトボールチーム）の公式 HP 兼チーム運営ツール。

**背景:** 既存の `teams.one`（外部サービス）の広告・機能制限を回避するため自作。過去の試合データは teams.one からスクレイピングして移行済み。

**主な機能:**
- 日程・出欠管理（メンバーがログインして出欠登録）
- 試合結果の入力（スコアシートを写真で OCR 取込 + 手修正）と公開
- 個人成績（打撃・投手）の自動集計・ランキング
- スタメン（打順・守備・交代）作成と LINE 配信
- LINE への出欠リマインド・出欠表・試合結果の通知
- 写真アルバム（試合・イベント、メンバー専用）
- 管理者用の各種マスタ・設定

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
- PrismaClient は必ず `PrismaLibSql` アダプタ経由で初期化（`src/lib/prisma.ts`）。
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
| `DATABASE_AUTH_TOKEN` | Turso 認証トークン |
| `AUTH_SECRET` | NextAuth セッション署名鍵 |
| `AUTH_URL` / `NEXTAUTH_URL` | 認証コールバック URL |
| `ANTHROPIC_API_KEY` | Claude OCR 用 |
| `ANTHROPIC_MODEL` | OCR モデル（既定 `claude-opus-4-5`） |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob 書込トークン（未設定だと画像アップロード不可） |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE 送信トークン |
| `LINE_GROUP_ID` | 送信先グループ ID（未設定時は DB の `detectedLineGroupId` 設定を使用） |
| `CRON_SECRET` | cron エンドポイントの保護 |
| `RESCAN` | （スクリプト用）`scrape-details.ts` で取込済み試合も再処理するフラグ |

---

## 5. 認証・権限モデル

- **方式**: NextAuth v5、Credentials プロバイダ、**JWT セッション**（DB セッション不使用＝ミドルウェアが高速）。
- **ログイン ID = 背番号**、**初期パスワード = 背番号×2**（例: 背番号 28 → ID `28` / PW `2828`）。内部的に email を `"{背番号}@b"` として保存。
- メンバー作成・更新時、背番号が変わると email とパスワードも自動再設定（`src/app/admin/members/page.tsx`）。
- **ロール**: `ADMIN` / `PLAYER`。
- **アクセス制御**（`src/proxy.ts` = Next.js 16 のミドルウェア）:
  - `/admin/*` は `ADMIN` のみ。非管理者は `/login` にリダイレクト。
  - その他のページは全員アクセス可（ただし出欠登録・写真などは未ログインだと操作不可 or ログイン案内）。
- セッションには `user.id` と `user.role` を格納（`src/auth.ts` の callbacks）。

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
| email | String @unique | `"{背番号}@b"` |
| password | String | bcrypt ハッシュ |
| role | Role = PLAYER | |
| number | Int? | 背番号 |
| position | String? | |
| photoUrl | String? | Vercel Blob URL |
| **isGuest** | Boolean = false | 助っ人。メンバー一覧・個人成績ランキングから除外 |
| createdAt / updatedAt | DateTime | |
| リレーション | attendances / gameStats / pitchingStats / lineups / photos | |

### Schedule（日程）
| カラム | 型 | 備考 |
|---|---|---|
| id | String @id | |
| date | DateTime | |
| opponent | String | EVENT 時はイベント内容（例「BBQ」）。空可 |
| location | String | 場所名（Google マップ検索 URL を名前から自動生成） |
| type | GameType = REGULAR | |
| meetTime / startTime | String? | |
| note | String? | メモ・備考（改行可、LINE にも記載） |
| dayGroupId | String? | 同日複数試合のグループ識別子（@@index） |
| リレーション | attendances / game(1:1) / lineups | |

### Game（試合結果）
| カラム | 型 | 備考 |
|---|---|---|
| id | String @id | |
| ourScore / opponentScore | Int | |
| result | GameResult | |
| note | String? | |
| inningScores | String? | JSON `{"blitz":[..],"opponent":[..]}` |
| scorebook | String? | JSON `ScoreBookData`（イニング別・打者別） |
| scorePhoto | String? | スコアシート写真の Blob URL |
| teamsOneId | String? @unique | 移行元 teams.one のゲーム ID |
| scheduleId | String @unique | Schedule と 1:1。**onDelete: Cascade** |
| リレーション | stats(GameStat[]) / pitchingStats(PitchingStat[]) | |

### GameStat（打者成績・試合単位）
打数・安打・二/三塁打・本・打点・得点・盗塁・三振・四球・死球・犠打・犠飛・打席・守備位置・打順。`userId+gameId` で一意。user/game ともに **onDelete: Cascade**。

### PitchingStat（投手成績・試合単位）
勝敗（`勝/負/S/H`）・投球回（文字列 `"5"` / `"5.1"` / `"5回1/3"`）・投球数・失点・自責点・被安打・奪三振・与四球。`userId+gameId` で一意。

### Lineup（スタメン・後方互換テーブル）
打順・守備・DH フラグ。`userId+scheduleId` で一意。スタメンの主データは `Setting` の `lineupData_{scheduleId}`（JSON）で、Lineup テーブルは同期用。

### Setting（KV 設定）
`key`(PK) / `value`。用途例:
- `qualPaPerGame`: 規定打席（1試合あたり、既定 2.0）
- `detectedLineGroupId`: LINE グループ ID 自動検出値
- `opponentMaster` / `locationMaster`: 対戦相手・球場マスタ（JSON 文字列配列）
- `gameTypeLabel_{KEY}`: 試合種別ラベルのカスタム表示名
- `lineupData_{scheduleId}`: スタメン JSON（打順・前後半守備・交代）
- `lineupNote_{scheduleId}`: スタメンのメモ
- プロフィール各種（about / info / grounds / retiredNumbers 等）

### PhotoAlbum / Photo（写真アルバム）
- `PhotoAlbum`: id / title / date / createdAt（@@index date）
- `Photo`: id / albumId / url(Blob) / uploadedById(User?) / createdAt。album は onDelete: Cascade、uploadedBy は onDelete: SetNull。

---

## 7. ディレクトリ構成（抜粋）

```
blitz-hp/
├─ prisma/
│  ├─ schema.prisma           … データモデル
│  ├─ migrate.ts              … ビルド時の冪等マイグレーション（libsql 直接 SQL）
│  ├─ seed.ts                 … 初期データ投入
│  ├─ scrape-details.ts       … teams.one 全試合スクレイピング取込
│  └─ （その他データ補修スクリプト）
├─ scripts/                   … 運用・調査用スクリプト（audit-stats, reset-admin 等）
├─ public/
│  ├─ hero-softball.png       … ホーム背景画像
│  └─ blitz-logo.jpg
├─ src/
│  ├─ auth.ts                 … NextAuth 設定
│  ├─ proxy.ts                … ミドルウェア（/admin ガード）
│  ├─ generated/prisma/       … Prisma 生成クライアント
│  ├─ app/                    … App Router ページ・API・レイアウト
│  ├─ components/             … クライアント/サーバーコンポーネント
│  └─ lib/                    … 共通ロジック
├─ vercel.json                … cron 設定
├─ next.config.ts             … 画像 remotePatterns 等
└─ AGENTS.md / CLAUDE.md      … 開発上の注意
```

---

## 8. ページ仕様

### 公開ページ

| ルート | 内容 |
|---|---|
| `/` | ホーム。ヒーロー（背景画像 `hero-softball.png` + ロゴ/CTA）、Next Game（次の予定。EVENT は「🎉 内容」表示）、Recent Results。 |
| `/schedule` | 日程・出欠。ログインメンバーは各試合に出欠（出席/欠席/MAYBE）を登録。同日グループは全試合一括更新。場所は Google マップへのリンク。EVENT は「🎉 内容」表示。備考は改行反映。 |
| `/results` | 試合結果一覧。年タブで絞り込み（`?year=`）。勝敗集計（W/L/D・勝率）。各カードに最高打者・詳細リンク。**管理者には各カードに「削除」ボタン**（試合結果のみ削除、日程は残る）。ローディングスケルトンあり。 |
| `/results/[id]` | 試合結果詳細（`id`=scheduleId）。ヘッダースコア、イニングスコア、**打者成績（イニング別の結果を日本語表示＝安/二安/本/打点N 等 + 右側に打数/安打/打率/二/三/本/打点/盗塁/四球/死球/犠打/犠飛 + 打席/守備）**、投手成績。打者・投手名はクリックで選手ページへ（助っ人はリンクなし＋「助っ人」バッジ）。スコアブック JSON があればイニング別表示、無ければ GameStat フォールバック表。ローディングスケルトンあり。 |
| `/stats` | 個人成績。**デフォルトは最新年**（`?year=all` で通算、`?year=2026` で年指定）。打率/打点/安打/本塁打のランキングカード（見出しクリックで全順位ページへ）。打撃成績表（規定打席到達/未到達で分割）、投手成績表。助っ人は除外。 |
| `/stats/ranking` | ランキング全順位（`?stat=avg|rbi|hits|homeRuns&year=`）。規定打席系（打率）は到達者のみ、その他は出場者全員。同値は同順位。 |
| `/members` | メンバー一覧（助っ人除外）。 |
| `/members/[id]` | 選手個人ページ。 |
| `/album` | 写真アルバム一覧（**メンバー専用**=要ログイン）。日付降順、各アルバムは「日付＋タイトル」。アルバム作成フォーム。管理者はアルバム削除可。 |
| `/album/[id]` | アルバム詳細。写真グリッド + 複数アップロード（クライアント圧縮）。削除は管理者または投稿者本人。 |
| `/profile` | チームプロフィール（公開）。 |
| `/contact` | お問い合わせ。 |
| `/login` | ログイン（背番号 + パスワード）。 |

### 管理ページ（`/admin/*`、ADMIN のみ）

| ルート | 内容 |
|---|---|
| `/admin` | ダッシュボード。件数サマリ、直近予定、各予定への LINE 送信（出欠リマインド/出欠表）。 |
| `/admin/schedule` | 日程の追加（クライアントフォーム、保存中/保存しましたトースト、EVENT 時は対戦相手任意でイベント内容入力）・編集・削除（確認ダイアログ、結果ありは警告）・同日試合追加・グループ解除。プルダウン未選択は送信ブロック。 |
| `/admin/game` | **試合結果入力**（後述の中核機能）。試合選択→ScoreBookEditor。スタメン/既存成績からプリセット。取り込んだスコアシート写真を最下部に表示（管理者のみ）。 |
| `/admin/lineup` | スタメン作成（打順・前後半守備・交代・FP）。保存で `lineupData_{scheduleId}` と Lineup テーブルに保存。LINE 配信ボタン。 |
| `/admin/members` | メンバー追加/編集/削除、権限トグル、PW リセット。各操作にトースト。 |
| `/admin/masters` | 対戦相手・球場マスタ、試合種別ラベル、過去データからの取込。 |
| `/admin/settings` | 規定打席係数など。 |
| `/admin/profile` | チームプロフィール編集。 |
| `/admin/scorebook-sheet` | 現場用のスコア記入シート印刷（QR コード付き）。 |
| `/admin/line-setup` | LINE 連携セットアップ。 |

---

## 9. API ルート（`src/app/api`）

| ルート | 用途 |
|---|---|
| `auth/[...nextauth]` | NextAuth ハンドラ。 |
| `ocr-scorebook` | スコアシート OCR。クライアントが切り出したセル画像 + 圧縮画像を受け取り、Claude Vision で各打席を判定して `batterCells` を返す。`ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`（既定 `claude-opus-4-5`）。 |
| `upload-image` | メンバー写真アップロード（ADMIN のみ）。Blob `members/`。 |
| `upload-score-photo` | スコアシート写真アップロード（要ログイン）。Blob `score-photos/{scheduleId}/`。 |
| `upload-photo` | アルバム写真アップロード（要ログイン）。Blob `albums/{albumId}/`。Photo 行も作成。 |
| `cron/line-reminder` | 毎日の出欠リマインド自動送信（`CRON_SECRET` で保護）。 |
| `line/webhook` | LINE Webhook（グループ ID 自動検出など）。 |
| `line/test` | LINE 送信テスト。 |

---

## 10. サーバーアクション（主要）

| ファイル | アクション | 概要 |
|---|---|---|
| `admin/game/page.tsx` | `saveGame` | スコア + スコアブック JSON + 個人/投手成績を一括保存（成績は ScoreBookData から自動計算）。LINE 送信オプション。`inningScores` も保存。関連ページを revalidate。 |
| | `saveScorePhoto` | スコアシート写真 URL を Game.scorePhoto に保存。 |
| `admin/schedule/page.tsx` | `createSchedule` | 日程追加（クライアントから useActionState、結果トースト）。EVENT は対戦相手任意。 |
| | `updateSchedule` / `deleteSchedule` / `addGameToDay` / `unlinkFromGroup` | 編集/削除/同日追加/グループ解除。成功後 `?toast=` 付き redirect。 |
| `admin/members/page.tsx` | `createMember` / `updateMember` / `deleteMember` / `toggleRole` / `resetPassword` | メンバー管理。トースト付き。 |
| `admin/masters/page.tsx` | `addOpponent`/`removeOpponent`/`addLocation`/`removeLocation`/`updateGameTypeLabels`/`seedMasters` | マスタ管理。 |
| `admin/lineup/page.tsx` | `saveLineup` / `sendLineLineupGroup` | スタメン保存 / LINE 配信。 |
| `schedule/page.tsx` | `updateAttendance` | 出欠登録（同日グループ一括）。トースト。 |
| `results/page.tsx` | `deleteGame` | 試合結果のみ削除（ADMIN）。日程は残す。 |
| `album/page.tsx` | `createAlbum` / `deleteAlbum` | アルバム作成（要ログイン）/ 削除（ADMIN）。 |
| `album/[id]/page.tsx` | `deletePhoto` | 写真削除（ADMIN または投稿者本人）。 |

> トーストの仕組み: 多くのアクションは成功後 `redirect(`...?toast=${encodeURIComponent('○○しました')}`)` し、ルート常設の `Toast` コンポーネント（`src/components/Toast.tsx`）が `?toast=` を検出して表示・URL から除去する。

---

## 11. 主要コンポーネント（`src/components`）

| コンポーネント | 役割 |
|---|---|
| `ScoreBookEditor` | **試合結果入力の中核**（クライアント）。打順×イニングのマークシート式スコアブック、OCR 取込、打者/投手成績、イニングスコア、LINE プレビュー保存。`key={scheduleId}` で試合切替時に再マウント。 |
| `LineupEditor` | スタメン編集（打順・守備・交代・FP）。保存中/保存しました表示内蔵。 |
| `Toast` | URL `?toast=` を検出して「✅ ○○しました」を全画面共通表示（ルート常設）。 |
| `SubmitButton` | `useFormStatus` で送信中ラベル表示 + 任意で確認ダイアログ。 |
| `SaveFormButton` | 保存系ボタン（保存中.../✓保存しました 内蔵）。settings/profile で使用。 |
| `ConfirmSubmitButton` | 確認ダイアログ付き submit（現在は SubmitButton に統合方向）。 |
| `ScheduleCreateForm` | 日程追加クライアントフォーム（useActionState + トースト + EVENT 切替）。 |
| `LineConfirmModal` / `LineAdminButton` / `LineSendButton` | LINE 送信プレビュー・確認（ポータルで body 直下に描画、最前面）。 |
| `AlbumUploader` | アルバム写真の複数アップロード + クライアント圧縮（長辺1600px/JPEG0.8）。 |
| `PhotoUploader` / `ScorePhotoUploader` | 各種写真アップロード UI。 |
| `Navbar` / `Providers` / `MemberAvatar` / `PrintButton` / `LineupProgressPanel` | 共通 UI。 |

---

## 12. ライブラリ（`src/lib`）

| ファイル | 役割 |
|---|---|
| `prisma.ts` | PrismaClient（libsql アダプタ）シングルトン。 |
| `scorebook.ts` | スコアブック記法の型・パース・集計・日本語変換（後述）。 |
| `cellExtractor.ts` | スコアシート画像から四隅マーカー検出・透視補正・各セル切り出し（クライアント側）。OCR の前処理。 |
| `statsQueries.ts` | 打撃成績集計（`getBattingStats`）、年度一覧、試合数、規定打席。助っ人除外。 |
| `line.ts` | LINE 送信ユーティリティ・各種メッセージ生成（出欠リマインド/出欠表/スタメン/試合結果）。場所に Google マップ URL を付与。 |
| `maps.ts` | 場所名 → Google マップ検索 URL 生成。 |
| `settings.ts` | KV 設定・マスタ・プロフィールのヘルパー。試合種別ラベル。 |
| `markSheetConfig.ts` | マークシートのレイアウト定義。 |

---

## 13. スコアブック記法 と OCR パイプライン

### スコアブック記法（`src/lib/scorebook.ts`）

1打席を 1 コードで表す: `<結果>[<打点>][s]`
- 結果: `O`=アウト、`1`=単打、`2`=二塁打、`3`=三塁打、`4`=本塁打、`B`=四球、`D`=死球、`S`=犠打、`X`=犠飛、`K/G/F`=旧コード（後方互換）
- 末尾数字 = 打点（例 `12` = 単打2打点）、本塁打 `4` は数字なしでも1打点
- 末尾 `s` = 盗塁
- 1イニングに複数打席はカンマ区切り（例 `1,O`）

主要関数:
- `parseCode(raw)`: 1打席 → `BatterStats` 差分
- `calcBatterStats(cells)`: 打者の全セルを集計
- `codeToJa(raw)` / `cellToJaParts(raw)`: コード → 日本語（安 / 二安 / 本 / 打点N / ・盗 / 凡 等）。試合結果詳細の表示に使用。
- `cellColor(code)`: コード別の文字色クラス。

### OCR パイプライン

1. **クライアント**（`cellExtractor.ts` + `ScoreBookEditor`）: 撮影/選択画像から四隅マーカーを検出 → 透視補正 → 打順×イニングの各セルを小画像に切り出し。メモリ対策で `MAX_DIM≈1500px`、JPEG 低品質、単一 canvas の使い回し。EXIF 回転補正あり。
2. **送信**: 圧縮した元画像（約 50〜150KB）+ セル小画像群を `POST /api/ocr-scorebook`（ペイロードは Vercel 4.5MB 制限内）。
3. **サーバー**（`ocr-scorebook/route.ts`）: Claude Vision に「打席コード欄」「打点欄」を画像で問い合わせ、ルールベースで `{ab1,rbi1,ab2,rbi2}` → コード文字列に組み立て、`batterCells` を返す。
4. **反映**: `ScoreBookEditor` が `batterCells` で打者セルを上書き。BLITZ のイニングスコアを読み取った打点で初期反映（**以降は手修正可能**＝エラー得点等に対応）。元画像は `/api/upload-score-photo` で Blob に保存し `Game.scorePhoto` に記録。
5. **注意**: モバイル写真は画質・サイズの制約で完璧な精度は出ない（PC は良好）。空セルが稀に「O」誤読される等の限界を許容。

---

## 14. 成績集計ロジック

- **試合単位**は GameStat / PitchingStat に保存（`saveGame` が ScoreBookData から自動計算して再生成）。
- **通算/年度**は `statsQueries.getBattingStats(year)` と `/stats` 内 `getPitchingStats(year)` が User をまたいで集計。**助っ人（isGuest）は除外**。
- 指標: 打率 `H/AB`、出塁率 `(H+BB+HBP)/(AB+BB+HBP+SF)`、長打率、防御率 `自責 × 21 / アウト数`（7イニング想定）。
- 規定打席 = `floor(試合数 × qualPaPerGame)`（既定係数 2.0）。
- BLITZ の試合得点はスコアブックの打点合計を初期値とし、イニングスコア欄で手修正可能（合計が得点）。相手得点はイニング手入力の合計。

---

## 15. 助っ人（ゲスト）の扱い

- `User.isGuest = true` が助っ人。
- **判定基準（重要）**: teams.one 取込時、**当時の背番号があれば「元メンバー（脱退者）」= isGuest:false**、**背番号が無ければ助っ人 = isGuest:true**。
  - 背番号を持つ過去在籍者を助っ人扱いしないため。
  - 既に助っ人として作られたユーザーも、番号付きで再出現すれば元メンバーへ昇格（`scrape-details.ts` の `promoteIfNumbered`）。
- 助っ人は **メンバー一覧（/members）・個人成績ランキング（/stats）から除外**。試合結果詳細では表示し「助っ人」バッジ付き・プロフィールリンクなし。
- 結果入力画面の選手選択ドロップダウンでは助っ人を**末尾**に配置。
- 既知のエイリアス（別表記の同一人物）は `scrape-details.ts` の `MEMBER_ALIASES`（例: りゅうせい→RYUSEI）で統合。

---

## 16. LINE 連携（`src/lib/line.ts`）

- グループへのプッシュ送信。送信先は `LINE_GROUP_ID`、未設定時は DB `detectedLineGroupId`（Webhook で自動検出）。
- メッセージ生成: `buildReminder`（出欠リマインド。場所の🗺地図 URL・備考📝 を含む）、`buildAttendanceSummary`（出欠集計）、`buildLineup`/`buildLineupFromJson`（スタメン）、`buildGameResult`（試合結果。打者・投手成績含む）。
- 送信は管理画面のボタン（`LineAdminButton`）からプレビュー確認後に実行。送信成功時トースト。
- cron（`/api/cron/line-reminder`）で定期リマインド。

---

## 17. 写真ストレージ（Vercel Blob）

- すべて `access: 'public'`（公開 URL。URL はランダムで推測困難）。
- 保存パス: `members/`（メンバー写真）/ `score-photos/{scheduleId}/`（スコアシート）/ `albums/{albumId}/`（アルバム）。
- 表示は `next/image` 経由で自動圧縮・リサイズ配信（`next.config.ts` の `remotePatterns` に `*.public.blob.vercel-storage.com` 登録済み）。
- **無料枠の目安**: ストレージ約1GB・月数GB転送。アップロード時にクライアント圧縮（アルバムは長辺1600px/JPEG0.8 ≈ 0.3〜0.6MB）で 1GB あたり約2,000枚。
- アルバムは**ログイン必須ページ**でガード（A 案）。閲覧・投稿はメンバー、写真削除は管理者または投稿者本人、アルバム削除は管理者。

---

## 18. データ取込（teams.one スクレイピング）

ファイル: `prisma/scrape-details.ts`（実行: `npx tsx prisma/scrape-details.ts`、再処理は `RESCAN=1`）。

- 229 試合分の teams.one ゲーム ID を内蔵。各ページの打者・投手成績テーブル、イニングスコア、会場をパース。
- ユーザー解決: 背番号 → 正規化名 → そのまま、の順。未一致は `getOrCreatePlayerId`（背番号有=元メンバー / 無=助っ人）で作成。
- `MEMBER_ALIASES` で別表記を既存メンバーに統合。
- 取込済み試合は通常スキップ（投手成績の有無で判定）。`RESCAN=1` で全件再処理。
- 補修用スクリプトが `scripts/` に複数（audit-stats, fix-stats, check-* 等）。

---

## 19. DB マイグレーション運用

- **方式**: `prisma/migrate.ts` がビルド時に **冪等な SQL（ALTER ADD COLUMN / CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS）** を libsql に直接適用。`schema.prisma` も同時に更新してクライアント型を生成。
- 既適用の履歴（抜粋）: User.photoUrl / Game.scorebook / Schedule.dayGroupId(+index) / Game.scorePhoto / Setting テーブル / PhotoAlbum・Photo / User.isGuest。
- **新カラム追加の手順**:
  1. `schema.prisma` にカラム/モデル追加
  2. `migrate.ts` に冪等 SQL を追記
  3. `npx tsx prisma/migrate.ts && npx prisma generate`（ローカル確認）
  4. commit → デプロイ（ビルド時に本番 Turso へ適用）
- ⚠️ SQLite は NOT NULL 解除や型変更が苦手。`ADD COLUMN` 中心で設計する。

---

## 20. 共通 UX

- **トースト**: `Toast`（URL `?toast=` 方式、2.8 秒で自動消去。URL 検出 effect と消去タイマー effect を分離して「消えない」不具合を回避）。日程追加・LINE 送信は専用のクライアントトースト。
- **ローディング**: `src/app/loading.tsx`（全ルート共通スピナー）、`/admin/loading.tsx`、`/results/loading.tsx`、`/results/[id]/loading.tsx`（スケルトン）で遷移の体感を改善。
- **確認ダイアログ**: 削除等は `SubmitButton confirm=...` または `window.confirm`。
- **パフォーマンス**: 管理画面の重いページは DB クエリを `Promise.all` で並列化。

---

## 21. 既知の制約・注意点

1. **OCR 精度**: モバイル撮影は画質・サイズ制約で誤読あり。読み取り後は人間が手修正する前提。
2. **背番号の再利用**: 年代をまたいで同じ背番号が別人に再割当された場合、取込時の背番号一致で別人に紐づくリスク（pre-existing）。
3. **助っ人の臨時番号**: 取込で `#100〜#102` 等の臨時番号が「元メンバー」と判定される場合あり。必要に応じ手動で isGuest に戻す。
4. **スケジュール削除と lineupData**: 日程を削除→再作成すると ID が変わり、`lineupData_{旧ID}` が孤立しスタメンがプリセットされない（要再登録）。※将来は削除時の `lineupData_/lineupNote_` 連動削除を推奨。
5. **Blob は公開 URL**: 完全な非公開ではない（ページはログインでガード）。
6. **CRLF 警告**: Windows 環境で git が LF→CRLF 変換警告を出すが動作影響なし。

---

## 22. 運用手順（よくある操作）

- **日程追加**: `/admin/schedule` → 日付・種別・対戦相手・場所・集合/開始・メモ → 追加（EVENT は対戦相手不要、内容を記入）。
- **スタメン登録**: `/admin/lineup` → 対象試合を選び打順・守備・交代を設定 → 保存（→ 結果入力画面に自動プリセット）。LINE 配信も可。
- **試合結果入力**: `/admin/game` → 試合選択 → （スタメン/既存成績からプリセット）→ 「シートから読み込み」で OCR or 手入力 → BLITZ 得点はイニング欄で手修正可 → 保存（LINE 送信可）。
- **試合結果の削除**: `/results` の管理者用「削除」（結果のみ削除、日程は残る）。
- **出欠リマインド/出欠表送信**: `/admin` の各ボタンからプレビュー → 送信。
- **写真アルバム**: `/album`（ログイン）→ アルバム作成（日付＋タイトル）→ 写真追加。
- **規定打席の調整**: `/admin/settings`。

---

## 23. 開発・ビルド・デプロイ手順

```bash
# 依存インストール（postinstall で prisma generate）
npm install

# 開発サーバ
npm run dev

# 型チェック / Lint
npx tsc --noEmit
npm run lint

# 本番ビルド（migrate.ts → prisma generate → next build）
npm run build

# デプロイ（どちらか）
git push origin main          # Vercel 自動デプロイ
npx vercel deploy --prod      # 手動デプロイ
```

- コミットメッセージ末尾は `Co-Authored-By: Claude ...` を付与。
- `main` に push すると Vercel が自動ビルド & デプロイ。ビルド時に Turso へマイグレーションが走る。

---

## 24. 今後の TODO / 改善候補

- 日程削除時に `lineupData_/lineupNote_` 設定も連動削除（孤立防止）。
- 助っ人の臨時番号（#100〜）を助っ人に戻す微調整 UI。
- 年代をまたぐ背番号衝突に耐える選手解決（名前 + 年度の複合判定）。
- 公開ページのキャッシュ化（ISR）による表示高速化（現状はほぼ動的 ＝ 毎回 DB アクセス）。
- スコアシート OCR の精度向上（前処理・プロンプト改善）。
- 退団メンバーの「現役/OB」区分の導入（現状は isGuest と現役が混在しうる）。
- アルバムの厳格な非公開化（認証付き配信）が必要なら B 案を検討。

---

_本ドキュメントは仮運用開始時点のスナップショット。仕様変更時は本ファイル（`docs/AS_BUILT.md`）も更新すること。_
