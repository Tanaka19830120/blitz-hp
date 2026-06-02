import { NextResponse } from 'next/server'
import { auth } from '@/auth'

/**
 * ocr-scorebook API route
 *
 * 【アーキテクチャ】
 * クライアント側でセル切り出し（四隅マーカー + バイリニア補間）を行い、
 * このエンドポイントには4象限に分割済みのサブ画像が届く。
 *
 * FormData:
 *   image   : File   — 元画像（イニングスコア読み取り用）
 *   innings : string — イニング数
 *   cells   : JSON   — 打順 × イニング × サブ画像
 *             { "1": { "1": { ab1, rbi1, ab2, rbi2 }, ... }, ... }
 *
 * 【処理フロー】
 *   AI の役割: サブ画像1枚に書かれた「1文字の OCR」のみ
 *   コードの役割: OCR 結果から打撃コード文字列を組み立てる（ルールベース）
 *
 *   1. イニングスコア読み取り（元画像 × 1コール）
 *   2. 打者セル OCR（打順3行ずつ × 3並列コール）
 *      各コールには4象限サブ画像を渡す
 *   3. ルールベース組み立て: {ab1, rbi1, ab2, rbi2} → "O" / "11" / "1s,O" 等
 */

// ── 型定義 ─────────────────────────────────────────────────────────

interface CellSubData {
  ab1:  string        // dataUrl
  rbi1: string        // dataUrl
  ab2:  string | null // dataUrl or null
  rbi2: string | null // dataUrl or null
  preAb1?: string     // クライアント形状分類: 'O'|'1'|'SKIP' (Claudeより優先)
  preAb2?: string
}

// OCR 結果: イニング → {ab1, rbi1, ab2, rbi2} の文字
interface OcrCellResult {
  ab1:  string | null
  rbi1: string | null
  ab2:  string | null
  rbi2: string | null
}

interface OcrResult {
  ourScore:      number | null
  opponentScore: number | null
  inningScores?: {
    our:      (number | null)[]
    opponent: (number | null)[]
  }
  batterCells: Record<string, Record<string, string>>
}

// ── Anthropic Vision 呼び出しヘルパー ──────────────────────────────

