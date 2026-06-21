/**
 * cellExtractor.ts — スコアシート位置検出 + バブル検出
 *
 * 処理フロー:
 * 1. コントラスト強調（ヒストグラム伸長）
 * 2. 四隅の黒マーカー（7mm×7mm正方形）を検出
 * 3. 4点からバイリニア座標マッピング（台形歪み補正）
 * 4. イニンググリッド外枠（太線 3.5pt）をスキャンしてグリッド精密化
 *    - 左端縦線 / 右端縦線 / 下端横線 を暗画素密度スキャンで検出
 *    - 上端は下端 + 行高 × 9行 から逆算
 * 5. 各セルを全体抽出してバブル塗りつぶし検出
 *    code    : 打撃コード (O/1/2/3/4/B/D/S/X)
 *    rbi     : 打点 (1/2/3/4)
 *    stolen  : 盗塁 (true/false)
 *
 * 印刷シート: scorebook-sheet/page.tsx (A4横向き, 7回戦)
 * バブル位置: src/lib/markSheetConfig.ts で一元管理
 */

import {
  CODE_BUBBLES, RBI_BUBBLES, STOLEN_BUBBLE,
  BUBBLE_R_RATIO, FILL_THRESHOLD,
} from './markSheetConfig'

// ── 型定義 ────────────────────────────────────────────────────────

interface Point { x: number; y: number }

interface Markers {
  tl: Point; tr: Point; bl: Point; br: Point
}

/** セルごとの検出結果 */
export interface CellSubImages {
  order:  number        // 打順 1-9
  inning: number        // イニング 1-N
  image:  string        // dataUrl: セル全体プレビュー（デバッグ表示用）
  // 一巡目 (上段)
  ab1code:   string | null  // バブル検出コード (参考値)
  ab1rbi:    string | null
  ab1stolen: boolean
  ab1img:    string         // コード欄サブ画像 (AI OCR 用)
  ab1rbiImg: string         // 打点欄サブ画像 (AI OCR 用)
  // 二巡目 (下段)
  ab2code:   string | null
  ab2rbi:    string | null
  ab2stolen: boolean
  ab2img:    string         // コード欄サブ画像 (AI OCR 用)
  ab2rbiImg: string         // 打点欄サブ画像 (AI OCR 用)
  // 後方互換 (= ab1 の値)
  code:   string | null
  rbi:    string | null
  stolen: boolean
}

export interface ExtractionResult {
  cells:         CellSubImages[]
  cornersFound:  boolean
  markers:       Markers | null
  debugImageUrl: string | null
}

// ── 紙寸法 (横向き A4) ────────────────────────────────────────────

/** 紙の物理寸法 (mm) — 横向き A4 */
const PAPER_W_MM = 297
const PAPER_H_MM = 210

// ── テンプレート定数 (横向き A4) ──────────────────────────────────
//
// @page margin: 6mm → コンテンツエリア 285mm × 198mm
// 列構成: 打順4.5+番4+名前15+守5=28.5% → innStart=87.225mm
//         イニング(100-28.5-15)/7=8.071%×7=56.5% → innEnd=248.25mm
//         成績5×3%=15%
//
// 行構成 (縦): margin6 + header8 + 先攻5 + 後攻5 = 24mm → イニングヘッダー行上端
//   イニングヘッダー行 ~4mm → tableTop≈28mm
//   打者行 11mm × 12 = 132mm → tableBot = 160mm

const TMPL = {
  innStart:     87.225 / PAPER_W_MM,  // 0.2937 (守列右端 = イニング列左端)
  innEnd:       248.25  / PAPER_W_MM, // 0.8359 (イニング列右端 = 成績列左端)
  tableTop:     28      / PAPER_H_MM, // 0.1333 (打者行1の上端)
  rowHeight:    11      / PAPER_H_MM, // 0.0524 (行高 11mm)
  templateInns: 7,
  batters:      12,
} as const

// 外角マーカー中心: 6mm margin + 3.5mm (7mm marker の半径)
const MARKER = {
  left:  9.5   / PAPER_W_MM,  // 0.0320
  right: 287.5 / PAPER_W_MM,  // 0.9680
  top:   9.5   / PAPER_H_MM,  // 0.0452
  bot:   200.5 / PAPER_H_MM,  // 0.9548
} as const

function toU(paperX: number): number {
  return (paperX - MARKER.left) / (MARKER.right - MARKER.left)
}
function toV(paperY: number): number {
  return (paperY - MARKER.top) / (MARKER.bot - MARKER.top)
}

export const TEMPLATE_INNINGS = TMPL.templateInns

// ── セル分割定数 ─────────────────────────────────────────────────
// イニング幅: (248.25 - 87.225) / 7 ≈ 23mm
// 打点欄: 7mm → RBI_RATIO ≈ 0.304
const INN_W_MM  = ((TMPL.innEnd - TMPL.innStart) * PAPER_W_MM) / TMPL.templateInns
const RBI_RATIO = 7 / INN_W_MM  // ≈ 0.304

// サブ画像のピクセルサイズ（モバイル対応でペイロード削減のため縮小）
const CODE_IMG_W = 80   // コード欄 (左 ~70%) の横幅 (160→80に縮小)
const RBI_IMG_W  = 35   // 打点欄 (右 ~30%) の横幅 (70→35に縮小)
const AB_IMG_H   = 38   // 打席 1段分 (一巡目 or 二巡目) の高さ (75→38に縮小)

// ── サブ画像内のバブル位置定義 ────────────────────────────────────
// NOTE: page.tsx でバブル円を印刷する際はこの座標と合わせること。

/** コード欄サブ画像 (CODE_IMG_W × AB_IMG_H) 内のバブル座標 */
const CODE_AREA_BUBBLES = [
  // 行1: O / 1 / 2 / 3 / 4 / B
  { code: 'O', nx: 0.08, ny: 0.33 },
  { code: '1', nx: 0.22, ny: 0.33 },
  { code: '2', nx: 0.36, ny: 0.33 },
  { code: '3', nx: 0.50, ny: 0.33 },
  { code: '4', nx: 0.64, ny: 0.33 },
  { code: 'B', nx: 0.78, ny: 0.33 },
  // 行2: D / S / X
  { code: 'D', nx: 0.08, ny: 0.67 },
  { code: 'S', nx: 0.22, ny: 0.67 },
  { code: 'X', nx: 0.36, ny: 0.67 },
] as const

