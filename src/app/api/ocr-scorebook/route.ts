import { NextResponse } from 'next/server'
import { auth } from '@/auth'

/**
 * ocr-scorebook API route
 *
 * 【新アーキテクチャ】
 * クライアント側で 4隅マーカー検出 + ホモグラフィー補正 + セル切り出しを行い、
 * このエンドポイントには切り出し済みのセル画像（base64）が届く。
 *
 * FormData:
 *   cells   : JSON string  →  { "1": { "1": "data:image/jpeg;base64,...", "2": "..." }, ... }
 *             打順(1-9) × イニング(1-N) の切り出しセル画像
 *   image   : File         →  元画像（スコア読み取り用）
 *   innings : string       →  イニング数
 *
 * 【処理フロー】
 *   1. スコア読み取り (元画像 × 1コール)
 *   2. 打者セル読み取り (打順3行ずつ × 3並列コール)
 *      各コールには切り出しセル画像を渡す → AI は「この小さい画像に何が書いてあるか」だけ答えればよい
 */

// ── 型定義 ──────────────────────────────────────────────────────

interface OcrResult {
  ourScore:      number | null
  opponentScore: number | null
  inningScores?: {
    our:      (number | null)[]
    opponent: (number | null)[]
  }
  batterCells: Record<string, Record<string, string>>
}

// ── Anthropic Vision 呼び出しヘルパー ───────────────────────────

async function callVision(
  apiKey:    string,
  model:     string,
  content:   object[],   // Anthropic messages content array
  maxTokens: number,
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content }],
    }),
  })

  if (!res.ok) {
    const err  = await res.json().catch(() => ({}))
    const msg  = err?.error?.message ?? JSON.stringify(err)
    const hint =
      res.status === 401 ? 'APIキーが無効です' :
      res.status === 404 ? `モデルが見つかりません (${model})` :
      res.status === 429 ? 'API利用制限に達しました' :
      res.status === 402 ? 'クレジット不足' : ''
    throw new Error(hint || `Anthropic API ${res.status}: ${msg}`)
  }

  const data = await res.json()
  return data.content?.[0]?.text ?? ''
}

// ── プロンプト生成 ───────────────────────────────────────────────

/** スコア読み取り用プロンプト（元画像全体を使う） */
function makeScoreContent(
  imageBase64: string,
  mimeType:    string,
  innings:     number,
): object[] {
  return [
    {
      type: 'image',
      source: { type: 'base64', media_type: mimeType, data: imageBase64 },
    },
    {
      type: 'text',
      text: `ソフトボールのスコアシートです。イニングスコアと合計点だけを読み取ってください。打者行は無視してください。

JSONのみ返してください:
{
  "ourScore": <BLITZの合計点またはnull>,
  "opponentScore": <相手の合計点またはnull>,
  "inningScores": {
    "our":      [<1回>, <2回>, ..., <${innings}回>],
    "opponent": [<1回>, <2回>, ..., <${innings}回>]
  }
}
inningScoresは${innings}要素（読み取れない回はnull）。合計点は右端の「計」欄から読む。`,
    },
  ]
}

/**
 * 打者行のセル読み取り用コンテント配列を生成
 * 各セル画像を渡し、AIは「どのセルに何が書いてあるか」だけ答える
 */
