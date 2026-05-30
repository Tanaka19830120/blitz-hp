/**
 * cellExtractor.ts — ブラウザ専用（格子線スナップ方式）
 *
 * マーカー検出・ホモグラフィーを廃止し、
 * 印刷された罫線の投影プロファイルからセル座標を直接決定する。
 *
 * 処理フロー:
 * 1. 紙の境界を検出（白紙 vs 背景）
 * 2. 水平・垂直の「暗ピクセル密度プロファイル」を計算
 * 3. TMPL定数の推定位置から最近傍の罫線ピークにスナップ
 * 4. スナップ済み座標でバイリニア補間クロップ
 *
 * テンプレート (scorebook-sheet/page.tsx) 定義値:
 *   固定列: 打順4.5% + 番4% + 名前15% + 守5% = 28.5%
 *   stats列: 打3%+安3%+点3%+盗3%+四3% = 15%
 *   イニング列合計: 100% - 28.5% - 15% = 56.5%
 *   打者行高: 14mm / コンテンツ高≒285mm ≈ 4.91%
 */

export interface CellImage {
  order:   number  // 打順 1-9
  inning:  number  // イニング 1-N
  dataUrl: string  // JPEG base64 data URL
}

export interface ExtractionResult {
  cells:        CellImage[]
  cornersFound: boolean  // true = 格子線スナップ + セル抽出成功
  paperBounds:  { left: number; right: number; top: number; bottom: number } | null
  debug?: {
    rowBounds: Array<{ top: number; bottom: number }>
    colBounds: Array<{ left: number; right: number }>
    // 後方互換（旧マーカー方式のフィールド）
    tl?: null; tr?: null; bl?: null; br?: null
  }
}

// テンプレート座標定数（紙外縁からの比率 = 紙全体 210×297mm に対する比率）
//
// 変換式: paper_x = (6 + content_x * 198) / 210
//         paper_y = (6 + content_y * 285) / 297
//
// content座標（scorebook-sheet/page.tsx より）:
//   固定列  : 打順4.5% + 番4% + 名前15% + 守5%  = 28.5%  → innStart
//   スタット: 打3%+安3%+点3%+盗3%+四3%          = 15%
//   イニング: 100% - 28.5% - 15%               = 56.5%  → innStart〜innEnd
//
//   innStart_content = 0.285 → paper: (6 + 0.285*198)/210 = 0.297
//   innEnd_content   = 0.850 → paper: (6 + 0.850*198)/210 = 0.830
//   tableTop_content = 0.128 → paper: (6 + 0.128*285)/297 = 0.143
//   rowHeight = 14mm / 297mm = 0.0472
//
// ★重要: templateInns は印刷テンプレートの固定列数（7）。
//         ゲームのイニング数ではない。列幅計算は常にこの値で割る。
//         5回戦でも7列が印刷され、先頭5列にデータが入る。
const TMPL = {
  innStart:     0.297,
  innEnd:       0.830,
  tableTop:     0.143,
  rowHeight:    0.0472,
  templateInns: 7,   // 印刷シートの固定イニング列数（page.tsx: const innings = 7）
  batters:      9,
} as const

// ── 紙の境界を検出 ────────────────────────────────────────────
function findPaperBounds(
  data: Uint8ClampedArray,
  W: number, H: number,
  whiteThreshold = 210,
  minWhiteRatio  = 0.55,
): { left: number; right: number; top: number; bottom: number } {
  const hSamples = (x: number) => {
    const r: number[] = []
    for (let y = Math.floor(H * 0.2); y < Math.floor(H * 0.8); y += Math.max(1, Math.floor(H / 60))) {
      const i = (y * W + Math.round(x)) * 4
      r.push((data[i] + data[i+1] + data[i+2]) / 3)
    }
    return r
  }
  const vSamples = (y: number) => {
    const r: number[] = []
    for (let x = Math.floor(W * 0.2); x < Math.floor(W * 0.8); x += Math.max(1, Math.floor(W / 60))) {
      const i = (Math.round(y) * W + x) * 4
      r.push((data[i] + data[i+1] + data[i+2]) / 3)
    }
    return r
  }
  const isWhite = (s: number[]) =>
    s.filter(b => b > whiteThreshold).length / s.length > minWhiteRatio

  let left = Math.floor(W * 0.02)
  for (let x = 0; x < W * 0.3; x++) if (isWhite(hSamples(x))) { left = x; break }
  let right = Math.floor(W * 0.98)
  for (let x = W - 1; x > W * 0.7; x--) if (isWhite(hSamples(x))) { right = x; break }
  let top = Math.floor(H * 0.02)
  for (let y = 0; y < H * 0.3; y++) if (isWhite(vSamples(y))) { top = y; break }
  let bottom = Math.floor(H * 0.98)
  for (let y = H - 1; y > H * 0.7; y--) if (isWhite(vSamples(y))) { bottom = y; break }

  return { left, right, top, bottom }
}