const CODE_AREA_STOLEN = { nx: 0.64, ny: 0.67 } as const  // 盗塁

/** 打点欄サブ画像 (RBI_IMG_W × AB_IMG_H) 内のバブル座標 */
const RBI_AREA_BUBBLES = [
  { value: '1', nx: 0.25, ny: 0.28 },
  { value: '2', nx: 0.50, ny: 0.28 },
  { value: '3', nx: 0.75, ny: 0.28 },
  { value: '4', nx: 0.50, ny: 0.67 },
] as const

// ── 向き補正 ─────────────────────────────────────────────────────
// iOS Safari など古いブラウザは canvas.drawImage 時に EXIF 回転を適用しない。
// その場合 W < H（縦長）になるので 90°CW 回転して横長に補正する。
// 90°CW: old(x,y) → new(H-1-y, x)、新寸法 W'=H, H'=W
function rotatePixels90CW(
  src: Uint8ClampedArray, W: number, H: number,
): { data: Uint8ClampedArray; W: number; H: number } {
  const newW = H, newH = W
  const out  = new Uint8ClampedArray(newW * newH * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const s = (y * W + x) * 4
      const d = (x * newW + (H - 1 - y)) * 4
      out[d] = src[s]; out[d+1] = src[s+1]; out[d+2] = src[s+2]; out[d+3] = src[s+3]
    }
  }
  return { data: out, W: newW, H: newH }
}

// ── コントラスト強調 ──────────────────────────────────────────────

function stretchContrastInPlace(data: Uint8ClampedArray): void {
  const n = data.length >>> 2
  const hist = new Uint32Array(256)
  for (let i = 0; i < data.length; i += 4) {
    hist[((data[i] + data[i+1] + data[i+2]) / 3 + 0.5) | 0]++
  }

  const lo_target = n * 0.02
  const hi_target = n * 0.98
  let lo = 0, hi = 255, cum = 0

  for (let v = 0; v < 256; v++) { cum += hist[v]; if (cum < lo_target) lo = v }
  cum = 0
  for (let v = 255; v >= 0; v--) { cum += hist[v]; if (cum < (n - hi_target)) hi = v }

  if (hi <= lo) return
  const scale = 255 / (hi - lo)
  for (let i = 0; i < data.length; i += 4) {
    data[i]   = Math.max(0, Math.min(255, ((data[i]   - lo) * scale + 0.5) | 0))
    data[i+1] = Math.max(0, Math.min(255, ((data[i+1] - lo) * scale + 0.5) | 0))
    data[i+2] = Math.max(0, Math.min(255, ((data[i+2] - lo) * scale + 0.5) | 0))
  }
}

function enhanceCellContrast(canvas: HTMLCanvasElement): void {
  const ctx  = canvas.getContext('2d')!
  const id   = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = id.data
  const n    = data.length >>> 2

  const hist = new Uint32Array(256)
  for (let i = 0; i < data.length; i += 4) {
    hist[((data[i] + data[i+1] + data[i+2]) / 3 + 0.5) | 0]++
  }

  const loCnt = n * 0.02
  let lo = 0, hi = 255, cum = 0
  for (let v = 0; v < 256; v++)   { cum += hist[v]; if (cum < loCnt) lo = v }
  cum = 0
  for (let v = 255; v >= 0; v--) { cum += hist[v]; if (cum < loCnt) hi = v }

  if (hi - lo < 20) return
  const scale = 255 / (hi - lo)
  for (let i = 0; i < data.length; i += 4) {
    data[i]   = Math.max(0, Math.min(255, ((data[i]   - lo) * scale + 0.5) | 0))
    data[i+1] = Math.max(0, Math.min(255, ((data[i+1] - lo) * scale + 0.5) | 0))
    data[i+2] = Math.max(0, Math.min(255, ((data[i+2] - lo) * scale + 0.5) | 0))
  }
  ctx.putImageData(id, 0, 0)
}

// ── バブル塗りつぶし検出 ──────────────────────────────────────────

function measureCircleFill(
  data: Uint8ClampedArray,
  W:    number,
  H:    number,
  cx:   number,
  cy:   number,
  r:    number,
): number {
  let dark = 0, total = 0
  const x0 = Math.max(0, (cx - r - 1) | 0)
  const x1 = Math.min(W - 1, (cx + r + 1) | 0)
  const y0 = Math.max(0, (cy - r - 1) | 0)
  const y1 = Math.min(H - 1, (cy + r + 1) | 0)
  const r2 = r * r

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) {
        total++
        const i = (y * W + x) * 4
        if ((data[i] + data[i + 1] + data[i + 2]) / 3 < 128) dark++
      }
    }
  }
  return total > 0 ? dark / total : 0
}

function detectMarkSheet(
  canvas: HTMLCanvasElement,
): { code: string | null; rbi: string | null; stolen: boolean } {
  const ctx = canvas.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const W = canvas.width
  const H = canvas.height
  const r = W * BUBBLE_R_RATIO

  let bestCode: string | null = null
  let bestFill = FILL_THRESHOLD
  for (const b of CODE_BUBBLES) {
    const fill = measureCircleFill(data, W, H, b.nx * W, b.ny * H, r)
    if (fill > bestFill) { bestFill = fill; bestCode = b.code }
  }

  let bestRbi: string | null = null
  let bestRbiFill = FILL_THRESHOLD
  for (const b of RBI_BUBBLES) {
    const fill = measureCircleFill(data, W, H, b.nx * W, b.ny * H, r)
    if (fill > bestRbiFill) { bestRbiFill = fill; bestRbi = b.value }
  }

  const stolenFill = measureCircleFill(
    data, W, H, STOLEN_BUBBLE.nx * W, STOLEN_BUBBLE.ny * H, r,
  )
  const stolen = stolenFill > FILL_THRESHOLD

  return { code: bestCode, rbi: bestRbi, stolen }
}