function makeCellsContent(
  order:      number,
  cellImages: Record<string, string>,  // inning → dataUrl
  innings:    number,
): object[] {
  const sortedInnings = Object.keys(cellImages)
    .map(Number)
    .sort((a, b) => a - b)

  if (sortedInnings.length === 0) return []

  const content: object[] = []

  // 各セル画像をコンテントに追加
  for (const inn of sortedInnings) {
    const dataUrl = cellImages[String(inn)]
    // "data:image/jpeg;base64,xxxxx" → base64部分だけ抽出
    const base64  = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '')
    content.push({
      type:   'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
    })
  }

  // テキスト指示
  const innList = sortedInnings.join('、')
  content.push({
    type: 'text',
    text: `上の画像は打順${order}の各イニングセル画像です（左から${innList}回の順番、計${sortedInnings.length}枚）。

【★セル構造★】
各セル画像は縦線で左右に分かれています：
  - 左側（広い部分）= 打撃コード（O/1/2/3/4/B/D/S/X）
  - 右側（狭い部分）= 打点の数字（0〜9、無ければ空白）
合わせて1つのコードです。例：左「2」＋右「1」→「21」（二塁打打点1）

【★絶対ルール★】
- 1枚の画像 = 1イニング分（1コード）
- 「21」「11」「43」は2イニングではなく「打撃コード＋打点」の1コード
- 画像枚数を超えるキーは返さない（${sortedInnings.length}枚 = ${sortedInnings.length}イニング分のみ）

【コード一覧】
O=アウト（大文字のO・英字）  1=単打  2=二塁打  3=三塁打  4=本塁打
B=四球    D=死球  S=犠打    X=犠飛
打点=コード直後の数字（例: "11"=単打打点1, "43"=本塁打打点3）
盗塁=コード末尾に小文字s（例: "1s"=単打盗塁, "11s"=単打打点1盗塁）
2打席目以降=カンマで結合（例: "O,1"=1打席目アウト・2打席目単打）

【★重要★】アウトは必ず大文字の「O」（英字オー）。数字の「0」（ゼロ）は使わない。

【返答形式】JSONのみ（説明不要）:
{${sortedInnings.map(n => `"${n}": "コード"`).join(', ')}}

- キーは必ずイニング番号（${sortedInnings.map(n => `"${n}"`).join('/')}）のみ
- 空白・読み取れないセルはキー省略
- イニング番号の最大値: ${innings}`,
  })

  return content
}

// ── レスポンス正規化 ─────────────────────────────────────────────

function normalizeCode(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.split(/[,、]/).map(part => {
    const p = part.trim().replace(/\s+/g, '')
    if (!p || p === '?') return p
    const upper = p.toUpperCase()
    // 例: "11S", "1S1", "O", "B", "43" → 正規化
    const m = upper.match(/^([KGFO1234BDSX])(S?)([0-9]?)(S?)$/)
    if (!m) return p
    const base  = m[1]
    const hasSb = m[2] === 'S' || m[4] === 'S'
    const rbi   = m[3] || ''
    return base + rbi + (hasSb ? 's' : '')
  }).filter(Boolean).join(',')
}

