import { NextResponse } from 'next/server'
import { auth } from '@/auth'

// Anthropic Vision を使ってスコアシート写真から打者セルを読み取る
// 必要な環境変数: ANTHROPIC_API_KEY
// オプション: ANTHROPIC_MODEL (デフォルト: claude-3-5-sonnet-20241022)

interface OcrResult {
  ourScore:      number | null
  opponentScore: number | null
  batterCells:   Record<string, Record<string, string>>
}

export async function POST(request: Request): Promise<Response> {
  // Auth check
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY が設定されていません。Vercel 環境変数に追加してください。' },
      { status: 503 }
    )
  }

  let imageBase64: string
  let mimeType:    string
  let innings:     number

  try {
    const formData = await request.formData()
    const file     = formData.get('image') as File | null
    if (!file) return NextResponse.json({ error: '画像ファイルが見つかりません' }, { status: 400 })

    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
    mimeType = file.type || 'image/jpeg'
    if (!allowed.includes(mimeType)) {
      return NextResponse.json({ error: '対応していない画像形式です (JPEG/PNG/WebP)' }, { status: 400 })
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: '画像サイズが大きすぎます（10MB 以下にしてください）' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    imageBase64  = buffer.toString('base64')
    innings      = Math.min(9, Math.max(5, parseInt(formData.get('innings') as string) || 7))
  } catch {
    return NextResponse.json({ error: 'リクエストの解析に失敗しました' }, { status: 400 })
  }

  const model = process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-20241022'

  const prompt = `あなたはソフトボールのスコアシートを読み取るアシスタントです。
この画像はソフトボールの手書きスコア記入シートです。

【シートの構造】
1. 「イニングスコア」テーブル: BLITZチームと相手チームのイニング別得点
2. 「打者成績」グリッド:
   - 行: 打順 1〜9（左端に番号が印刷されています）
   - 列: イニング 1〜${innings}（上部に番号が印刷されています）
   - 各セルは上段（1打席目）と下段（2打席目）に分かれています
   - 手書きコードが書かれていないセルは空欄です

【コードの種類（大文字小文字どちらでも可）】
O = アウト（三振・ゴロ・フライすべて）
1 = 単打, 2 = 二塁打, 3 = 三塁打, 4 = 本塁打
B = 四球, D = 死球, S = 犠打, X = 犠飛
数字サフィックス = 打点数（例: "12" = 単打で2打点、"42" = 本塁打2打点）
"s" サフィックス = 盗塁（例: "1s" = 単打後に盗塁、"12s" = 単打2打点盗塁）

【2打席の扱い】
セルの上半分に1打席目、下半分に2打席目が書かれています。
2打席とも記録がある場合は "O,1" のようにカンマ区切りで返してください。

【返却フォーマット】
JSONのみ返してください（説明文や\`\`\`コードブロックは不要）:
{
  "ourScore": <BLITZの合計点（イニングスコアの「計」欄）、数字またはnull>,
  "opponentScore": <相手の合計点、数字またはnull>,
  "batterCells": {
    "1": { "1": "O", "2": "1s", "5": "B" },
    "2": { "1": "O", "3": "2" },
    "3": {},
    ...
  }
}

【注意事項】
- batterCells の第1キー: 打順 (1〜9、文字列)
- batterCells の第2キー: イニング番号 (1〜${innings}、文字列)
- 空白セルのキーは省略してください
- 読み取れない場合は "?" を使用してください
- すべての打順 1〜9 のキーを含めてください（空の場合は {} ）
- コードはすべて大文字で返してください`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type:       'base64',
                media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
                data:       imageBase64,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        }],
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('[ocr-scorebook] Anthropic API error:', err)
      return NextResponse.json(
        { error: `Anthropic API エラー: ${res.status} ${JSON.stringify(err)}` },
        { status: 502 }
      )
    }

    const apiResp = await res.json()
    const text    = apiResp.content?.[0]?.text ?? ''

    // JSON を抽出（```json ... ``` で囲まれている場合も対応）
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[ocr-scorebook] No JSON found in response:', text)
      return NextResponse.json({ error: 'AIの応答からJSONを抽出できませんでした' }, { status: 500 })
    }

    const parsed: OcrResult = JSON.parse(jsonMatch[0])

    // Validate batterCells
    if (!parsed.batterCells || typeof parsed.batterCells !== 'object') {
      parsed.batterCells = {}
    }
    // Ensure all 9 batter rows exist
    for (let i = 1; i <= 9; i++) {
      if (!parsed.batterCells[String(i)]) parsed.batterCells[String(i)] = {}
    }

    return NextResponse.json({ data: parsed })
  } catch (e) {
    console.error('[ocr-scorebook] error:', e)
    return NextResponse.json({ error: 'OCR処理中にエラーが発生しました' }, { status: 500 })
  }
}