/** コード欄サブ画像でバブルを検出する */
function detectCodeArea(
  canvas: HTMLCanvasElement,
): { code: string | null; stolen: boolean } {
  const ctx = canvas.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const W = canvas.width, H = canvas.height
  const r = W * BUBBLE_R_RATIO

  let bestCode: string | null = null, bestFill = FILL_THRESHOLD
  for (const b of CODE_AREA_BUBBLES) {
    const fill = measureCircleFill(data, W, H, b.nx * W, b.ny * H, r)
    if (fill > bestFill) { bestFill = fill; bestCode = b.code }
  }
  const stolenFill = measureCircleFill(data, W, H, CODE_AREA_STOLEN.nx * W, CODE_AREA_STOLEN.ny * H, r)
  return { code: bestCode, stolen: stolenFill > FILL_THRESHOLD }
}

/** 打点欄サブ画像でバブルを検出する */
function detectRbiArea(
  canvas: HTMLCanvasElement,
): { rbi: string | null } {
  const ctx = canvas.getContext('2d')!
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const W = canvas.width, H = canvas.height
  const r = W * BUBBLE_R_RATIO

  let bestRbi: string | null = null, bestFill = FILL_THRESHOLD
  for (const b of RBI_AREA_BUBBLES) {
    const fill = measureCircleFill(data, W, H, b.nx * W, b.ny * H, r)
    if (fill > bestFill) { bestFill = fill; bestRbi = b.value }
  }
  return { rbi: bestRbi }
}

// ── 四隅マーカー検出 ─────────────────────────────────────────────

function findTargetMarker(
  data: Uint8ClampedArray, W: number,
  x0: number, y0: number, x1: number, y1: number,
  darkThresh   = 90,
  minScore     = 0.08,
  markerFrac   = 0.033,
  outerFrac    = 0.286,
  centerFrac   = 0.107,
  centerWeight = 1.0,
  stepFrac     = 0.20,
  outerMinR    = 0.25,
): Point | null {
  const expectedPx = Math.max(15, (W * markerFrac) | 0)
  const winMin = Math.max(10, (expectedPx * 0.55) | 0)
  const winMax = Math.max(22, (expectedPx * 1.55) | 0)
  const winMid = expectedPx

  let bestScore = -1, bestCx = -1, bestCy = -1

  for (const win of [winMin, winMid, winMax]) {
    const step     = Math.max(2, (win * stepFrac) | 0)
    const borderPx = Math.max(2, (win * outerFrac)  | 0)
    const centerPx = Math.max(1, (win * centerFrac) | 0)
    const halfWin  = win / 2

    for (let wy = y0; wy + win <= y1; wy += step) {
      for (let wx = x0; wx + win <= x1; wx += step) {
        let outerDark = 0, outerTotal = 0
        let midDark   = 0, midTotal   = 0
        let centDark  = 0, centTotal  = 0

        for (let py = 0; py < win; py++) {
          for (let px = 0; px < win; px++) {
            const ix = wx + px, iy = wy + py
            if (ix < 0 || ix >= W || iy < 0) continue
            const i = (iy * W + ix) * 4
            const bright = (data[i] + data[i+1] + data[i+2]) / 3
            const isDark = bright < darkThresh

            const inBorder = px < borderPx || px >= win - borderPx ||
                             py < borderPx || py >= win - borderPx
            const dx = px - halfWin, dy = py - halfWin
            const inCenter = Math.abs(dx) <= centerPx && Math.abs(dy) <= centerPx

            if (inBorder) {
              outerDark += isDark ? 1 : 0; outerTotal++
            } else if (inCenter) {
              centDark  += isDark ? 1 : 0; centTotal++
            } else {
              midDark   += isDark ? 1 : 0; midTotal++
            }
          }
        }

        if (outerTotal < 8 || midTotal < 4 || centTotal < 1) continue
        const outerR  = outerDark / outerTotal
        const middleR = midDark   / midTotal
        const centerR = centDark  / centTotal

        if (outerR < outerMinR || middleR > 0.70) continue

        const score = outerR * (1 - middleR) * (1 - centerWeight + centerWeight * centerR)
        if (score > bestScore) {
          bestScore = score; bestCx = wx + halfWin; bestCy = wy + halfWin
        }
      }
    }
  }

  console.log(`  [target] region(${x0},${y0})→(${x1},${y1}) bestScore=${bestScore.toFixed(3)} pos=(${bestCx.toFixed(0)},${bestCy.toFixed(0)})`)
  if (bestScore < minScore || bestCx < 0) return null
  return { x: bestCx, y: bestCy }
}

function findCornerMarkers(
  data: Uint8ClampedArray, W: number, H: number,
): Markers | null {
  const rx = Math.max(40, (W * 0.16) | 0)
  const ry = Math.max(40, (H * 0.16) | 0)

  const tl = findTargetMarker(data, W, 0,    0,    rx,   ry,   90, 0.06, 0.033, 0.286, 0.107, 1.0)
  const tr = findTargetMarker(data, W, W-rx, 0,    W,    ry,   90, 0.06, 0.033, 0.286, 0.107, 1.0)
  const bl = findTargetMarker(data, W, 0,    H-ry, rx,   H,    90, 0.06, 0.033, 0.286, 0.107, 1.0)
  const br = findTargetMarker(data, W, W-rx, H-ry, W,    H,    90, 0.06, 0.033, 0.286, 0.107, 1.0)

  console.log('[findCornerMarkers]',
    'TL:', tl ? `(${tl.x.toFixed(0)},${tl.y.toFixed(0)})` : 'null',
    'TR:', tr ? `(${tr.x.toFixed(0)},${tr.y.toFixed(0)})` : 'null',
    'BL:', bl ? `(${bl.x.toFixed(0)},${bl.y.toFixed(0)})` : 'null',
    'BR:', br ? `(${br.x.toFixed(0)},${br.y.toFixed(0)})` : 'null',
  )

  if (!tl || !tr || !bl || !br) return null

  const detectedW = ((tr.x - tl.x) + (br.x - bl.x)) / 2
  const detectedH = ((bl.y - tl.y) + (br.y - tr.y)) / 2
  if (detectedW < W * 0.30 || detectedH < H * 0.30) {
    console.warn('[findCornerMarkers] サニティチェック失敗', detectedW.toFixed(0), detectedH.toFixed(0))
    return null
  }

  return { tl, tr, bl, br }
}