function extractJson(text: string): unknown {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

// ── POST ハンドラ ────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY が設定されていません' },
      { status: 503 }
    )
  }

  // ── FormData パース ──────────────────────────────────────────
  let imageBase64 = ''
  let mimeType    = 'image/jpeg'
  let innings     = 7
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cellsData: Record<string, Record<string, string>> = {}  // order → inning → dataUrl
  let hasCells    = false

  try {
    const fd = await request.formData()

    // 元画像（スコア読み取り用）
    const file = fd.get('image') as File | null
    if (file) {
      const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
      mimeType = file.type || 'image/jpeg'
      if (!allowed.includes(mimeType)) {
        return NextResponse.json({ error: '対応していない画像形式です' }, { status: 400 })
      }
      if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: '画像サイズが大きすぎます（10MB 以下）' }, { status: 400 })
      }
      imageBase64 = Buffer.from(await file.arrayBuffer()).toString('base64')
    }

    innings = Math.min(9, Math.max(5, parseInt(fd.get('innings') as string) || 7))

    // 切り出しセル画像 JSON
    const cellsJson = fd.get('cells') as string | null
    if (cellsJson) {
      cellsData = JSON.parse(cellsJson)
      hasCells  = Object.keys(cellsData).length > 0
    }
  } catch {
    return NextResponse.json({ error: 'リクエストの解析に失敗しました' }, { status: 400 })
  }

  const model = process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-5'

  // ── API コール ────────────────────────────────────────────────

  let rawScores: unknown = null
  const rawCells: Record<string, unknown> = {}  // order → parsed JSON

  try {
    if (hasCells) {
      // 【新方式】セル切り出しあり
      // スコア読み取り + 打順グループ3つを並列実行
      const orderGroups = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]

      const promises: Promise<void>[] = []

      // スコア読み取り（元画像が提供された場合）
      if (imageBase64) {
        const scorePromise = callVision(
          apiKey, model,
          makeScoreContent(imageBase64, mimeType, innings),
          512,
        ).then(text => { rawScores = extractJson(text) })
        promises.push(scorePromise)
      }

      // 打者行読み取り（3グループ並列）
      for (const group of orderGroups) {
        const groupPromise = (async () => {
          const groupCalls = group
            .filter(order => cellsData[String(order)] && Object.keys(cellsData[String(order)]).length > 0)
            .map(async order => {
              const content = makeCellsContent(order, cellsData[String(order)], innings)
              if (content.length === 0) return
              try {
                const text   = await callVision(apiKey, model, content, 256)
                const parsed = extractJson(text)
                if (parsed) rawCells[String(order)] = parsed
              } catch (e) {
                console.error(`[ocr] order ${order} error:`, e)
              }
            })
          await Promise.all(groupCalls)
        })()
        promises.push(groupPromise)
      }

      await Promise.all(promises)
    } else if (imageBase64) {
      // 【フォールバック】セル切り出しなし → 元画像から全行読み取り
      console.warn('[ocr] no cell images — falling back to full-image OCR')
      const [textA, textB, textC, textD] = await Promise.all([
        callVision(apiKey, model, makeScoreContent(imageBase64, mimeType, innings), 512),
        callVision(apiKey, model, makeFullRowsContent([1, 2, 3], innings, imageBase64, mimeType), 1024),
        callVision(apiKey, model, makeFullRowsContent([4, 5, 6], innings, imageBase64, mimeType), 1024),
        callVision(apiKey, model, makeFullRowsContent([7, 8, 9], innings, imageBase64, mimeType), 1024),
      ])
      rawScores = extractJson(textA)
      for (const [text, orders] of [[textB, [1, 2, 3]], [textC, [4, 5, 6]], [textD, [7, 8, 9]]] as const) {
        const parsed = extractJson(text as string) as { batterCells?: Record<string, unknown> } | null
        if (parsed?.batterCells) {
          for (const o of orders) {
            if (parsed.batterCells[String(o)]) rawCells[String(o)] = parsed.batterCells[String(o)]
          }
        }
      }
    } else {
      return NextResponse.json({ error: '画像またはセルデータが必要です' }, { status: 400 })
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    console.error('[ocr] error:', detail)
    return NextResponse.json({ error: detail }, { status: 502 })
  }

  // ── 結果組み立て ─────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = rawScores as any
  const result: OcrResult = {
    ourScore:      s?.ourScore      != null ? Number(s.ourScore)      : null,
    opponentScore: s?.opponentScore != null ? Number(s.opponentScore) : null,
    batterCells:   {},
  }

  if (s?.inningScores) {
    result.inningScores = {
      our:      Array.isArray(s.inningScores.our)      ? s.inningScores.our      : [],
      opponent: Array.isArray(s.inningScores.opponent) ? s.inningScores.opponent : [],
    }
  }

  // セル読み取り結果をマージ
  for (let order = 1; order <= 9; order++) {
    const key       = String(order)
    result.batterCells[key] = {}

    const raw = rawCells[key]
    if (!raw || typeof raw !== 'object') continue

    for (const [innKey, val] of Object.entries(raw as Record<string, unknown>)) {
      const code = normalizeCode(val)
      if (code) result.batterCells[key][innKey] = code
    }
  }

  const cellCount = Object.values(result.batterCells)
    .reduce((n, row) => n + Object.keys(row).length, 0)
  console.log(`[ocr] done: ${cellCount} cells from ${hasCells ? 'extracted cells' : 'full image'}`)

  return NextResponse.json({ data: result })
}

// ── フォールバック用: 全画像から行グループ読み取り ────────────────

function makeFullRowsContent(
  orders:      readonly number[],
  innings:     number,
  imageBase64: string,
  mimeType:    string,
): object[] {
  const orderList = orders.join('、')
  return [
    {
      type: 'image',
      source: { type: 'base64', media_type: mimeType, data: imageBase64 },
    },
    {
      type: 'text',
      text: `打順${orderList}の行のみ読み取ります。

【★絶対ルール★】2つの数字が隣り合っている場合（"21","11","43"等）→ 1イニング分（打撃コード+打点）。2つの別イニングとして読まない。
各行のセル数は必ず${innings}個以下。${innings}を超えたら打点数字を別イニングとして誤読しています→修正する。

コード: O=アウト 1=単打 2=二塁打 3=三塁打 4=本塁打 B=四球 D=死球 S=犠打 X=犠飛
打点: コード直後の数字。盗塁: 末尾s。2打席目: カンマ区切り

JSONのみ:
{"batterCells":{"${orders[0]}":{"1":"O","2":"11"},"${orders[1]}":{},"${orders[2]}":{}}}
キー: 打順(${orders.map(o => `"${o}"`).join('/')})、イニング("1"〜"${innings}")、空セルはキー省略、不明は"?"`,
    },
  ]
}
