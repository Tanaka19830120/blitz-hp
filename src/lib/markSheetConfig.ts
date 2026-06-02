/**
 * markSheetConfig.ts
 * マークシート方式: 印刷シート(scorebook-sheet/page.tsx)と
 * 検出器(cellExtractor.ts)で共有するバブル位置定義。
 *
 * 座標系: セル幅・高さに対する正規化比率 (0=左/上端, 1=右/下端)
 * セルはイニング列 × 打者行の全体（ab-left/ab-right 分割なし）
 * セルサイズ: 23mm × 16mm (横向きA4, 行高 16mm)
 *
 * ★ 印刷シートのバブル位置と このファイルの座標を必ず同期させること。
 *    どちらかを変更したら必ず両方更新する。
 */

/**
 * バブルはセル上部70%（一巡目記入欄）に収める。
 * 下部30%はdashed区切り線付きの二巡目手書き欄。
 * ny は上部70%内で均等3段: 約0.17 / 0.38 / 0.57
 */

/** 打撃コードバブル定義 */
export const CODE_BUBBLES = [
  // 行1 (ny=0.17): 主要打撃コード — O/1/2/3/4/B
  { code: 'O', nx: 0.10, ny: 0.17 },
  { code: '1', nx: 0.26, ny: 0.17 },
  { code: '2', nx: 0.42, ny: 0.17 },
  { code: '3', nx: 0.58, ny: 0.17 },
  { code: '4', nx: 0.74, ny: 0.17 },
  { code: 'B', nx: 0.90, ny: 0.17 },
  // 行2 (ny=0.38): 補助コード — D/S/X
  { code: 'D', nx: 0.10, ny: 0.38 },
  { code: 'S', nx: 0.26, ny: 0.38 },
  { code: 'X', nx: 0.42, ny: 0.38 },
] as const

/** 打点バブル定義 (ny=0.57) */
export const RBI_BUBBLES = [
  { value: '1', nx: 0.42, ny: 0.57 },
  { value: '2', nx: 0.58, ny: 0.57 },
  { value: '3', nx: 0.74, ny: 0.57 },
  { value: '4', nx: 0.90, ny: 0.57 },
] as const

/** 盗塁バブル (行2の右端, ny=0.38) */
export const STOLEN_BUBBLE = { nx: 0.74, ny: 0.38 } as const

/**
 * バブル半径 / セル幅 (検出用)
 * 印刷バブル直径 3.2mm / セル幅 23mm → radius 1.6mm / 23 ≈ 0.070
 * 検出は印刷より若干大きめにして ink bleed / カメラ歪みを吸収
 */
export const BUBBLE_R_RATIO = 0.070

/** 塗りつぶし判定閾値: バブル内ダークピクセル比率 */
export const FILL_THRESHOLD = 0.18

export type CodeBubble   = typeof CODE_BUBBLES[number]
export type RbiBubble    = typeof RBI_BUBBLES[number]
export type StolenBubble = typeof STOLEN_BUBBLE