async function callVision(
  apiKey:    string,
  model:     string,
  content:   object[],
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

// ── プロンプト生成 ──────────────────────────────────────────────────

/** イニングスコア読み取り用（元画像全体） */
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
 * 打者セル OCR 用コンテント配列を生成。
 *
 * AIへの指示: 各サブ画像に書かれた「1文字」を読むだけ。
 * 意味解釈（コード組み立て）はしない。
 *
 * 画像の並び順:
 *   イニングごとに [ab1, rbi1] （2打席目があれば [ab1, rbi1, ab2, rbi2]）
 *
 * 期待する返答: { "1": {"ab1":"O","rbi1":null,"ab2":null,"rbi2":null}, ... }
 */
/**
 * 打者セル OCR 用コンテント配列を生成 (interleaved 形式)。
 *
 * 各画像の直前にラベルテキストを挿入することで
 * 「どの画像がどのイニングの何の欄か」をAIが絶対に間違えないようにする。
 *
 * 構造:
 *   [text: ルール説明]
 *   [text: "=== 1回 === 上段コード欄:"] [image: ab1]
 *   [text: "上段打点欄:"] [image: rbi1]
 *   ([text: "下段コード欄(2打席目):"] [image: ab2]  ← 下段に記入あり時のみ)
 *   ([text: "下段打点欄(2打席目):"] [image: rbi2])
 *   [text: "=== 2回 === ..."]
 *   ...
 *   [text: JSONのみ返してください: {...}]
 */
function makeCellsContent(
  order:    number,
  cellData: Record<string, CellSubData>,
): object[] {
  const sortedInnings = Object.keys(cellData).map(Number).sort((a, b) => a - b)
  if (sortedInnings.length === 0) return []

  const toB64 = (url: string) => url.replace(/^data:image\/[a-z]+;base64,/, '')
  const img   = (url: string): object => ({
    type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: toB64(url) },
  })

  const content: object[] = []

  // ── ルール説明 (冒頭1回だけ) ──────────────────────────────────
  content.push({
    type: 'text',
    text: `打順${order}のスコアブックセル画像を読んでください。

【重要】空欄判定の基準:
・黒い塗りつぶし円や明確な文字がある → 文字を返す
・完全に白い、薄いグレー背景のみ、かすかな枠線だけ → null
・少しでも迷ったら null を返す（空欄の誤認識を防ぐため）

【コード欄 (ab1/ab2)】存在しうる文字: O 1 2 3 4 B D S X のみ
・黒く塗られた丸→「O」 ・縦線・「/」→「1」 ・「8」→「B」 ・「5」→「S」
・盗塁は末尾s (1s, Os 等)
・「0」(数字ゼロ)は存在しない。必ず「O」(大文字オー)

【打点欄 (rbi1/rbi2)】数字1〜9またはnull のみ
・「/」「|」→「1」

注意: 打点欄(右)に記号があっても、それは打点(rbi)であり2打席目(ab2)ではない
`,
  })

  // ── イニングごとに画像を挿入 ─────────────────────────────────
  for (const inn of sortedInnings) {
    const cell   = cellData[String(inn)]
    const hasAb2 = !!cell.ab2

    content.push({ type: 'text', text: `\n=== ${inn}回 ===\nコード欄(ab1): 黒い塗りつぶしや文字がありますか？空欄ならnull:` })
    content.push(img(cell.ab1))
    content.push({ type: 'text', text: '打点欄(rbi1): 数字が書かれていますか？空欄ならnull:' })
    content.push(img(cell.rbi1))

    if (hasAb2 && cell.ab2 && cell.rbi2) {
      content.push({ type: 'text', text: 'コード欄(ab2): 黒い塗りつぶしや文字がありますか？空欄ならnull:' })
      content.push(img(cell.ab2))
      content.push({ type: 'text', text: '打点欄(rbi2): 数字が書かれていますか？空欄ならnull:' })
      content.push(img(cell.rbi2))
    }
  }

  // ── 期待するJSONキー構造 ─────────────────────────────────────
  const expectedKeys = sortedInnings.map(inn => {
    const cell = cellData[String(inn)]
    const keys = cell.ab2
      ? `"ab1":null,"rbi1":null,"ab2":null,"rbi2":null`
      : `"ab1":null,"rbi1":null`
    return `"${inn}":{${keys}}`
  }).join(', ')

  content.push({
    type: 'text',
    text: `\nJSONのみ返してください:\n{${expectedKeys}}`,
  })

  return content
}

// ── ルールベース組み立て ───────────────────────────────────────────

/**
 * 1打席分の OCR 結果 → 打撃コード文字列
 * code: O/1/2/3/4/B/D/S/X + 末尾 s（盗塁）
 * rbi:  1-9 の数字
 * 例: code="1", rbi="1" → "11"
 *     code="1s", rbi=""  → "1s"
 *     code="1s", rbi="1" → "11s"
 */
function buildAtBat(
  code: string | null | undefined,
  rbi:  string | null | undefined,
): string {
  if (!code || code === 'null') return ''
  const raw = String(code).trim()
  if (!raw) return ''

  // 末尾の s は盗塁フラグ（'S' 単体は犠打）
  const hasSb = raw.length > 1 && raw.at(-1)?.toLowerCase() === 's'
  const baseRaw = hasSb ? raw.slice(0, -1) : raw
  let base = baseRaw.toUpperCase()

  // ★ '0'（数字ゼロ）→ 'O'（アルファベット）の正規化
  //    手書きの「O」をAIが数字の「0」と読むケースを救済
  if (base === '0') base = 'O'

  const VALID = new Set(['O', '1', '2', '3', '4', 'B', 'D', 'S', 'X'])
  if (!VALID.has(base)) return ''

  const rbiStr = rbi ? String(rbi).trim() : ''
  const rbiDigit = /^[1-9]$/.test(rbiStr) ? rbiStr : ''

  return base + rbiDigit + (hasSb ? 's' : '')
}

/**
 * OCR 結果 {ab1, rbi1, ab2, rbi2} → 最終打撃コード文字列
 * 2打席目があればカンマ結合: "O,11"
 */
function assembleCode(result: OcrCellResult): string {
  const parts: string[] = []
  const p1 = buildAtBat(result.ab1, result.rbi1)
  if (p1) parts.push(p1)
  if (result.ab2) {
    const p2 = buildAtBat(result.ab2, result.rbi2)
    if (p2) parts.push(p2)
  }
  return parts.join(',')
}