// ── 投影プロファイル ──────────────────────────────────────────

/** 各行 y の「暗ピクセル比率」プロファイル（水平罫線検出用） */
function buildHProfile(
  data: Uint8ClampedArray, W: number,
  x0: number, x1: number,
  y0: number, y1: number,
  darkThresh = 120,
): Float32Array {
  const scanW = x1 - x0
  const out   = new Float32Array(y1 - y0)
  for (let y = y0; y < y1; y++) {
    let n = 0
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4
      if ((data[i] + data[i+1] + data[i+2]) / 3 < darkThresh) n++
    }
    out[y - y0] = n / scanW
  }
  return out
}

/** 各列 x の「暗ピクセル比率」プロファイル（垂直罫線検出用） */
function buildVProfile(
  data: Uint8ClampedArray, W: number,
  x0: number, x1: number,
  y0: number, y1: number,
  darkThresh = 120,
): Float32Array {
  const scanH = y1 - y0
  const out   = new Float32Array(x1 - x0)
  for (let x = x0; x < x1; x++) {
    let n = 0
    for (let y = y0; y < y1; y++) {
      const i = (y * W + x) * 4
      if ((data[i] + data[i+1] + data[i+2]) / 3 < darkThresh) n++
    }
    out[x - x0] = n / scanH
  }
  return out
}

/**
 * プロファイル内で target に最も近い強いピーク位置を返す。
 * radius 内に閾値以上のピークがなければ target をそのまま返す。
 */
function snapToLine(
  profile: Float32Array,
  target:  number,
  offset:  number,
  radius:  number,
  minDark  = 0.04,
): number {
  const lo = Math.max(0, target - offset - radius)
  const hi = Math.min(profile.length - 1, target - offset + radius)
  let bestI = -1, bestVal = minDark
  for (let i = lo; i <= hi; i++) {
    if (profile[i] > bestVal) { bestVal = profile[i]; bestI = i }
  }
  return bestI >= 0 ? bestI + offset : target
}

// ── バイリニア補間 ────────────────────────────────────────────
function sampleBilinear(
  data: Uint8ClampedArray,
  w: number, h: number,
  x: number, y: number,
): [number, number, number] {
  const x0 = Math.max(0, Math.min(w - 2, Math.floor(x)))
  const y0 = Math.max(0, Math.min(h - 2, Math.floor(y)))
  const fx  = x - x0, fy = y - y0
  const idx = (px: number, py: number) => (py * w + px) * 4
  const i00 = idx(x0, y0), i10 = idx(x0+1, y0)
  const i01 = idx(x0, y0+1), i11 = idx(x0+1, y0+1)
  const lerp = (a: number, b: number, c: number, d: number) =>
    a*(1-fx)*(1-fy) + b*fx*(1-fy) + c*(1-fx)*fy + d*fx*fy
  return [
    lerp(data[i00],   data[i10],   data[i01],   data[i11]),
    lerp(data[i00+1], data[i10+1], data[i01+1], data[i11+1]),
    lerp(data[i00+2], data[i10+2], data[i01+2], data[i11+2]),
  ]
}

// ── セル切り出し（ピクセル座標直接版） ────────────────────────
function extractCellRect(
  data: Uint8ClampedArray,
  W: number, H: number,
  x0: number, y0: number,
  x1: number, y1: number,
  outW = 160, outH = 100,
): HTMLCanvasElement {
  const canvas  = document.createElement('canvas')
  canvas.width  = outW
  canvas.height = outH
  const ctx     = canvas.getContext('2d')!
  const imgData = ctx.createImageData(outW, outH)
  const d       = imgData.data

  for (let py = 0; py < outH; py++) {
    for (let px = 0; px < outW; px++) {
      const sx = x0 + (px / outW) * (x1 - x0)
      const sy = y0 + (py / outH) * (y1 - y0)
      const [r, g, b] = sampleBilinear(data, W, H, sx, sy)
      const i = (py * outW + px) * 4
      d[i] = r; d[i+1] = g; d[i+2] = b; d[i+3] = 255
    }
  }

  ctx.putImageData(imgData, 0, 0)
  return canvas
}

function hasContent(
  canvas: HTMLCanvasElement,
  darkThreshold = 150,
  minDarkRatio  = 0.04,
): boolean {
  // セル境界線（1.2pt solid）が与えるダークピクセルを除外するため
  // 上下左右 6px のマージンをトリムしてから判定する
  const margin = 6
  const cw = canvas.width,  ch = canvas.height
  const iw = cw - margin * 2, ih = ch - margin * 2
  if (iw <= 0 || ih <= 0) return false
  const ctx  = canvas.getContext('2d')!
  const data = ctx.getImageData(margin, margin, iw, ih).data
  const total = iw * ih
  let dark = 0
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i] + data[i+1] + data[i+2]) / 3 < darkThreshold) dark++
  }
  return dark / total > minDarkRatio
}