// ── イニンググリッド外枠（太線）スキャン ──────────────────────────

/**
 * 指定領域で暗画素密度が最大の行または列の座標を返す。
 * 太線（3.5pt ≈ 1.2mm）は細線（1.2pt ≈ 0.4mm）より密度が高くなる。
 */
function scanMaxDarkLine(
  data:       Uint8ClampedArray,
  W:          number,
  x0:         number,
  y0:         number,
  x1:         number,
  y1:         number,
  dir:        'vert' | 'horiz',
  darkThresh  = 80,
  minDensity  = 0.25,
): number | null {
  let bestPos = -1, bestDensity = 0

  if (dir === 'vert') {
    const span = y1 - y0
    if (span <= 0) return null
    for (let x = x0; x <= x1; x++) {
      let dark = 0
      for (let y = y0; y < y1; y++) {
        const i = (y * W + x) * 4
        if ((data[i] + data[i+1] + data[i+2]) / 3 < darkThresh) dark++
      }
      const d = dark / span
      if (d > bestDensity) { bestDensity = d; bestPos = x }
    }
  } else {
    const span = x1 - x0
    if (span <= 0) return null
    for (let y = y0; y <= y1; y++) {
      let dark = 0
      for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4
        if ((data[i] + data[i+1] + data[i+2]) / 3 < darkThresh) dark++
      }
      const d = dark / span
      if (d > bestDensity) { bestDensity = d; bestPos = y }
    }
  }

  return bestDensity >= minDensity ? bestPos : null
}

/**
 * イニンググリッド外枠（太線 3.5pt）の4辺を走査して
 * 打者グリッド（バッター1〜9 × イニング1〜7）の4隅座標を返す。
 *
 * フレーム構造:
 *   ┌─ 上端太線 (= イニングヘッダー行上端, ~24mm from top)
 *   │  イニングヘッダー行 (~4mm, "1 2 3...") ← ここはグリッドに含めない
 *   ├─ データ上端 (= バッター行1の上端, ~28mm) ← gridRef.tl.y
 *   │  バッター行 1〜9 (各 15mm × 9 = 135mm)
 *   └─ 下端太線 (= バッター行9の下端, ~163mm) ← gridRef.bl.y
 *
 * 上端・下端の両方を検出できた場合、フレーム高に対する
 * ヘッダー比率 (4/139 ≈ 2.9%) でデータ上端を精密計算する。
 * 片方のみ検出の場合は pxPerMmY ベースのフォールバック。
 */
function refineGridByThickBorder(
  data:    Uint8ClampedArray,
  W:       number,
  H:       number,
  markers: Markers,
): { gridRef: Markers; topBorderY: number | null; bottomY: number | null } {
  const predTL = uvToPhoto(markers, toU(TMPL.innStart), toV(TMPL.tableTop))
  const predBR = uvToPhoto(markers, toU(TMPL.innEnd),   toV(TMPL.tableTop + TMPL.batters * TMPL.rowHeight))
  const predW  = predBR.x - predTL.x
  const predH  = predBR.y - predTL.y
  const slopX  = Math.max(15, (predW * 0.04) | 0)
  const slopY  = Math.max(12, (predH * 0.07) | 0)

  // 外角マーカーから px/mm 推定
  const outerH_mm = (MARKER.bot - MARKER.top) * PAPER_H_MM
  const pxPerMmY  = (
    (markers.bl.y - markers.tl.y) + (markers.br.y - markers.tr.y)
  ) / 2 / outerH_mm

  // ── 左端縦線 ──
  const leftX = scanMaxDarkLine(data, W,
    Math.max(0, (predTL.x - slopX) | 0),
    (predTL.y + predH * 0.2) | 0,
    Math.min(W, (predTL.x + slopX) | 0),
    (predBR.y - predH * 0.2) | 0,
    'vert')

  // ── 右端縦線 ──
  const rightX = scanMaxDarkLine(data, W,
    Math.max(0, (predBR.x - slopX) | 0),
    (predTL.y + predH * 0.2) | 0,
    Math.min(W, (predBR.x + slopX) | 0),
    (predBR.y - predH * 0.2) | 0,
    'vert')

  // ── 上端横線 (イニングヘッダー行上端 = フレーム上端)
  // tableTop(28mm) の ~4mm 上 = 24mm 付近
  const HEADER_H_MM = 4
  const predFrameTopY = predTL.y - HEADER_H_MM * pxPerMmY
  const topBorderY = scanMaxDarkLine(data, W,
    (predTL.x + predW * 0.1) | 0,
    Math.max(0, (predFrameTopY - slopY) | 0),
    (predBR.x - predW * 0.1) | 0,
    Math.min(H, (predFrameTopY + slopY) | 0),
    'horiz')

  // ── 下端横線 (バッター9行目下端) ──
  // topBorderY が取れていれば、そこから 139mm 下を予測中心にする（より精確）
  // フレーム高 = ヘッダー(4mm) + バッター行×9(135mm) = 139mm
  const FRAME_H_MM = 4 + TMPL.batters * 11  // 136mm
  const predBottomYFromTop = topBorderY !== null
    ? topBorderY + FRAME_H_MM * pxPerMmY
    : predBR.y
  const slopYBottom = Math.max(20, (predH * 0.15) | 0)  // ±15% = 約1行分強
  const bottomY = scanMaxDarkLine(data, W,
    (predTL.x + predW * 0.1) | 0,
    Math.max(0, (predBottomYFromTop - slopYBottom) | 0),
    (predBR.x - predW * 0.1) | 0,
    Math.min(H, (predBottomYFromTop + slopYBottom) | 0),
    'horiz')

  // ── 太線半径補正: スキャンは太線中心を検出するが、セル内容は内側エッジから始まる ──
  // frameB = 3.5pt = 3.5/72*25.4 ≈ 1.235mm → 半分 ≈ 0.618mm
  const FRAME_BORDER_MM = 3.5 / 72 * 25.4
  const halfBorderPx    = (FRAME_BORDER_MM / 2) * pxPerMmY

  // 内側エッジへ補正 (セル内容の正確な範囲)
  const fl = (leftX  !== null ? leftX  + halfBorderPx : predTL.x)
  const fr = (rightX !== null ? rightX - halfBorderPx : predBR.x)
  const fb = (bottomY !== null ? bottomY - halfBorderPx : predBR.y)

  // ── データ上端 (バッター行1の上端) を計算 ──
  // フレーム内部 = ヘッダー行(~4mm) + バッター行×9(135mm) ≈ 139mm
  let ft: number
  if (topBorderY !== null && bottomY !== null) {
    // 上下両方検出: 内側エッジ間のフレーム高から比率で計算
    const topInsideY  = topBorderY + halfBorderPx
    const insideH     = fb - topInsideY  // 実測内部高さ (px)
    const insideTotalMM = FRAME_H_MM - FRAME_BORDER_MM  // ≈ 137.77mm
    const headerFrac  = HEADER_H_MM / insideTotalMM
    ft = topInsideY + insideH * headerFrac
    console.log('[refineGridByThickBorder] 上下両端検出 topInside=', topInsideY.toFixed(0),
      'insideH=', insideH.toFixed(0), 'headerFrac=', headerFrac.toFixed(4))
  } else if (topBorderY !== null) {
    // 下端未検出: 上端内側 + ヘッダー行高
    const topInsideY = topBorderY + halfBorderPx
    ft = topInsideY + HEADER_H_MM * pxPerMmY
  } else {
    // 上端未検出: 下端内側から 9行分遡る (フォールバック)
    ft = fb - TMPL.batters * (15 * pxPerMmY)
  }

  console.log('[refineGridByThickBorder]',
    `left=${leftX !== null ? leftX.toFixed(0) : `fb(${predTL.x.toFixed(0)})`}`,
    `right=${rightX !== null ? rightX.toFixed(0) : `fb(${predBR.x.toFixed(0)})`}`,
    `topBorder=${topBorderY !== null ? topBorderY.toFixed(0) : `fb(${predFrameTopY.toFixed(0)})`}`,
    `bottom=${bottomY !== null ? bottomY.toFixed(0) : `fb(${predBR.y.toFixed(0)})`}`,
    `→ dataTop=${ft.toFixed(0)}`,
  )

  return {
    gridRef: { tl: { x: fl, y: ft }, tr: { x: fr, y: ft }, bl: { x: fl, y: fb }, br: { x: fr, y: fb } },
    topBorderY,
    bottomY,
  }
}