// ── JSON パーサ ────────────────────────────────────────────────────

function extractJson(text: string): unknown {
  // ブラケットカウント方式: 最初の '{' から対応する '}' までを正確に抽出
  // 単純な greedy regex だと "Note: cell {2}" のような後続テキストで誤マッチする
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)) } catch { return null }
      }
    }
  }
  return null
}

// ── POST ハンドラ ─────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY が設定されていません' },
      { status: 503 },
    )
  }

  // ── FormData パース ──────────────────────────────────────────
  let imageBase64 = ''
  let mimeType    = 'image/jpeg'
  let innings     = 7
  let cellsData: Record<string, Record<string, CellSubData>> = {}
  let hasCells = false

  try {
    const fd = await request.formData()

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

    const cellsJson = fd.get('cells') as string | null
    if (cellsJson) {
      console.log('[ocr-scorebook] cells JSON size:', (cellsJson.length / 1024).toFixed(1), 'KB')
      cellsData = JSON.parse(cellsJson)
      hasCells  = Object.keys(cellsData).length > 0
      console.log('[ocr-scorebook] parsed cells:', Object.keys(cellsData).length, 'batters')
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    console.error('[ocr-scorebook] FormData解析エラー:', detail)
    return NextResponse.json({
      error: `リクエストの解析に失敗しました: ${detail}`
    }, { status: 400 })
  }

  const model = process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-5'

  // ── API コール ──────────────────────────────────────────────
  let rawScores: unknown = null
  // order → inning → OcrCellResult
  const rawOcr: Record<string, Record<string, OcrCellResult>> = {}

  try {
    if (hasCells) {
      const orderGroups = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
      const promises: Promise<void>[] = []

      // スコア読み取り
      if (imageBase64) {
        promises.push(
          callVision(apiKey, model, makeScoreContent(imageBase64, mimeType, innings), 512)
            .then(text => { rawScores = extractJson(text) })
        )
      }

      // 打者行 OCR（3グループ並列）
      for (const group of orderGroups) {
        promises.push((async () => {
          await Promise.all(group.map(async order => {
            const orderCells = cellsData[String(order)]
            if (!orderCells || Object.keys(orderCells).length === 0) return

            const content = makeCellsContent(order, orderCells)
            if (content.length === 0) return

            try {
              const text   = await callVision(apiKey, model, content, 1024)
              const parsed = extractJson(text)
              if (parsed && typeof parsed === 'object') {
                rawOcr[String(order)] = parsed as Record<string, OcrCellResult>
              }
            } catch (e) {
              console.error(`[ocr] order ${order} error:`, e)
            }
          }))
        })())
      }

      await Promise.all(promises)

    } else if (imageBase64) {
      // セル切り出しなし（フォールバック: 元画像から全行読み取り）
      console.warn('[ocr] no cell images — falling back to full-image OCR')
      const [textA, textB, textC, textD] = await Promise.all([
        callVision(apiKey, model, makeScoreContent(imageBase64, mimeType, innings), 512),
        callVision(apiKey, model, makeFullRowsContent([1, 2, 3], innings, imageBase64, mimeType), 1024),
        callVision(apiKey, model, makeFullRowsContent([4, 5, 6], innings, imageBase64, mimeType), 1024),
        callVision(apiKey, model, makeFullRowsContent([7, 8, 9], innings, imageBase64, mimeType), 1024),
      ])
      rawScores = extractJson(textA)
      for (const [text, orders] of [
        [textB, [1, 2, 3]], [textC, [4, 5, 6]], [textD, [7, 8, 9]],
      ] as [string, number[]][]) {
        const parsed = extractJson(text) as { batterCells?: Record<string, unknown> } | null
        if (parsed?.batterCells) {
          for (const o of orders) {
            const raw = parsed.batterCells[String(o)]
            if (raw && typeof raw === 'object') {
              // フォールバック: 旧形式 {inning: code} を OcrCellResult 形式に変換
              rawOcr[String(o)] = {}
              for (const [inn, code] of Object.entries(raw as Record<string, string>)) {
                rawOcr[String(o)][inn] = { ab1: String(code), rbi1: null, ab2: null, rbi2: null }
              }
            }
          }
        }
      }
    } else {
      return NextResponse.json({ error: '画像またはセルデータが必要です' }, { status: 400 })
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    const stack = e instanceof Error ? e.stack : undefined
    console.error('[ocr-scorebook] API呼び出しエラー:', {
      error: detail,
      stack,
      name: e instanceof Error ? e.name : typeof e,
      cause: e instanceof Error ? e.cause : undefined,
    })
    return NextResponse.json({
      error: `OCR処理エラー: ${detail}`,
      details: stack ? stack.split('\n').slice(0, 5).join('\n') : undefined
    }, { status: 502 })
  }

  // ── 結果組み立て ────────────────────────────────────────────
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

  // OCR 結果 → 打撃コード文字列
  for (let order = 1; order <= 9; order++) {
    const key = String(order)
    result.batterCells[key] = {}

    const orderOcr   = rawOcr[key]
    const orderCells = cellsData[key]

    // ── Claude の OCR 結果を処理 ────────────────────────────────
    if (orderOcr && typeof orderOcr === 'object') {
      for (const [innKey, ocrResult] of Object.entries(orderOcr)) {
        let code: string
        if (typeof ocrResult === 'string') {
          // フォールバック旧形式をそのまま使用
          code = ocrResult
        } else {
          // クライアント形状分類 (preAb1/preAb2) で Claude 結果を上書き
          const meta = orderCells?.[innKey]
          const raw  = ocrResult as OcrCellResult
          const ab1  = meta?.preAb1 === 'SKIP' ? null
                     : (meta?.preAb1 === 'O' || meta?.preAb1 === '1') ? meta.preAb1
                     : raw.ab1
          const ab2  = meta?.preAb2 === 'SKIP' ? null
                     : (meta?.preAb2 === 'O' || meta?.preAb2 === '1') ? meta.preAb2
                     : raw.ab2
          code = assembleCode({ ab1, rbi1: raw.rbi1, ab2, rbi2: raw.rbi2 })
        }
        if (code) result.batterCells[key][innKey] = code
      }
    }

    // ── preAb のみのイニング（Claude 未返答だが形状分類あり）を追加 ──
    if (orderCells) {
      for (const [innKey, cell] of Object.entries(orderCells)) {
        if (result.batterCells[key][innKey]) continue  // Claude 結果で既に設定済み
        const pre = cell.preAb1 === 'O' || cell.preAb1 === '1' ? cell.preAb1 : null
        if (pre) {
          const code = buildAtBat(pre, null)
          if (code) result.batterCells[key][innKey] = code
        }
      }
    }
  }

  const cellCount = Object.values(result.batterCells)
    .reduce((n, row) => n + Object.keys(row).length, 0)
  console.log(`[ocr] done: ${cellCount} cells from ${hasCells ? 'sub-image OCR' : 'full image'}`)

  // rawOcr をレスポンスに含める（クライアント側デバッグ表示用）
  return NextResponse.json({ data: result, rawOcr })
}

// ── フォールバック: 全画像から行グループ読み取り ─────────────────

function makeFullRowsContent(
  orders:      readonly number[],
  innings:     number,
  imageBase64: string,
  mimeType:    string,
): object[] {
  const orderList = orders.join('、')
  return [
    {
      type:   'image',
      source: { type: 'base64', media_type: mimeType, data: imageBase64 },
    },
    {
      type: 'text',
      text: `打順${orderList}の行のみ読み取ります。

【★絶対ルール★】隣り合う数字（"21","11","43"等）→ 1イニング分（打撃コード+打点）。
各行セル数は最大${innings}個。${innings}を超えたら打点を別イニングと誤読しています→修正する。

コード: O=アウト 1=単打 2=二塁打 3=三塁打 4=本塁打 B=四球 D=死球 S=犠打 X=犠飛
打点: コード直後の数字。盗塁: 末尾s。2打席目: カンマ区切り。

JSONのみ:
{"batterCells":{"${orders[0]}":{"1":"O","2":"11"},"${orders[1]}":{},"${orders[2]}":{}}}
キー: 打順(${orders.map(o => `"${o}"`).join('/')})、イニング("1"〜"${innings}")、空セルはキー省略`,
    },
  ]
}