// ── メイン関数 ────────────────────────────────────────────────
export async function extractCellsFromImage(
  file:    File,
  innings: number,
): Promise<ExtractionResult> {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      const W = img.naturalWidth, H = img.naturalHeight

      const srcCanvas = document.createElement('canvas')
      srcCanvas.width = W; srcCanvas.height = H
      srcCanvas.getContext('2d')!.drawImage(img, 0, 0)
      const { data } = srcCanvas.getContext('2d')!.getImageData(0, 0, W, H)

      // ① 紙の境界を検出
      const paper = findPaperBounds(data, W, H)
      const { left: pl, right: pr, top: pt, bottom: pb } = paper
      const pw = pr - pl, ph = pb - pt

      // スナップ半径: 紙サイズの約2.5%（A4換算で約7mm相当）
      const snapR = Math.max(10, Math.floor(Math.min(pw, ph) * 0.025))

      // ② 水平プロファイル（行境界検出用）
      // イニング列の中央帯（x: 35%〜75%）で y: 10%〜70% をスキャン
      const hx0 = Math.floor(pl + pw * 0.35)
      const hx1 = Math.floor(pl + pw * 0.75)
      const hy0 = Math.floor(pt + ph * 0.10)
      const hy1 = Math.floor(pt + ph * 0.70)
      const hp  = buildHProfile(data, W, hx0, hx1, hy0, hy1)

      // ③ 垂直プロファイル（列境界検出用）
      // 打者行の中央帯（y: 28%〜62%）で x: 22%〜90% をスキャン
      const vx0 = Math.floor(pl + pw * 0.22)
      const vx1 = Math.floor(pl + pw * 0.90)
      const vy0 = Math.floor(pt + ph * 0.28)
      const vy1 = Math.floor(pt + ph * 0.62)
      const vp  = buildVProfile(data, W, vx0, vx1, vy0, vy1)

      // ④ 各打者行の上下境界をスナップ
      // minDark=0.25 : 実線（~90%）は通すが、0.5pt点線（~30%）は拾わない
      const rowBounds: Array<{ top: number; bottom: number }> = []
      for (let o = 0; o < TMPL.batters; o++) {
        const tTop = TMPL.tableTop + o * TMPL.rowHeight
        const tBot = tTop + TMPL.rowHeight
        rowBounds.push({
          top:    snapToLine(hp, Math.floor(pt + ph * tTop), hy0, snapR, 0.25),
          bottom: snapToLine(hp, Math.floor(pt + ph * tBot), hy0, snapR, 0.25),
        })
      }

      // ⑤ 各イニング列の左右境界
      //
      // ★必ず templateInns(=7) で列幅を計算する★
      // 理由: 印刷シートは常に7列。ゲームが5回戦でも7列が印刷されており、
      //       先頭 innings 列にデータが入っている。
      //       innings(=5) で割ると列幅が1.4倍になり、「打点欄の縦線」を
      //       次の列の左境界と誤認識して1セルが2セルに分裂する。
      //
      // スナップなし（TMPL値直接使用）:
      //   各列内の打点欄縦線(1.2pt solid #555)もプロファイルに現れるため、
      //   snapToLine が誤ってその線にスナップする危険を避ける。
      //   TMPL値はCSS定義から導出した正確な値なのでスナップ不要。
      const innColWidth = (TMPL.innEnd - TMPL.innStart) / TMPL.templateInns
      const colBounds: Array<{ left: number; right: number }> = []
      for (let n = 0; n < innings; n++) {
        const tL = TMPL.innStart + n * innColWidth
        const tR = tL + innColWidth
        colBounds.push({
          left:  Math.floor(pl + pw * tL),
          right: Math.floor(pl + pw * tR),
        })
      }

      // ⑥ セルを切り出し（内容があるものだけ）
      const cells: CellImage[] = []
      for (let order = 1; order <= TMPL.batters; order++) {
        const row = rowBounds[order - 1]
        for (let inn = 1; inn <= innings; inn++) {
          const col = colBounds[inn - 1]
          const cell = extractCellRect(data, W, H, col.left, row.top, col.right, row.bottom)
          if (hasContent(cell)) {
            cells.push({ order, inning: inn, dataUrl: cell.toDataURL('image/jpeg', 0.92) })
          }
        }
      }

      resolve({
        cells,
        cornersFound: cells.length > 0,
        paperBounds:  paper,
        debug: { rowBounds, colBounds },
      })
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve({ cells: [], cornersFound: false, paperBounds: null })
    }

    img.src = url
  })
}