// ── バイリニアマッピング ───────────────────────────────────────────

function uvToPhoto(m: Markers, u: number, v: number): Point {
  return {
    x: m.tl.x*(1-u)*(1-v) + m.tr.x*u*(1-v) + m.bl.x*(1-u)*v + m.br.x*u*v,
    y: m.tl.y*(1-u)*(1-v) + m.tr.y*u*(1-v) + m.bl.y*(1-u)*v + m.br.y*u*v,
  }
}

function sampleBilinear(
  data: Uint8ClampedArray, W: number, H: number,
  x: number, y: number,
): [number, number, number] {
  const x0 = Math.max(0, Math.min(W - 2, x | 0))
  const y0 = Math.max(0, Math.min(H - 2, y | 0))
  const fx = x - x0, fy = y - y0
  const i00 = (y0 * W + x0) * 4
  const i10 = i00 + 4
  const i01 = ((y0 + 1) * W + x0) * 4
  const i11 = i01 + 4
  const lerp = (a: number, b: number, c: number, d: number) =>
    a*(1-fx)*(1-fy) + b*fx*(1-fy) + c*(1-fx)*fy + d*fx*fy
  return [
    lerp(data[i00],   data[i10],   data[i01],   data[i11])   + 0.5 | 0,
    lerp(data[i00+1], data[i10+1], data[i01+1], data[i11+1]) + 0.5 | 0,
    lerp(data[i00+2], data[i10+2], data[i01+2], data[i11+2]) + 0.5 | 0,
  ]
}

/**
 * extractQuad — バイリニア補間でサブ領域を抽出。
 * cv を渡すと canvas を使い回す（モバイルメモリ節約）。
 * cv がない場合のみ新しい canvas を生成する。
 */
function extractQuad(
  data: Uint8ClampedArray, W: number, H: number,
  ptl: Point, ptr: Point, pbl: Point, pbr: Point,
  outW: number, outH: number,
  cv?: HTMLCanvasElement,
): HTMLCanvasElement {
  const canvas = cv ?? document.createElement('canvas')
  canvas.width = outW; canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const imgData = ctx.createImageData(outW, outH)
  const d = imgData.data

  for (let py = 0; py < outH; py++) {
    const t = outH > 1 ? py / (outH - 1) : 0
    for (let px = 0; px < outW; px++) {
      const s = outW > 1 ? px / (outW - 1) : 0
      const sx = ptl.x*(1-s)*(1-t) + ptr.x*s*(1-t) + pbl.x*(1-s)*t + pbr.x*s*t
      const sy = ptl.y*(1-s)*(1-t) + ptr.y*s*(1-t) + pbl.y*(1-s)*t + pbr.y*s*t
      const [r, g, b] = sampleBilinear(data, W, H, sx, sy)
      const i = (py * outW + px) * 4
      d[i] = r; d[i+1] = g; d[i+2] = b; d[i+3] = 255
    }
  }
  ctx.putImageData(imgData, 0, 0)
  return canvas
}

// ── メイン関数 ────────────────────────────────────────────────────

export async function extractCellsFromImage(
  file:    File,
  innings: number,
): Promise<ExtractionResult> {
  console.log('[cellExtractor] ⓪ 関数呼び出し:', file.name, (file.size/1024/1024).toFixed(2)+'MB')
  return new Promise((resolve, reject) => {
    const img = new Image()
    console.log('[cellExtractor] ⓪-1 Image()生成完了')
    const url = URL.createObjectURL(file)
    console.log('[cellExtractor] ⓪-2 createObjectURL完了:', url.substring(0, 50))

    img.onload = () => {
      console.log('[cellExtractor] ⓪-3 img.onload 発火')
      URL.revokeObjectURL(url)

      // ── try-catch: img.onload 内の例外を reject に変換 ──────────────
      try {
      console.log('[cellExtractor] ① 画像ロード完了')

      let W = img.naturalWidth, H = img.naturalHeight
      console.log('[cellExtractor] ② 元サイズ:', W, 'x', H)

      // ① ダウンスケール（最長辺 1500px 以内）
      // iOS Safari は canvas メモリ上限が厳しいため、大きな写真を縮小してから処理する
      // 1500px = A4 横で約 128dpi — OCR に十分な解像度
      const MAX_DIM = 1500
      const scaleF  = Math.min(1, MAX_DIM / Math.max(W, H))
      const scaledW = Math.round(W * scaleF)
      const scaledH = Math.round(H * scaleF)
      console.log('[cellExtractor] ③ スケール後:', scaledW, 'x', scaledH, 'scale=', scaleF.toFixed(3))
      const srcCanvas = document.createElement('canvas')
      srcCanvas.width  = scaledW
      srcCanvas.height = scaledH
      console.log('[cellExtractor] ④ canvas作成完了', scaledW, 'x', scaledH)
      const srcCtx = srcCanvas.getContext('2d')
      if (!srcCtx) throw new Error('canvas 2D context の取得に失敗しました（端末のメモリが不足している可能性があります）')
      console.log('[cellExtractor] ⑤ context取得完了')
      srcCtx.drawImage(img, 0, 0, scaledW, scaledH)
      console.log('[cellExtractor] ⑥ drawImage完了')
      let data: Uint8ClampedArray = srcCtx.getImageData(0, 0, scaledW, scaledH).data
      console.log('[cellExtractor] ⑦ getImageData完了', data.length, 'bytes')
      W = scaledW; H = scaledH

      // ② 縦長画像（スマホ縦撮り・EXIF 未適用）を横長に補正
      if (W < H) {
        console.log('[cellExtractor] ⑧ 縦長検出 → 90度回転開始')
        const r = rotatePixels90CW(data, W, H)
        data = r.data; W = r.W; H = r.H
        console.log('[cellExtractor] ⑨ 回転完了', W, 'x', H)
      }

      // ③ コントラスト強調
      console.log('[cellExtractor] ⑩ コントラスト強調開始')
      stretchContrastInPlace(data)
      console.log('[cellExtractor] ⑪ コントラスト強調完了')

      // デバッグcanvas（1枚に集約してメモリ節約）
      console.log('[cellExtractor] ⑫ デバッグcanvas作成開始', W, 'x', H)
      const dbgCanvas = document.createElement('canvas')
      dbgCanvas.width = W; dbgCanvas.height = H
      console.log('[cellExtractor] ⑬ デバッグcanvas作成完了')
      const dCtx = dbgCanvas.getContext('2d')
      if (!dCtx) throw new Error('デバッグ canvas の取得に失敗しました')
      console.log('[cellExtractor] ⑭ デバッグcontext取得完了')
      dCtx.putImageData(new ImageData(new Uint8ClampedArray(data), W, H), 0, 0)
      console.log('[cellExtractor] ⑮ デバッグputImageData完了')

      const rx0 = Math.max(40, (W * 0.16) | 0)
      const ry0 = Math.max(40, (H * 0.16) | 0)
      dCtx.strokeStyle = 'rgba(255,60,60,0.75)'
      dCtx.lineWidth   = Math.max(2, W / 500)
      dCtx.setLineDash([10, 5])
      dCtx.strokeRect(0,      0,      rx0,  ry0)
      dCtx.strokeRect(W-rx0,  0,      rx0,  ry0)
      dCtx.strokeRect(0,      H-ry0,  rx0,  ry0)
      dCtx.strokeRect(W-rx0,  H-ry0,  rx0,  ry0)
      dCtx.setLineDash([])

      // ④ 外角マーカー検出
      const markers = findCornerMarkers(data, W, H)
      if (!markers) {
        console.warn('[cellExtractor] マーカー検出失敗 — imageSize:', W, '×', H)
        dCtx.font = `bold ${Math.max(20, W/60)}px Arial`
        dCtx.fillStyle = 'rgba(255,60,60,0.9)'
        dCtx.fillText('❌ マーカー未検出', W * 0.3, H * 0.5)
        resolve({ cells: [], cornersFound: false, markers: null, debugImageUrl: dbgCanvas.toDataURL('image/jpeg', 0.65) })
        return
      }

      console.log('[cellExtractor] マーカー検出OK', {
        TL: `(${markers.tl.x.toFixed(0)}, ${markers.tl.y.toFixed(0)})`,
        TR: `(${markers.tr.x.toFixed(0)}, ${markers.tr.y.toFixed(0)})`,
        BL: `(${markers.bl.x.toFixed(0)}, ${markers.bl.y.toFixed(0)})`,
        BR: `(${markers.br.x.toFixed(0)}, ${markers.br.y.toFixed(0)})`,
        imageSize: `${W}×${H}`,
      })

      // ③ 外枠太線スキャン → グリッド精密化
      console.log('[cellExtractor] ⑯ グリッド精密化開始')
      const { gridRef, topBorderY, bottomY: detectedBottomY } = refineGridByThickBorder(data, W, H, markers)
      console.log('[cellExtractor] ⑰ グリッド精密化完了')

      // ④ 各セルを4分割して検出 (一巡目/二巡目 × コード欄/打点欄)
      // Canvas を1枚使い回してメモリを最小化（モバイル対応）
      console.log('[cellExtractor] ⑱ セル抽出ループ開始')
      const cells: CellSubImages[] = []
      const pp  = (u: number, v: number) => uvToPhoto(gridRef, u, v)
      const sharedCv = document.createElement('canvas')  // 全サブ画像でこの1枚を使い回す
      console.log('[cellExtractor] ⑲ 共有canvas作成完了')

      for (let order = 1; order <= TMPL.batters; order++) {
        const v_top = (order - 1) / TMPL.batters
        const v_bot = order / TMPL.batters
        const v_mid = (v_top + v_bot) / 2

        for (let inn = 1; inn <= innings; inn++) {
          const u_left  = (inn - 1) / TMPL.templateInns
          const u_right = inn / TMPL.templateInns
          const u_split = u_left + (u_right - u_left) * (1 - RBI_RATIO)

          // ─ 一巡目 コード欄
          extractQuad(data, W, H, pp(u_left,v_top), pp(u_split,v_top), pp(u_left,v_mid), pp(u_split,v_mid), CODE_IMG_W, AB_IMG_H, sharedCv)
          enhanceCellContrast(sharedCv)
          const ab1codeRes = detectCodeArea(sharedCv)
          const ab1img     = sharedCv.toDataURL('image/jpeg', 0.35)

          // ─ 一巡目 打点欄
          extractQuad(data, W, H, pp(u_split,v_top), pp(u_right,v_top), pp(u_split,v_mid), pp(u_right,v_mid), RBI_IMG_W, AB_IMG_H, sharedCv)
          enhanceCellContrast(sharedCv)
          const ab1rbiRes = detectRbiArea(sharedCv)
          const ab1rbiImg = sharedCv.toDataURL('image/jpeg', 0.35)

          // ─ 二巡目 コード欄
          extractQuad(data, W, H, pp(u_left,v_mid), pp(u_split,v_mid), pp(u_left,v_bot), pp(u_split,v_bot), CODE_IMG_W, AB_IMG_H, sharedCv)
          enhanceCellContrast(sharedCv)
          const ab2codeRes = detectCodeArea(sharedCv)
          const ab2img     = sharedCv.toDataURL('image/jpeg', 0.35)

          // ─ 二巡目 打点欄
          extractQuad(data, W, H, pp(u_split,v_mid), pp(u_right,v_mid), pp(u_split,v_bot), pp(u_right,v_bot), RBI_IMG_W, AB_IMG_H, sharedCv)
          enhanceCellContrast(sharedCv)
          const ab2rbiRes = detectRbiArea(sharedCv)
          const ab2rbiImg = sharedCv.toDataURL('image/jpeg', 0.35)

          const ab1code   = ab1codeRes.code
          const ab1rbi    = ab1rbiRes.rbi
          const ab1stolen = ab1codeRes.stolen
          const ab2code   = ab2codeRes.code
          const ab2rbi    = ab2rbiRes.rbi
          const ab2stolen = ab2codeRes.stolen

          cells.push({
            order, inning: inn,
            image:     '',  // フルセル画像を削除してペイロード削減（デバッグ用のみ）
            ab1img,    ab1rbiImg,
            ab2img,    ab2rbiImg,
            ab1code, ab1rbi, ab1stolen,
            ab2code, ab2rbi, ab2stolen,
            code:   ab1code,
            rbi:    ab1rbi,
            stolen: ab1stolen,
          })
        }
      }
      console.log('[cellExtractor] ⑳ セル抽出ループ完了')

      console.log('[cellExtractor] ㉑ 検出セル数:', cells.length,
        '/ 内訳:', cells.map(c => {
          const a1 = (c.ab1code ?? '') + (c.ab1rbi ?? '') + (c.ab1stolen ? 's' : '')
          const a2 = (c.ab2code ?? '') + (c.ab2rbi ?? '') + (c.ab2stolen ? 's' : '')
          return `${c.order}-${c.inning}:${a1}/${a2}`
        }).join(' '))

      // ── デバッグ画像（先頭で作成済みの dbgCanvas / dCtx を再利用）──
      console.log('[cellExtractor] ㉒ デバッグ描画開始')
      const r  = Math.max(18, (Math.min(W, H) * 0.018) | 0)
      const lw = Math.max(2,  (Math.min(W, H) * 0.002) | 0)
      const fs = Math.max(14, (Math.min(W, H) * 0.022) | 0)
      dCtx.font = `bold ${fs}px Arial`

      // 外角マーカー
      for (const [pt, color, label] of [
        [markers.tl, '#FF3333', 'TL'],
        [markers.tr, '#3366FF', 'TR'],
        [markers.bl, '#33CC33', 'BL'],
        [markers.br, '#FFCC00', 'BR'],
      ] as [Point, string, string][]) {
        dCtx.strokeStyle = color; dCtx.lineWidth = lw * 2
        dCtx.beginPath(); dCtx.arc(pt.x, pt.y, r, 0, Math.PI * 2); dCtx.stroke()
        dCtx.fillStyle = color
        dCtx.fillText(label, pt.x + r + 4, pt.y + fs * 0.4)
      }

      // 検出した上端太線（オレンジ破線）
      if (topBorderY !== null) {
        dCtx.strokeStyle = 'rgba(255,160,0,0.9)'
        dCtx.lineWidth   = lw * 2
        dCtx.setLineDash([lw * 5, lw * 3])
        dCtx.beginPath()
        dCtx.moveTo(gridRef.tl.x, topBorderY)
        dCtx.lineTo(gridRef.tr.x, topBorderY)
        dCtx.stroke()
        dCtx.setLineDash([])
        dCtx.fillStyle = 'rgba(255,160,0,0.9)'
        dCtx.font = `${Math.max(8, fs * 0.5) | 0}px Arial`
        dCtx.fillText('frameTop', gridRef.tl.x + 4, topBorderY - 3)
      }
      // 検出した下端太線（オレンジ破線）
      if (detectedBottomY !== null) {
        dCtx.strokeStyle = 'rgba(255,160,0,0.9)'
        dCtx.lineWidth   = lw * 2
        dCtx.setLineDash([lw * 5, lw * 3])
        dCtx.beginPath()
        dCtx.moveTo(gridRef.tl.x, detectedBottomY)
        dCtx.lineTo(gridRef.tr.x, detectedBottomY)
        dCtx.stroke()
        dCtx.setLineDash([])
        dCtx.fillStyle = 'rgba(255,160,0,0.9)'
        dCtx.font = `${Math.max(8, fs * 0.5) | 0}px Arial`
        dCtx.fillText('frameBot', gridRef.tl.x + 4, detectedBottomY + fs * 0.6)
      }
      dCtx.font = `bold ${fs}px Arial`

      // グリッド外枠（太線検出結果）をシアンで表示
      dCtx.strokeStyle = 'rgba(0,220,255,0.9)'
      dCtx.lineWidth   = lw * 3
      dCtx.beginPath()
      dCtx.moveTo(gridRef.tl.x, gridRef.tl.y)
      dCtx.lineTo(gridRef.tr.x, gridRef.tr.y)
      dCtx.lineTo(gridRef.br.x, gridRef.br.y)
      dCtx.lineTo(gridRef.bl.x, gridRef.bl.y)
      dCtx.closePath()
      dCtx.stroke()

      // グリッド4隅マーク
      const cornerColor = 'rgba(0,220,255,0.9)'
      dCtx.lineWidth = lw * 2
      for (const [pt, label] of [
        [gridRef.tl, 'GTL'], [gridRef.tr, 'GTR'],
        [gridRef.bl, 'GBL'], [gridRef.br, 'GBR'],
      ] as [Point, string][]) {
        const cr = Math.max(8, r * 0.5)
        dCtx.strokeStyle = cornerColor
        dCtx.strokeRect(pt.x - cr, pt.y - cr, cr * 2, cr * 2)
        dCtx.fillStyle  = cornerColor
        dCtx.font = `${Math.max(8, fs * 0.5) | 0}px Arial`
        dCtx.fillText(label, pt.x + cr + 2, pt.y + cr * 0.5)
        dCtx.font = `bold ${fs}px Arial`
      }

      // セルグリッド（緑枠）+ 内部分割線 + 検出結果
      const dbp = (u: number, v: number) => uvToPhoto(gridRef, u, v)
      const lfs = Math.max(8, (fs * 0.60) | 0)
      for (let order = 1; order <= TMPL.batters; order++) {
        const v_t = (order - 1) / TMPL.batters
        const v_b = order / TMPL.batters
        const v_m = (v_t + v_b) / 2
        for (let inn = 1; inn <= TMPL.templateInns; inn++) {
          const u_l = (inn - 1) / TMPL.templateInns
          const u_r = inn / TMPL.templateInns
          const u_s = u_l + (u_r - u_l) * (1 - RBI_RATIO)  // コード/打点 境界

          const TL = dbp(u_l, v_t), TR = dbp(u_r, v_t)
          const BL = dbp(u_l, v_b), BR = dbp(u_r, v_b)

          // セル外枠 (緑)
          dCtx.strokeStyle = 'rgba(0,255,128,0.7)'
          dCtx.lineWidth   = lw
          dCtx.beginPath()
          dCtx.moveTo(TL.x, TL.y); dCtx.lineTo(TR.x, TR.y)
          dCtx.lineTo(BR.x, BR.y); dCtx.lineTo(BL.x, BL.y)
          dCtx.closePath(); dCtx.stroke()

          // 内部分割線 (シアン破線)
          dCtx.strokeStyle = 'rgba(0,220,220,0.6)'
          dCtx.lineWidth   = Math.max(1, lw * 0.6)
          dCtx.setLineDash([lw * 2, lw * 2])
          // 横分割 (一巡目/二巡目)
          const ML = dbp(u_l, v_m), MR = dbp(u_r, v_m)
          dCtx.beginPath(); dCtx.moveTo(ML.x, ML.y); dCtx.lineTo(MR.x, MR.y); dCtx.stroke()
          // 縦分割 (コード/打点)
          const ST = dbp(u_s, v_t), SB = dbp(u_s, v_b)
          dCtx.beginPath(); dCtx.moveTo(ST.x, ST.y); dCtx.lineTo(SB.x, SB.y); dCtx.stroke()
          dCtx.setLineDash([])

          // 検出結果ラベル
          const detected = cells.find(c => c.order === order && c.inning === inn)
          if (detected) {
            const a1 = (detected.ab1code ?? '') + (detected.ab1rbi ?? '') + (detected.ab1stolen ? 's' : '')
            const a2 = (detected.ab2code ?? '') + (detected.ab2rbi ?? '') + (detected.ab2stolen ? 's' : '')
            dCtx.font = `bold ${lfs}px Arial`
            // 一巡目ラベル (上段中央)
            if (a1) {
              const c1 = dbp((u_l + u_s) / 2, (v_t + v_m) / 2)
              dCtx.fillStyle = 'rgba(255,220,0,0.95)'
              dCtx.fillText(a1, c1.x - lfs * 0.5 * a1.length * 0.55, c1.y + lfs * 0.4)
            }
            // 二巡目ラベル (下段中央)
            if (a2) {
              const c2 = dbp((u_l + u_s) / 2, (v_m + v_b) / 2)
              dCtx.fillStyle = 'rgba(100,220,255,0.95)'
              dCtx.fillText(a2, c2.x - lfs * 0.5 * a2.length * 0.55, c2.y + lfs * 0.4)
            }
          }
        }
      }
      console.log('[cellExtractor] ㉓ デバッグ描画完了')

      console.log('[cellExtractor] ㉔ toDataURL開始（デバッグ画像）')
      const debugUrl = dbgCanvas.toDataURL('image/jpeg', 0.65)
      console.log('[cellExtractor] ㉕ toDataURL完了、処理成功 ✓')
      resolve({
        cells,
        cornersFound: true,
        markers,
        debugImageUrl: debugUrl,
      })

      } catch (err) {
        // img.onload 内の例外を Promise rejection に変換
        console.error('[cellExtractor] ❌ 例外キャッチ:', err)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('画像ファイルの読み込みに失敗しました'))
    }

    img.src = url
  })
}
