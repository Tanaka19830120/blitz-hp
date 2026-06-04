'use client'

import { useState, useTransition, useRef, Fragment } from 'react'
import type { ScoreBookData, BatterSlot, BatterSub, PitcherSlot, BatterStats } from '@/lib/scorebook'
import { calcBatterStats, parseCode, cellColor } from '@/lib/scorebook'
import { LineConfirmModal } from './LineConfirmModal'
import { extractCellsFromImage, TEMPLATE_INNINGS } from '@/lib/cellExtractor'

// マークシートOCRデバッグ: セル画像 + バブル検出結果 + 組立結果の1行
interface OcrDebugEntry {
  order:    number
  inning:   number
  image:    string         // セル全体のプレビュー画像
  // 一巡目
  ab1code:   string | null
  ab1rbi:    string | null
  ab1stolen: boolean
  ab1img:    string        // 一巡目コード欄サブ画像
  ab1rbiImg: string        // 一巡目打点欄サブ画像
  // 二巡目
  ab2code:   string | null
  ab2rbi:    string | null
  ab2stolen: boolean
  ab2img:    string        // 二巡目コード欄サブ画像
  ab2rbiImg: string        // 二巡目打点欄サブ画像
  // AI OCR 結果 (あれば)
  aiAssembled?: string
  // 後方互換
  code:     string | null
  rbi:      string | null
  stolen:   boolean
  assembled: string
}

interface PlayerOption {
  id:     string
  name:   string
  number: number | null
}

interface Props {
  players:         PlayerOption[]
  scheduleId:      string
  initialData:     ScoreBookData
  saveAction:      (scheduleId: string, json: string, sendLine: boolean) => Promise<void>
  savePhotoAction: (scheduleId: string, photoUrl: string) => Promise<void>
  lineConfigured:  boolean
  scheduleInfo?:   { date: string; opponent: string }
}

// LINE 送信プレビュー（クライアント側で生成）
function buildLinePreview(
  scheduleInfo: { date: string; opponent: string },
  ourScore: string,
  opponentScore: string,
  note: string,
  batters: BatterSlot[],
  pitchers: PitcherSlot[],
  players: PlayerOption[]
): string {
  const playerMap = new Map(players.map(p => [p.id, p]))
  const our = parseInt(ourScore) || 0
  const opp = parseInt(opponentScore) || 0
  const result = our > opp ? 'WIN' : our < opp ? 'LOSE' : 'DRAW'
  const emoji = result === 'WIN' ? '🏆 勝利！' : result === 'LOSE' ? '😔 敗戦' : '🤝 引き分け'
  const dateStr = new Date(scheduleInfo.date).toLocaleDateString('ja-JP', {
    month: 'long', day: 'numeric', weekday: 'short',
  })

  const lines: (string | null)[] = [
    `⚾【BLITZ】試合結果`,
    `${dateStr} vs ${scheduleInfo.opponent}`,
    `━━━━━━━━━━━━`,
    `BLITZ ${our} ー ${opp} ${scheduleInfo.opponent}`,
    ``,
    emoji,
    note ? `\n${note}` : null,
  ]

  const hitters = batters
    .filter(b => b.userId && playerMap.has(b.userId))
    .map(b => ({ name: playerMap.get(b.userId)!.name, order: b.order, stats: calcBatterStats(b.cells) }))
    .filter(h => h.stats.pa > 0)

  if (hitters.length > 0) {
    lines.push(``)
    lines.push(`━━━━━━━━━━━━`)
    lines.push(`【打者成績】安打/打数`)
    for (const h of hitters) {
      let line = `${h.order}番 ${h.name}: ${h.stats.h}/${h.stats.ab}`
      const pts: string[] = []
      if (h.stats.rbi      > 0) pts.push(`${h.stats.rbi}打点`)
      if (h.stats.homeRuns > 0) pts.push('HR')
      if (h.stats.triples  > 0) pts.push('3塁打')
      if (h.stats.doubles  > 0) pts.push('2塁打')
      if (h.stats.sb       > 0) pts.push('盗塁')
      if (h.stats.bb       > 0) pts.push(`${h.stats.bb}四球`)
      if (pts.length > 0) line += ` (${pts.join('・')})`
      lines.push(line)
    }
  }

  const validPitchers = pitchers.filter(p => p.userId && playerMap.has(p.userId) && p.innings)
  if (validPitchers.length > 0) {
    lines.push(``)
    lines.push(`━━━━━━━━━━━━`)
    lines.push(`【投手成績】`)
    for (const p of validPitchers) {
      const name = playerMap.get(p.userId)!.name
      let line = `${name}: ${p.innings}回 ${p.runs}失点`
      if (p.earnedRuns != null && p.earnedRuns !== p.runs) line += `(${p.earnedRuns}自責)`
      const pts: string[] = []
      if (p.strikeouts) pts.push(`${p.strikeouts}K`)
      if (p.walks)      pts.push(`${p.walks}BB`)
      if (pts.length > 0) line += ` ${pts.join(' ')}`
      if (p.decision)   line += ` [${p.decision}]`
      lines.push(line)
    }
  }

  return lines.filter(Boolean).join('\n')
}

const INNINGS_OPTIONS = [5, 7, 9]
const DECISIONS  = ['', '勝', '負', 'S', 'H'] as const
const POSITIONS  = ['', '投', '捕', '一', '二', '三', '遊', '左', '中', '右', '指'] as const

/** コード文字列を 左（打撃コード+s）/ 右（打点数字）に分解
 *  "2S1" (OCR出力) も "21S" (正規) も同じく処理 */
function splitCode(code: string): { left: string; right: string } {
  const t = code.trim().toUpperCase()
  if (!t) return { left: '', right: '' }
  const m = t.match(/^([KGFO1234BDSX])([0-9S]*)$/)
  if (!m) return { left: code.trim(), right: '' }
  const rest       = m[2] ?? ''
  const digitMatch = rest.match(/[0-9]/)
  const hasS       = rest.includes('S')
  return { left: m[1] + (hasS ? 's' : ''), right: digitMatch ? digitMatch[0] : '' }
}

/** 左（打撃コード+s）/ 右（打点数字）を結合してコード文字列にする */
function mergeCode(left: string, right: string): string {
  const l = left.trim().toUpperCase()
  if (!l) return ''
  const hasS = l.length > 1 && l[1] === 'S'
  return l[0] + (right || '') + (hasS ? 's' : '')
}

/** バブル検出結果からスコアブックコードを組み立てる */
function buildCode(code: string | null, rbi: string | null, stolen: boolean): string {
  if (!code) return ''
  const validCodes = new Set(['O', '1', '2', '3', '4', 'B', 'D', 'S', 'X'])
  if (!validCodes.has(code)) return ''
  const rbiStr = (rbi && /^[1-9]$/.test(rbi)) ? rbi : ''
  return code + rbiStr + (stolen ? 's' : '')
}

const STAT_COLS: { key: keyof BatterStats; label: string; color: string }[] = [
  { key: 'pa',       label: '打席', color: 'text-[#94a3b8]' },
  { key: 'ab',       label: '打数', color: 'text-[#94a3b8]' },
  { key: 'h',        label: '安打', color: 'text-[#22c55e]' },
  { key: 'doubles',  label: '2塁',  color: 'text-[#60a5fa]' },
  { key: 'triples',  label: '3塁',  color: 'text-[#60a5fa]' },
  { key: 'homeRuns', label: 'HR',   color: 'text-[#fbbf24]' },
  { key: 'rbi',      label: '打点', color: 'text-[#94a3b8]' },
  { key: 'sb',       label: '盗塁', color: 'text-[#a78bfa]' },
  { key: 'bb',       label: '四球', color: 'text-[#60a5fa]' },
  { key: 'hbp',      label: '死球', color: 'text-[#60a5fa]' },
]

function playerLabel(p: PlayerOption): string {
  return (p.number != null ? `#${p.number} ` : '') + (p.name || '(未設定)')
}

export function ScoreBookEditor({ players, scheduleId, initialData, saveAction, savePhotoAction, lineConfigured, scheduleInfo }: Props) {
  // デバッグ: scheduleInfo 確認
  /* ── スコア ── */
  // BLITZ得点はスコアブックの打点合計、相手得点はイニングスコア合計からライブ計算する
  const [note, setNote] = useState<string>(initialData.note ?? '')
  const [sendLine, setSendLine] = useState(false)

  /* ── スコアブック ── */
  const [innings,  setInnings]  = useState<number>(initialData.innings)
  const [batters,  setBatters]  = useState<BatterSlot[]>(initialData.batters)
  const [pitchers, setPitchers] = useState<PitcherSlot[]>(initialData.pitchers)

  /* ── イニングスコア ── */
  // BLITZ はスコアブックからライブ計算（ourInningScores）。相手のみ手入力。
  const [opponentInnings, setOpponentInnings] = useState<(number | null)[]>(
    initialData.inningScores?.opponent ?? Array(initialData.innings).fill(null)
  )

  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  // ── BLITZ のイニングスコアはスコアブック(打撃成績)からライブ計算 ──
  // 各イニングの打点合計。打席のあったイニングは 0 でも数値、無ければ null(空欄)
  const ourInningScores: (number | null)[] = (() => {
    const arr: (number | null)[] = Array(initialData.innings).fill(null)
    for (const b of batters) {
      for (const [innStr, code] of Object.entries(b.cells)) {
        const inn = parseInt(innStr)
        if (inn < 1 || inn > initialData.innings || !code) continue
        arr[inn - 1] = (arr[inn - 1] ?? 0) + calcBatterStats({ 0: code }).rbi
      }
    }
    return arr
  })()
  const ourScoreTotal = ourInningScores.reduce((sum: number, n) => sum + (n ?? 0), 0)
  const opponentScoreTotal = opponentInnings.reduce((sum: number, n) => sum + (n ?? 0), 0)

  // BLITZ 得点（打点合計）
  const ourRbiTotal = ourScoreTotal

  // 先攻・後攻の表示順入れ替え（true なら相手チームを上に表示）
  const [oppFirst, setOppFirst] = useState(false)

  // ── LINE 確認モーダル ──
  const [showLineModal, setShowLineModal] = useState(false)
  const [linePreview,   setLinePreview]   = useState('')
  const [pendingData,   setPendingData]   = useState<ScoreBookData | null>(null)

  // ── OCR import ──
  const ocrInputRef = useRef<HTMLInputElement>(null)
  const [ocrState, setOcrState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [ocrMessage, setOcrMessage] = useState('')
  const [ocrDebugUrl, setOcrDebugUrl] = useState<string | null>(null)
  const [showDebug, setShowDebug] = useState(false)

  // OCRデバッグ詳細: セル画像 + Claude生回答 + 組立結果
  const [ocrDebugEntries, setOcrDebugEntries] = useState<OcrDebugEntry[]>([])
  const [showOcrDetail,   setShowOcrDetail]   = useState(false)
  const [debugLog, setDebugLog] = useState<string[]>([])  // 画面表示用デバッグログ


  async function handleOcrImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setOcrState('loading')
    setDebugLog([])  // ログクリア
    const addLog = (msg: string) => {
      console.log(msg)
      setDebugLog(prev => [...prev, `${new Date().toLocaleTimeString('ja-JP', {hour:'2-digit',minute:'2-digit',second:'2-digit',fractionalSecondDigits:3})}: ${msg}`])
    }

    setOcrMessage('📷 画像読み込み中…')
    addLog(`[START] ファイル選択: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB, ${file.type})`)

    try {
      // ── ① クライアント側でセルを切り出す ──
      setOcrMessage('📷 四隅マーカーを検出中…')
      addLog('[STEP 1] extractCellsFromImage 呼び出し開始')
      const extraction = await extractCellsFromImage(file, TEMPLATE_INNINGS)
      addLog('[STEP 1] extractCellsFromImage 完了')

      if (extraction.debugImageUrl) {
        setOcrDebugUrl(extraction.debugImageUrl)
        setShowDebug(false)  // デフォルトで非表示
        addLog('[STEP 1] デバッグ画像生成完了')
      }

      if (!extraction.cornersFound) {
        setOcrState('error')
        setOcrMessage('四隅のマーカーが見つかりませんでした。デバッグ表示で探索領域を確認してください。')
        addLog('[ERROR] マーカー未検出')
        setShowDebug(true)  // エラー時のみ自動表示
        return
      }

      const totalCells = extraction.cells.length
      addLog(`[STEP 1] セル抽出完了: ${totalCells}個`)
      setOcrMessage(`🤖 AI が読み取り中… (セル ${totalCells} 個)`)

      // ── ② サブ画像を AI OCR API に送信 ──
      // cells を {order→{inning→{ab1,rbi1,ab2,rbi2}}} 形式に整形
      addLog(`[STEP 2] セルデータ整形開始`)
      const cellsData: Record<string, Record<string, {
        ab1: string; rbi1: string; ab2: string | null; rbi2: string | null
        preAb1?: string; preAb2?: string
      }>> = {}
      for (const c of extraction.cells) {
        const ok = String(c.order), ik = String(c.inning)
        if (!cellsData[ok]) cellsData[ok] = {}
        cellsData[ok][ik] = {
          ab1:  c.ab1img,
          rbi1: c.ab1rbiImg,
          ab2:  c.ab2img,
          rbi2: c.ab2rbiImg,
          preAb1: c.ab1code ?? undefined,
          preAb2: c.ab2code ?? undefined,
        }
      }
      addLog(`[STEP 2] セルデータ整形完了`)

      addLog(`[STEP 3] 元画像圧縮開始 (元サイズ: ${(file.size / 1024).toFixed(0)}KB)`)
      // 元画像を 800px 以下に縮小して JPEG quality 0.6 で圧縮（ペイロード削減）
      const compressedBlob = await new Promise<Blob>((resolve) => {
        const img = new Image()
        img.onload = () => {
          const maxDim = 800
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
          const w = Math.round(img.width * scale)
          const h = Math.round(img.height * scale)
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(img, 0, 0, w, h)
          canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.6)
        }
        img.src = URL.createObjectURL(file)
      })
      addLog(`[STEP 3] 圧縮完了 (圧縮後: ${(compressedBlob.size / 1024).toFixed(0)}KB)`)

      addLog(`[STEP 3] FormData作成開始`)
      const fd = new FormData()
      fd.append('image', compressedBlob, 'image.jpg')
      fd.append('innings', String(innings))
      const cellsJson = JSON.stringify(cellsData)
      addLog(`[STEP 3] cells JSON size: ${(cellsJson.length / 1024).toFixed(1)}KB`)
      fd.append('cells',   cellsJson)
      addLog(`[STEP 3] FormData作成完了 (合計: ${((compressedBlob.size + cellsJson.length) / 1024).toFixed(0)}KB)`)

      addLog(`[STEP 4] API呼び出し開始 /api/ocr-scorebook`)
      const res = await fetch('/api/ocr-scorebook', { method: 'POST', body: fd })
      addLog(`[STEP 4] API応答受信: status=${res.status} ${res.statusText}`)
      if (!res.ok) {
        addLog(`[STEP 4] APIエラー: HTTP ${res.status}`)
        const body = await res.json().catch(() => ({ error: res.statusText }))
        const errorMsg = body.error ?? res.statusText
        const errorDetails = body.details ? `\n${body.details}` : ''
        addLog(`[ERROR] サーバーエラー: ${errorMsg}`)
        throw new Error(`${errorMsg}${errorDetails}`)
      }
      addLog(`[STEP 5] レスポンスJSON解析開始`)
      const json = await res.json()
      addLog(`[STEP 5] JSON解析完了`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = json.data as any

      // ── ③ AI 結果をスコアブックに反映 ──
      addLog(`[STEP 6] AI結果の反映開始`)
      const batterCells: Record<string, Record<string, string>> = data.batterCells ?? {}
      const debugEntries: OcrDebugEntry[] = []

      addLog(`[STEP 6] デバッグエントリ生成開始`)
      for (const c of extraction.cells) {
        const ok = String(c.order), ik = String(c.inning)
        const aiCode = batterCells[ok]?.[ik] ?? ''
        // バブル検出結果（参考表示用）
        const bubbleCode1 = buildCode(c.ab1code, c.ab1rbi, c.ab1stolen)
        const bubbleCode2 = buildCode(c.ab2code, c.ab2rbi, c.ab2stolen)
        const bubbleAssembled = bubbleCode1 && bubbleCode2 ? `${bubbleCode1},${bubbleCode2}`
                              : bubbleCode1 || bubbleCode2 || ''
        if (!aiCode && !bubbleAssembled) continue
        debugEntries.push({
          order: c.order, inning: c.inning,
          image: c.image,
          ab1img: c.ab1img, ab1rbiImg: c.ab1rbiImg,
          ab2img: c.ab2img, ab2rbiImg: c.ab2rbiImg,
          ab1code: c.ab1code, ab1rbi: c.ab1rbi, ab1stolen: c.ab1stolen,
          ab2code: c.ab2code, ab2rbi: c.ab2rbi, ab2stolen: c.ab2stolen,
          code: c.code, rbi: c.rbi, stolen: c.stolen,
          aiAssembled: aiCode || undefined,
          assembled: aiCode || bubbleAssembled,
        })
      }
      addLog(`[STEP 6] デバッグエントリ生成完了: ${debugEntries.length}件`)

      // 全打者のセルをリセットして AI 結果で上書き
      addLog(`[STEP 7] 打者データ更新開始`)
      setBatters(prev => prev.map(b => {
        const extracted = batterCells[String(b.order)]
        if (!extracted || Object.keys(extracted).length === 0) return { ...b, cells: {} }
        return { ...b, cells: Object.fromEntries(Object.entries(extracted).filter(([, v]) => v)) }
      }))
      addLog(`[STEP 7] 打者データ更新完了`)
      // BLITZ のイニングスコアは打者データ(b.cells)からライブ計算されるため自動反映される

      const cellCount = Object.values(batterCells).reduce((n, r) => n + Object.keys(r).length, 0)
      addLog(`[STEP 8] 完了: ${cellCount}セル読み込み成功`)

      // ── スコア表写真を自動アップロード ──
      addLog(`[STEP 9] スコア表写真のアップロード開始`)
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('scheduleId', scheduleId)
        const uploadRes = await fetch('/api/upload-score-photo', { method: 'POST', body: fd })
        if (!uploadRes.ok) throw new Error(`写真アップロード失敗: ${uploadRes.statusText}`)
        const { url } = await uploadRes.json()
        await savePhotoAction(scheduleId, url)
        addLog(`[STEP 9] スコア表写真のアップロード完了`)
      } catch (photoErr) {
        console.warn('[OCR] 写真アップロードは失敗しましたが、OCR結果は取得できました:', photoErr)
        addLog(`[WARNING] 写真アップロードは失敗しましたが、OCR結果は正常に取得できました`)
      }

      // BLITZ 得点はスコアブックの打点合計からライブ計算されるため、ここでの代入は不要
      setOcrState('done')
      setOcrMessage(`✅ AI が ${cellCount} セルを読み込みました。内容を確認して保存してください。`)
      debugEntries.sort((a, b) => a.order !== b.order ? a.order - b.order : a.inning - b.inning)
      setOcrDebugEntries(debugEntries)
      setShowOcrDetail(false)  // デフォルトで非表示
      setTimeout(() => setOcrState('idle'), 10000)
    } catch (err) {
      console.error('[OCR] エラー発生:', err)
      addLog(`[ERROR] 例外キャッチ: ${err instanceof Error ? err.name : typeof err}`)
      setOcrState('error')

      // エラー時にログパネルを自動表示
      setTimeout(() => {
        const logEl = document.getElementById('debug-log-panel')
        if (logEl) logEl.classList.remove('hidden')
      }, 100)

      // エラー詳細をできる限り表示（デバッグ用）
      let detail: string
      if (err instanceof Error) {
        // Error オブジェクトの全プロパティをダンプ
        console.error('[OCR] Error details:', {
          name: err.name,
          message: err.message,
          stack: err.stack,
          cause: err.cause,
          toString: err.toString(),
          keys: Object.keys(err),
          prototype: Object.getPrototypeOf(err)?.constructor?.name,
        })
        detail = err.message ? `${err.name}: ${err.message}` : `${err.name}(メッセージなし)`
        if (err.stack) {
          const firstLine = err.stack.split('\n')[1]?.trim()
          if (firstLine) detail += ` [at ${firstLine}]`
        }
        addLog(`[ERROR] ${detail}`)
      } else if (err === null || err === undefined) {
        detail = `null/undefined が throw されました`
        addLog(`[ERROR] ${detail}`)
      } else {
        detail = `(Error 以外): ${String(err)}`
        addLog(`[ERROR] ${detail}`)
      }
      setOcrMessage(`❌ エラー: ${detail}`)
    }
  }

  /** マークシートデバッグ結果をHTMLファイルとしてダウンロード */
  function downloadOcrDebug(entries: OcrDebugEntry[]) {
    const ab = (code: string | null, rbi: string | null, stolen: boolean) => {
      if (!code && !stolen) return '<span style="color:#475569">─</span>'
      const c = code ?? '?'
      const r = rbi ? `<span style="color:#fbbf24">${rbi}点</span>` : ''
      const s = stolen ? `<span style="color:#a78bfa">s</span>` : ''
      return `<span style="color:#22c55e;font-weight:bold">${c}</span>${r}${s}`
    }
    const rows = entries.map(e => {
      const fullImg    = `<td style="padding:2px;vertical-align:middle"><img src="${e.image}" style="height:44px;display:block;border:1px solid #334155"></td>`
      const ab1Img     = `<td style="padding:2px;vertical-align:middle"><img src="${e.ab1img}" style="height:22px;display:block;border:1px solid #334155"></td>`
      const ab1RbiImg  = `<td style="padding:2px;vertical-align:middle"><img src="${e.ab1rbiImg}" style="height:22px;display:block;border:1px solid #334155"></td>`
      const ab1Res     = `<td style="padding:2px 6px;vertical-align:middle">${ab(e.ab1code, e.ab1rbi, e.ab1stolen)}</td>`
      const ab2Img     = `<td style="padding:2px;vertical-align:middle"><img src="${e.ab2img}" style="height:22px;display:block;border:1px solid #334155"></td>`
      const ab2RbiImg  = `<td style="padding:2px;vertical-align:middle"><img src="${e.ab2rbiImg}" style="height:22px;display:block;border:1px solid #334155"></td>`
      const ab2Res     = `<td style="padding:2px 6px;vertical-align:middle">${ab(e.ab2code, e.ab2rbi, e.ab2stolen)}</td>`
      const aiLabel    = e.aiAssembled ? `<span style="font-size:9px;color:#60a5fa">[AI]</span> <span style="color:#22c55e;font-weight:bold">${e.aiAssembled}</span>` : ''
      const bubbleLabel= e.assembled && e.assembled !== e.aiAssembled ? `<span style="font-size:9px;color:#94a3b8">[泡]</span> <span style="color:#a78bfa">${e.assembled}</span>` : ''
      const asmDisplay = aiLabel || bubbleLabel || '<span style="color:#ef4444">(空)</span>'
      const asmCell    = `<td style="padding:2px 8px;font-size:13px;vertical-align:middle">${asmDisplay}</td>`
      return `<tr style="border-bottom:1px solid #1e3a5f">
        <td style="padding:2px 6px;color:#94a3b8;vertical-align:middle">${e.order}</td>
        <td style="padding:2px 6px;color:#94a3b8;vertical-align:middle">${e.inning}</td>
        ${fullImg}${ab1Img}${ab1RbiImg}${ab1Res}${ab2Img}${ab2RbiImg}${ab2Res}${asmCell}
      </tr>`
    }).join('\n')

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>マークシート デバッグ ${new Date().toLocaleString('ja-JP')}</title>
<style>
  body{background:#0d1b2a;color:#e2e8f0;font-family:monospace;font-size:12px;padding:16px}
  h1{font-size:16px;margin-bottom:12px;color:#94a3b8}
  table{border-collapse:collapse;width:100%}
  th{padding:4px 6px;border-bottom:2px solid #334155;color:#64748b;text-align:left;white-space:nowrap}
  .legend{margin-bottom:10px;font-size:11px;color:#64748b}
  .legend span{margin-right:16px}
  .legend .ok{color:#22c55e}.legend .ng{color:#ef4444}
</style></head><body>
<h1>📋 マークシート デバッグ — ${new Date().toLocaleString('ja-JP')}</h1>
<div class="legend">
  <span>セル全体 / 一巡目コード / 一巡目打点 / 一巡目結果 / 二巡目コード / 二巡目打点 / 二巡目結果 / 組立結果([AI]=Claude / [泡]=バブル検出)</span>
</div>
<table>
<thead><tr>
  <th>打順</th><th>回</th>
  <th>セル全体</th><th>一巡目コード</th><th>一巡目打点</th><th>一巡目結果</th>
  <th>二巡目コード</th><th>二巡目打点</th><th>二巡目結果</th>
  <th>組立結果</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `marksheet-debug-${new Date().toISOString().slice(0,16).replace('T','-')}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  /* ── cell mutations ── */
  function setCell(bIdx: number, inning: number, value: string) {
    setBatters(prev => prev.map((b, i) =>
      i === bIdx ? { ...b, cells: { ...b.cells, [inning]: value } } : b
    ))
  }

  function setBatterPlayer(bIdx: number, userId: string) {
    setBatters(prev => prev.map((b, i) => i === bIdx ? { ...b, userId } : b))
  }

  function addBatter() {
    setBatters(prev => [...prev, { order: prev.length + 1, userId: '', position: '', cells: {}, subs: [] }])
  }

  function removeLastBatter() {
    setBatters(prev => prev.length > 1 ? prev.slice(0, -1) : prev)
  }

  function setBatterPosition(bIdx: number, position: string) {
    setBatters(prev => prev.map((b, i) => i === bIdx ? { ...b, position } : b))
  }

  function setBatterPosition2(bIdx: number, position2: string) {
    setBatters(prev => prev.map((b, i) => i === bIdx ? { ...b, position2 } : b))
  }

  function addSub(bIdx: number) {
    setBatters(prev => prev.map((b, i) => {
      if (i !== bIdx) return b
      const newSub: BatterSub = { fromInning: innings, userId: '', position: '', cells: {} }
      return { ...b, subs: [...(b.subs ?? []), newSub] }
    }))
  }

  function removeSub(bIdx: number, sIdx: number) {
    setBatters(prev => prev.map((b, i) => {
      if (i !== bIdx) return b
      return { ...b, subs: (b.subs ?? []).filter((_, j) => j !== sIdx) }
    }))
  }

  function setSubPlayer(bIdx: number, sIdx: number, userId: string) {
    setBatters(prev => prev.map((b, i) => {
      if (i !== bIdx) return b
      return { ...b, subs: b.subs?.map((s, j) => j === sIdx ? { ...s, userId } : s) }
    }))
  }

  function setSubPosition(bIdx: number, sIdx: number, position: string) {
    setBatters(prev => prev.map((b, i) => {
      if (i !== bIdx) return b
      return { ...b, subs: b.subs?.map((s, j) => j === sIdx ? { ...s, position } : s) }
    }))
  }

  function setSubFromInning(bIdx: number, sIdx: number, fromInning: number) {
    setBatters(prev => prev.map((b, i) => {
      if (i !== bIdx) return b
      return { ...b, subs: b.subs?.map((s, j) => j === sIdx ? { ...s, fromInning } : s) }
    }))
  }

  function setSubCell(bIdx: number, sIdx: number, inning: number, value: string) {
    setBatters(prev => prev.map((b, i) => {
      if (i !== bIdx) return b
      return { ...b, subs: b.subs?.map((s, j) => j === sIdx ? { ...s, cells: { ...s.cells, [inning]: value } } : s) }
    }))
  }

  /* ── pitcher mutations ── */
  function setPitcherField<K extends keyof PitcherSlot>(pIdx: number, key: K, value: PitcherSlot[K]) {
    setPitchers(prev => prev.map((p, i) => i === pIdx ? { ...p, [key]: value } : p))
  }

  function addPitcher() {
    setPitchers(prev => [...prev, {
      userId: '', innings: '', runs: 0, earnedRuns: 0,
      hitsAllowed: 0, strikeouts: 0, walks: 0, pitches: 0, decision: '',
    }])
  }

  function removePitcher(pIdx: number) {
    setPitchers(prev => prev.filter((_, i) => i !== pIdx))
  }

  /* ── save ── */
  function executeSave(data: ScoreBookData, withLine: boolean) {
    startTransition(async () => {
      try {
        await saveAction(scheduleId, JSON.stringify(data), withLine)
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 3500)
      } catch {
        setStatus('error')
        setTimeout(() => setStatus('idle'), 3500)
      }
    })
  }

  function handleSave() {
    const data: ScoreBookData = {
      innings,
      batters,
      pitchers,
      ourScore:      ourRbiTotal || null,
      opponentScore: opponentScoreTotal || null,
      inningScores: {
        our:      Array.from({ length: innings }, (_, i) => ourInningScores[i] ?? null),
        opponent: Array.from({ length: innings }, (_, i) => opponentInnings[i] ?? null),
      },
      note,
    }

    // LINE 送信する場合はモーダルで確認
    if (sendLine && scheduleInfo) {
      const preview = buildLinePreview(scheduleInfo, String(ourRbiTotal), String(opponentScoreTotal), note, batters, pitchers, players)
      setLinePreview(preview)
      setPendingData(data)
      setShowLineModal(true)
      return
    }

    executeSave(data, false)
  }

  // LINE モーダル: 送信して保存
  function handleLineConfirm() {
    setShowLineModal(false)
    if (pendingData) executeSave(pendingData, true)
  }

  // LINE モーダル: キャンセル（LINE送信なしで保存）
  function handleLineCancel() {
    setShowLineModal(false)
    if (pendingData) executeSave(pendingData, false)
  }

  /* ── live stats ── */
  // 交代がある場合は fromInning より前のイニングだけ集計（交代後は交代選手行で集計）
  const statsMap = batters.map(b => {
    const firstSubInning = b.subs?.length
      ? Math.min(...b.subs.map(s => s.fromInning))
      : null
    if (firstSubInning == null) return calcBatterStats(b.cells)
    const filteredCells = Object.fromEntries(
      Object.entries(b.cells).filter(([k]) => parseInt(k) < firstSubInning)
    ) as Record<number, string>
    return calcBatterStats(filteredCells)
  })

  return (
    <div className="flex flex-col gap-6">

      {/* ── LINE 確認モーダル ── */}
      <LineConfirmModal
        isOpen={showLineModal}
        title="試合結果をLINEに送信"
        preview={linePreview}
        onConfirm={handleLineConfirm}
        onCancel={handleLineCancel}
        isPending={isPending}
      />

      {/* ━━━━ SCORE ━━━━ */}
      <div>
        <h3 className="text-xs font-bold text-[#94a3b8] tracking-widest uppercase mb-3">スコア</h3>
        <div className="flex flex-wrap items-end gap-4">
          <div style={{ width: '8rem' }}>
            <label className="block text-xs text-[#64748b] mb-1">BLITZ 得点</label>
            <div className="text-2xl font-black text-center text-[#60a5fa] py-2">
              {ourRbiTotal}
            </div>
          </div>
          <div className="text-2xl font-black text-[#475569] pb-1">ー</div>
          <div style={{ width: '8rem' }}>
            <label className="block text-xs text-[#64748b] mb-1">{scheduleInfo?.opponent || '相手'} 得点</label>
            <div className="text-2xl font-black text-center text-[#f59e0b] py-2">
              {opponentScoreTotal}
            </div>
          </div>
          <div className="flex-1 min-w-[12rem]">
            <label className="block text-xs text-[#64748b] mb-1">コメント</label>
            <input
              type="text" value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="試合のコメント（任意）"
              className="w-full text-sm"
            />
          </div>
        </div>
      </div>

      {/* ━━━━ INNING SCORES ━━━━ */}
      <div>
        <h3 className="text-xs font-bold text-[#94a3b8] tracking-widest uppercase mb-2">イニングスコア</h3>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                <th className="text-right pr-2 font-normal text-[#64748b]" style={{ width: '60px' }} />
                {Array.from({ length: innings }, (_, i) => (
                  <th key={i + 1} className="text-center font-normal text-[#64748b] px-1"
                    style={{ width: '60px' }}>{i + 1}</th>
                ))}
                <th className="text-center font-bold text-[#94a3b8] px-2"
                  style={{ width: '40px', borderLeft: '1px solid #1e3a5f' }}>計</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const ourRow = {
                  key: 'our',
                  label: 'BLITZ',
                  color: '#60a5fa',
                  innings: ourInningScores,
                  setInnings: null,                 // BLITZ はスコアブックから自動計算（読み取り専用）
                  total: ourScoreTotal,
                }
                const oppRow = {
                  key: 'opp',
                  label: scheduleInfo?.opponent || '相手',
                  color: '#f59e0b',
                  innings: opponentInnings,
                  setInnings: setOpponentInnings,
                  total: opponentScoreTotal,
                }
                const rows = oppFirst ? [oppRow, ourRow] : [ourRow, oppRow]
                return rows.map(row => (
                  <tr key={row.key}>
                    <td className="text-right pr-2 font-medium" style={{ color: row.color }}>{row.label}</td>
                    {Array.from({ length: innings }, (_, i) => (
                      <td key={i + 1} className="py-0.5 px-0.5">
                        {row.setInnings ? (
                          <input
                            type="number" min={0}
                            value={row.innings[i] ?? ''}
                            onChange={e => {
                              const v = e.target.value === '' ? null : parseInt(e.target.value)
                              row.setInnings!(prev => { const a = [...prev]; a[i] = v; return a })
                            }}
                            className="w-full text-center text-sm py-1 px-1 min-w-[60px]"
                            style={{ color: row.color }}
                          />
                        ) : (
                          <div className="w-full text-center text-sm py-1 px-1 min-w-[60px]"
                            style={{ color: row.color }}>
                            {row.innings[i] ?? '─'}
                          </div>
                        )}
                      </td>
                    ))}
                    <td className="text-center font-bold px-2"
                      style={{ borderLeft: '1px solid #1e3a5f', color: row.color }}>
                      {row.total || '─'}
                    </td>
                  </tr>
                ))
              })()}
            </tbody>
          </table>
          <div className="mt-2">
            <button
              onClick={() => setOppFirst(v => !v)}
              className="text-xs px-3 py-1.5 rounded-lg border border-[#94a3b8]/50 text-[#94a3b8] hover:border-[#94a3b8] hover:bg-[#94a3b8]/5 transition-all font-medium"
            >
              ⇅ 先攻・後攻の表示を入れ替え
            </button>
          </div>
        </div>
      </div>

      {/* ━━━━ SCOREBOOK ━━━━ */}
      <div>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <h3 className="text-xs font-bold text-[#94a3b8] tracking-widest uppercase">スコアブック</h3>

          {/* OCR インポートボタン */}
          <div className="flex items-center gap-2">
            <input
              ref={ocrInputRef}
              type="file"
              accept="image/*"
              onChange={handleOcrImport}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => ocrInputRef.current?.click()}
              disabled={ocrState === 'loading'}
              className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all flex items-center gap-1.5 ${
                ocrState === 'loading'
                  ? 'border-[#1e3a5f] text-[#475569] cursor-wait opacity-60'
                  : ocrState === 'done'
                  ? 'border-[#22c55e]/50 text-[#22c55e] bg-[#22c55e]/5'
                  : ocrState === 'error'
                  ? 'border-red-500/40 text-red-400 bg-red-900/10'
                  : 'border-[#a78bfa]/40 text-[#a78bfa] hover:bg-[#7c3aed]/10'
              }`}
              title="印刷シートのバブルを塗りつぶして写真を撮影するとコードを自動入力します"
            >
              {ocrState === 'loading' ? '⏳ 読み取り中…' : '📷 シートから読み込み'}
            </button>
            {ocrMessage && (
              <span className={`text-xs ${ocrState === 'error' ? 'text-red-400' : 'text-[#94a3b8]'}`}>
                {ocrMessage}
              </span>
            )}
            {debugLog.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const logEl = document.getElementById('debug-log-panel')
                  if (logEl) logEl.classList.toggle('hidden')
                }}
                className="text-xs px-2 py-1 rounded border border-[#334155] text-[#64748b] hover:text-[#94a3b8]"
              >
                📋 ログ ({debugLog.length})
              </button>
            )}
            {ocrDebugUrl && (
              <button
                type="button"
                onClick={() => setShowDebug(v => !v)}
                className="text-xs px-2 py-1 rounded border border-[#334155] text-[#64748b] hover:text-[#94a3b8]"
              >
                🔍 {showDebug ? 'デバッグ非表示' : 'デバッグ表示'}
              </button>
            )}
          </div>

          {/* デバッグログパネル */}
          {debugLog.length > 0 && (
            <div id="debug-log-panel" className="hidden mt-2 p-3 rounded-lg border border-yellow-600/40 bg-yellow-900/10 max-h-60 overflow-y-auto">
              <p className="text-xs text-yellow-400 font-bold mb-2">📋 処理ログ（最後のステップでエラーが発生）</p>
              <div className="text-xs font-mono text-yellow-200/80 space-y-0.5">
                {debugLog.map((log, i) => (
                  <div key={i} className={i === debugLog.length - 1 && ocrState === 'error' ? 'text-red-400 font-bold' : ''}>
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* デバッグ画像: マーカー検出位置 + グリッドオーバーレイ */}
          {ocrDebugUrl && showDebug && (
            <div className="mt-2 p-2 rounded-lg border border-[#1e3a5f] bg-[#0a1628]">
              <p className="text-xs text-[#64748b] mb-1">
                🔍 デバッグ表示 — 赤:TL 青:TR 緑:BL 黄:BR ／ 緑枠:セル範囲
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ocrDebugUrl} alt="debug" className="w-full rounded" />
            </div>
          )}

          {/* OCRセル詳細デバッグ: 切り出し画像 + Claude生回答 + 組立結果 */}
          {ocrDebugEntries.length > 0 && (
            <div className="mt-2">
              <div className="flex items-center gap-2 mb-1">
                <button
                  type="button"
                  onClick={() => setShowOcrDetail(v => !v)}
                  className="text-xs px-2 py-1 rounded border border-[#334155] text-[#64748b] hover:text-[#94a3b8]"
                >
                  🔬 {showOcrDetail ? 'セル詳細を閉じる' : `セル詳細 (${ocrDebugEntries.length}件)`}
                </button>
                <button
                  type="button"
                  onClick={() => downloadOcrDebug(ocrDebugEntries)}
                  className="text-xs px-2 py-1 rounded border border-[#334155] text-[#64748b] hover:text-[#22c55e] hover:border-[#22c55e]/40"
                >
                  💾 HTMLで保存
                </button>
                <span className="text-[10px] text-[#475569]">
                  🟢=バブル塗りあり 🔴=未塗り ／ 組立(空)=コードなし
                </span>
              </div>

              {showOcrDetail && (
                <div className="overflow-x-auto rounded-lg border border-[#1e3a5f] bg-[#0a1628]">
                  <table className="text-[10px] border-collapse min-w-max">
                    <thead>
                      <tr className="border-b border-[#1e3a5f]">
                        {['打順','回','全体','一コード','一打点','一結果','二コード','二打点','二結果','組立'].map(h => (
                          <th key={h} className="px-2 py-1 text-[#475569] font-normal whitespace-nowrap border-r border-[#1e3a5f] last:border-r-0">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ocrDebugEntries.map(e => (
                        <tr key={`${e.order}-${e.inning}`} className="border-b border-[#0d1b2a] hover:bg-[#1e3a5f]/20">
                          <td className="px-2 py-1 text-center text-[#94a3b8] border-r border-[#1e3a5f]">{e.order}</td>
                          <td className="px-2 py-1 text-center text-[#94a3b8] border-r border-[#1e3a5f]">{e.inning}</td>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <td className="px-1 py-0.5 border-r border-[#1e3a5f]"><img src={e.image} alt="" style={{height:36,display:'block'}} /></td>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <td className="px-1 py-0.5 border-r border-[#1e3a5f]"><img src={e.ab1img} alt="" style={{height:18,display:'block'}} /></td>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <td className="px-1 py-0.5 border-r border-[#1e3a5f]"><img src={e.ab1rbiImg} alt="" style={{height:18,display:'block'}} /></td>
                          <td className={`px-2 py-1 text-center font-mono font-bold border-r border-[#1e3a5f] text-[10px] ${e.ab1code ? 'text-[#22c55e]' : 'text-[#334155]'}`}>
                            {e.ab1code ?? '─'}{e.ab1rbi ? <span className="text-[#fbbf24]">{e.ab1rbi}</span> : ''}{e.ab1stolen ? <span className="text-[#a78bfa]">s</span> : ''}
                          </td>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <td className="px-1 py-0.5 border-r border-[#1e3a5f]"><img src={e.ab2img} alt="" style={{height:18,display:'block'}} /></td>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <td className="px-1 py-0.5 border-r border-[#1e3a5f]"><img src={e.ab2rbiImg} alt="" style={{height:18,display:'block'}} /></td>
                          <td className={`px-2 py-1 text-center font-mono font-bold border-r border-[#1e3a5f] text-[10px] ${e.ab2code ? 'text-[#22c55e]' : 'text-[#334155]'}`}>
                            {e.ab2code ?? '─'}{e.ab2rbi ? <span className="text-[#fbbf24]">{e.ab2rbi}</span> : ''}{e.ab2stolen ? <span className="text-[#a78bfa]">s</span> : ''}
                          </td>
                          <td className="px-2 py-1 text-center text-[11px]">
                            {e.aiAssembled
                              ? <><span className="text-[#60a5fa] text-[9px]">[AI]</span> <span className="font-bold text-[#22c55e]">{e.aiAssembled}</span></>
                              : e.assembled
                                ? <><span className="text-[#94a3b8] text-[9px]">[泡]</span> <span className="font-bold text-[#a78bfa]">{e.assembled}</span></>
                                : <span className="text-red-400">(空)</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-1">
            <span className="text-xs text-[#64748b]">イニング数:</span>
            {INNINGS_OPTIONS.map(n => (
              <button key={n} type="button" onClick={() => setInnings(n)}
                className={`px-2 py-0.5 text-xs rounded border transition-all ${
                  innings === n
                    ? 'bg-[#2563eb] border-[#2563eb] text-white'
                    : 'border-[#1e3a5f] text-[#64748b] hover:border-[#2563eb]/50'
                }`}>{n}</button>
            ))}
            <input
              type="number" min={1} max={15} value={innings}
              onChange={e => setInnings(Math.max(1, Math.min(15, parseInt(e.target.value) || 7)))}
              className="w-12 text-center py-0.5 text-xs"
              title="カスタム"
            />
            <span className="text-xs text-[#475569]">回</span>
          </div>
        </div>

        <p className="text-[10px] text-[#475569] mb-1 sm:hidden">← 横にスクロールして全イニングを確認</p>
        <div className="overflow-x-auto">
          <table className="text-xs min-w-max border-collapse">
            <thead>
              <tr className="border-b border-[#1e3a5f]">
                <th className="text-left py-1.5 px-2 text-[#64748b] w-16 font-normal">#</th>
                <th className="text-left py-1.5 px-2 text-[#64748b] w-28 font-normal">選手</th>
                <th className="text-center py-1.5 px-0.5 text-[#64748b] w-12 font-normal" title="前半守備">前守</th>
                <th className="text-center py-1.5 px-0.5 text-[#64748b] w-12 font-normal" title="後半守備">後守</th>
                {Array.from({ length: innings }, (_, i) => (
                  <th key={i + 1} className="text-center py-1.5 px-0.5 text-[#64748b] font-normal"
                    style={{ width: '76px', borderLeft: '1px solid #1e3a5f' }}>
                    {i + 1}
                  </th>
                ))}
                {STAT_COLS.map(c => (
                  <th key={c.key} className={`text-center py-1.5 px-0.5 w-9 font-normal ${c.color}`}
                    style={c.key === 'pa' ? { borderLeft: '1px solid #1e3a5f' } : {}}>
                    {c.label}
                  </th>
                ))}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {batters.map((b, bIdx) => {
                const stats = statsMap[bIdx]
                // 最初の交代回（交代以降は元選手セルをディム）
                const firstSubInning = b.subs?.length
                  ? Math.min(...b.subs.map(s => s.fromInning))
                  : null

                // イニングセル（左=打撃コード、右=打点）をレンダリングするインライン関数
                const innCell = (
                  inning: number,
                  raw: string,
                  setRaw: (v: string) => void,
                  dimmed?: boolean,
                ) => {
                  const ci  = raw.indexOf(',')
                  const has2 = ci >= 0
                  const ab1 = has2 ? raw.slice(0, ci) : raw
                  const ab2 = has2 ? raw.slice(ci + 1) : ''
                  const { left: l1, right: r1 } = splitCode(ab1)
                  const { left: l2, right: r2 } = splitCode(ab2)
                  const cellBorder: React.CSSProperties = { borderLeft: '1px solid #1e3a5f' }
                  if (dimmed) {
                    return (
                      <td key={inning} className="py-0 px-0 align-top" style={{ ...cellBorder, background: '#060c12' }}>
                        <div style={{ minHeight: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span className="text-[#0d1b2a] select-none">×</span>
                        </div>
                      </td>
                    )
                  }
                  return (
                    <td key={inning} className="py-0 px-0 align-top group" style={cellBorder}>
                      {/* 1打席目 */}
                      <div className="flex items-stretch" style={{ minHeight: '26px' }}>
                        <input type="text" value={l1}
                          onChange={e => {
                            const newAb1 = mergeCode(e.target.value, r1)
                            const second = mergeCode(l2, r2)
                            setRaw(second ? `${newAb1},${second}` : newAb1)
                          }}
                          maxLength={3} placeholder="─"
                          className={`flex-1 min-w-0 text-center py-px text-xs font-mono uppercase bg-transparent focus:outline-none focus:bg-[#0d1b2a]/50 ${l1 && !parseCode(mergeCode(l1,r1)) ? '!text-red-400' : cellColor(l1)}`}
                        />
                        <div className="self-stretch" style={{ width: '1px', background: '#1e3a5f' }} />
                        <input type="text" value={r1}
                          onChange={e => {
                            const newAb1 = mergeCode(l1, e.target.value.replace(/\D/g,''))
                            const second = mergeCode(l2, r2)
                            setRaw(second ? `${newAb1},${second}` : newAb1)
                          }}
                          maxLength={1} placeholder="" title="打点"
                          style={{
                            width: '28px', flexShrink: 0,
                            textAlign: 'center', padding: '1px 0',
                            fontSize: '13px', fontWeight: 400,
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                            color:           r1 ? '#fbbf24' : 'rgba(251,191,36,0.2)',
                            backgroundColor: 'transparent',
                            border: 'none', outline: 'none',
                          }} />
                      </div>
                      {/* 点線区切り */}
                      <div style={{ borderTop: '1px dashed #1e3a5f' }} />
                      {/* 2打席目（常に表示） */}
                      <div className="flex items-stretch" style={{ minHeight: '26px' }}>
                        <input type="text" value={l2}
                          onChange={e => {
                            const second = mergeCode(e.target.value, r2)
                            setRaw(second ? `${ab1},${second}` : ab1)
                          }}
                          maxLength={3} placeholder="─"
                          className={`flex-1 min-w-0 text-center py-px text-xs font-mono uppercase bg-transparent focus:outline-none focus:bg-[#0d1b2a]/50 ${l2 && !parseCode(mergeCode(l2,r2)) ? '!text-red-400' : cellColor(l2)}`}
                        />
                        <div className="self-stretch" style={{ width: '1px', background: '#1e3a5f' }} />
                        {/* 打点: l2（打撃コード）が未入力のときは disabled。
                            mergeCode('', digit)='') のためコード無しでは保存できない。 */}
                        <input type="text" value={r2}
                          disabled={!l2}
                          onChange={e => {
                            const second = mergeCode(l2, e.target.value.replace(/\D/g,''))
                            setRaw(second ? `${ab1},${second}` : ab1)
                          }}
                          maxLength={1} placeholder="" title={l2 ? '打点' : 'コードを先に入力'}
                          style={{
                            width: '28px', flexShrink: 0,
                            textAlign: 'center', padding: '1px 0',
                            fontSize: '13px', fontWeight: 400,
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                            color:           r2 ? '#fbbf24' : 'rgba(251,191,36,0.2)',
                            backgroundColor: 'transparent',
                            border: 'none', outline: 'none',
                            opacity: l2 ? 1 : 0.25,
                            cursor:  l2 ? 'text' : 'default',
                          }} />
                      </div>
                    </td>
                  )
                }

                return (
                  <Fragment key={bIdx}>
                    {/* ── 打者行 ── */}
                    {/* border-collapse テーブルでは <tr> の border-t は <td> の border:0 に負けて消える。
                        [&>td]: で直接 <td> に borderTop を適用する。 */}
                    <tr className={`border-b border-[#0d1b2a] hover:bg-[#0d1b2a]/40 transition-colors${bIdx > 0 ? ' [&>td]:border-t [&>td]:border-t-[#334155]' : ''}`}>
                      <td className="py-0.5 px-1 align-middle text-center">
                        <span className="text-[#475569] text-xs">{b.order}</span>
                        <button type="button" onClick={() => addSub(bIdx)}
                          className="block mx-auto mt-0.5 text-[8px] leading-none text-[#a78bfa]/40 hover:text-[#a78bfa] active:text-[#a78bfa] transition-colors"
                          title="代打・代走・守備交代を追加">↳交代</button>
                      </td>

                      <td className="py-0.5 px-1 align-middle">
                        <select value={b.userId} onChange={e => setBatterPlayer(bIdx, e.target.value)}
                          className="w-28 py-0.5 text-xs max-w-[112px]">
                          <option value="">─ 未選択 ─</option>
                          {players.map(p => <option key={p.id} value={p.id}>{playerLabel(p)}</option>)}
                        </select>
                      </td>

                      <td className="py-0.5 px-0.5 align-middle">
                        <select value={b.position ?? ''} onChange={e => setBatterPosition(bIdx, e.target.value)}
                          className="w-12 py-0.5 text-xs text-center">
                          {POSITIONS.map(pos => <option key={pos} value={pos}>{pos || '─'}</option>)}
                        </select>
                      </td>
                      <td className="py-0.5 px-0.5 align-middle">
                        <select value={b.position2 ?? ''} onChange={e => setBatterPosition2(bIdx, e.target.value)}
                          className="w-12 py-0.5 text-xs text-center text-[#94a3b8]">
                          {POSITIONS.map(pos => <option key={pos} value={pos}>{pos || '─'}</option>)}
                        </select>
                      </td>

                      {Array.from({ length: innings }, (_, i) => {
                        const inning = i + 1
                        return innCell(inning, b.cells[inning] ?? '', v => setCell(bIdx, inning, v),
                          firstSubInning !== null && inning >= firstSubInning)
                      })}

                      {STAT_COLS.map(c => (
                        <td key={c.key}
                          className={`py-0.5 px-1 text-center tabular-nums align-middle ${c.color}`}
                          style={c.key === 'pa' ? { borderLeft: '1px solid #1e3a5f' } : {}}>
                          {stats[c.key] > 0 ? stats[c.key] : <span className="text-[#1e3a5f]">─</span>}
                        </td>
                      ))}

                      <td className="py-0.5 px-1 text-center align-middle">
                        <button type="button" onClick={() => addSub(bIdx)}
                          className="text-[9px] px-1.5 py-0.5 rounded border border-[#a78bfa]/30 text-[#a78bfa] hover:bg-[#7c3aed]/10 transition-all leading-none"
                          title="交代選手を追加">交代</button>
                      </td>
                    </tr>

                    {/* ── 交代行 ── */}
                    {(b.subs ?? []).map((sub, sIdx) => {
                      // 交代後のイニングは b.cells（元選手セル）を流用して集計
                      const subStats = calcBatterStats(
                        Object.fromEntries(
                          Object.entries(b.cells).filter(([k]) => parseInt(k) >= sub.fromInning)
                        ) as Record<number, string>
                      )
                      return (
                      <tr key={`sub-${sIdx}`} className="border-b border-[#0d1b2a]/50 bg-[#1a1040]/30">
                        {/* # セル：↳ マークのみ */}
                        <td className="py-0.5 px-1 text-center align-middle text-[#a78bfa] text-sm">↳</td>

                        {/* 選手名セル：fromInning + 選手ドロップダウン */}
                        <td className="py-0.5 px-1 align-middle">
                          <div className="flex items-center gap-1 mb-0.5">
                            <select
                              value={sub.fromInning}
                              onChange={e => setSubFromInning(bIdx, sIdx, parseInt(e.target.value))}
                              className="w-14 py-0.5 text-sm font-bold text-center text-[#a78bfa] border-b-2 border-[#a78bfa] bg-[#0d1b2a] focus:outline-none"
                            >
                              {Array.from({ length: innings }, (_, i) => i + 1).map(n => (
                                <option key={n} value={n}>{n}回</option>
                              ))}
                            </select>
                            <span className="text-xs text-[#a78bfa]">から</span>
                          </div>
                          <select value={sub.userId} onChange={e => setSubPlayer(bIdx, sIdx, e.target.value)}
                            className="w-28 py-0.5 text-xs max-w-[112px]">
                            <option value="">─ 交代選手 ─</option>
                            {players.map(p => <option key={p.id} value={p.id}>{playerLabel(p)}</option>)}
                          </select>
                        </td>

                        {/* 前守: 空（交代前は出場していない） */}
                        <td className="py-0.5 px-0.5 align-middle">
                          <span className="text-[#1e3a5f] text-xs block text-center w-9">─</span>
                        </td>
                        {/* 後守: 交代後の守備位置 */}
                        <td className="py-0.5 px-0.5 align-middle">
                          <select value={sub.position ?? ''} onChange={e => setSubPosition(bIdx, sIdx, e.target.value)}
                            className="w-12 py-0.5 text-xs text-center">
                            {POSITIONS.map(pos => <option key={pos} value={pos}>{pos || '─'}</option>)}
                          </select>
                        </td>

                        {Array.from({ length: innings }, (_, i) => {
                          const inning = i + 1
                          // fromInning 以降は元選手の b.cells を共有して読み書き
                          const isActive = inning >= sub.fromInning
                          return innCell(
                            inning,
                            isActive ? (b.cells[inning] ?? '') : '',
                            isActive
                              ? v => setCell(bIdx, inning, v)
                              : v => setSubCell(bIdx, sIdx, inning, v),
                            !isActive,
                          )
                        })}

                        {STAT_COLS.map(c => (
                          <td key={c.key}
                            className={`py-0.5 px-1 text-center tabular-nums align-middle ${c.color}`}
                            style={c.key === 'pa' ? { borderLeft: '1px solid #1e3a5f' } : {}}>
                            {subStats[c.key] > 0 ? subStats[c.key] : <span className="text-[#1e3a5f]">─</span>}
                          </td>
                        ))}

                        <td className="py-0.5 px-1 text-center align-middle">
                          <button type="button" onClick={() => removeSub(bIdx, sIdx)}
                            className="text-[#475569] hover:text-red-400 transition-colors text-xs" title="交代を削除">✕</button>
                        </td>
                      </tr>
                    )})}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex gap-2 mt-2">
          <button type="button" onClick={addBatter}
            className="text-xs px-2.5 py-1 rounded border border-[#1e3a5f] text-[#64748b] hover:text-[#94a3b8] hover:border-[#64748b]/50 transition-all">
            ＋ 打者追加
          </button>
          {batters.length > 1 && (
            <button type="button" onClick={removeLastBatter}
              className="text-xs px-2.5 py-1 rounded border border-[#1e3a5f] text-[#64748b] hover:text-[#94a3b8] hover:border-[#64748b]/50 transition-all">
              − 最終行削除
            </button>
          )}
        </div>

        {/* legend */}
        <div className="mt-3 p-3 rounded-lg bg-[#0d1b2a]/60 border border-[#1e3a5f] space-y-2.5">
          {/* 打撃コード */}
          <div>
            <p className="text-[10px] text-[#64748b] font-medium mb-1">
              打撃コード ─ 各セル左側に結果、右側（<span className="text-[#fbbf24]">黄</span>）に打点数字
            </p>
            <div className="text-[10px] text-[#475569] leading-[1.8] space-y-0.5">
              <div className="flex flex-wrap gap-x-3">
                <span><span className="text-[#94a3b8] font-mono">O</span>=アウト</span>
                <span><span className="text-[#22c55e] font-mono">1</span>=単打</span>
                <span><span className="text-[#22c55e] font-mono">2</span>=二塁打</span>
                <span><span className="text-[#22c55e] font-mono">3</span>=三塁打</span>
                <span><span className="text-[#22c55e] font-mono">4</span>=本塁打</span>
                <span><span className="text-[#60a5fa] font-mono">B</span>=四球</span>
                <span><span className="text-[#60a5fa] font-mono">D</span>=死球</span>
                <span><span className="text-[#fbbf24] font-mono">S</span>=犠打</span>
                <span><span className="text-[#fbbf24] font-mono">X</span>=犠飛</span>
              </div>
              <div>
                盗塁: 左コード末尾に小文字 <span className="text-[#a78bfa] font-mono">s</span>　例:
                左<span className="text-[#22c55e] font-mono">1s</span>右<span className="text-[#fbbf24] font-mono">2</span>=単打2打点盗塁
                左<span className="text-[#94a3b8] font-mono">O</span>右空欄=アウト
              </div>
            </div>
          </div>

          {/* 2打席目（打順が2巡するとき） */}
          <div className="border-t border-[#1e3a5f] pt-2">
            <p className="text-[10px] text-[#64748b] font-medium mb-1">2打席目（同イニングで打順が2巡したとき）</p>
            <div className="text-[10px] text-[#475569] leading-[1.8]">
              各セルは点線で上下2段に分かれています。上段＝1打席目、下段＝2打席目。<br/>
              例: 1打席目<span className="font-mono text-[#94a3b8]">O</span>・2打席目<span className="font-mono text-[#22c55e]">1</span> → 上段に「O」、下段に「1」と入力
            </div>
          </div>

          {/* 途中出場・交代 */}
          <div className="border-t border-[#1e3a5f] pt-2">
            <p className="text-[10px] text-[#64748b] font-medium mb-1">途中出場・交代（代打／代走／守備交代）</p>
            <div className="text-[10px] text-[#475569] leading-[1.8] space-y-0.5">
              <div>
                各打順の行の <span className="text-[#a78bfa] font-mono">#</span> 欄にある
                <span className="text-[#a78bfa] font-mono"> ↳交代</span> または右端の
                <span className="text-[#a78bfa]">「交代」</span>ボタンをタップ
                → 何回から出場するか（回〜）と交代選手・守備位置を入力
              </div>
              <div>
                交代前の選手の打席欄は自動でグレーアウト。交代後の回から新しい選手の入力欄が有効になります。
              </div>
              <div className="text-[#3d6080]">
                飛び入り参加など打順が増える場合は「＋打者追加」ボタンで新しい行を追加してください。
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ━━━━ PITCHER ━━━━ */}
      <div className="border-t border-[#1e3a5f] pt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-[#a78bfa] tracking-widest uppercase">投手成績</h3>
          <button type="button" onClick={addPitcher}
            className="text-xs px-2.5 py-1 rounded border border-[#7c3aed]/40 text-[#a78bfa] hover:bg-[#7c3aed]/10 transition-all">
            ＋ 投手追加
          </button>
        </div>

        {pitchers.length === 0 && (
          <p className="text-xs text-[#475569]">「＋投手追加」で登板した投手を記録してください。</p>
        )}

        {pitchers.map((p, pIdx) => (
          <div key={pIdx} className="mb-3 p-3 rounded-xl bg-[#0d1b2a]/50 border border-[#1e3a5f]">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
              {/* 選手 */}
              <select value={p.userId} onChange={e => setPitcherField(pIdx, 'userId', e.target.value)}
                className="w-36 py-0.5 text-xs">
                <option value="">─ 選手選択 ─</option>
                {players.map(pl => <option key={pl.id} value={pl.id}>{playerLabel(pl)}</option>)}
              </select>

              {/* 勝敗 */}
              <select value={p.decision} onChange={e => setPitcherField(pIdx, 'decision', e.target.value)}
                className="w-16 py-0.5 text-xs">
                {DECISIONS.map(d => <option key={d} value={d}>{d || '─勝敗─'}</option>)}
              </select>

              {/* 投球回 */}
              <label className="flex items-center gap-1 text-[#64748b]">
                投球回
                <input type="text" value={p.innings}
                  onChange={e => setPitcherField(pIdx, 'innings', e.target.value)}
                  placeholder="5" className="w-14 text-center py-0.5 text-xs" />
              </label>

              {/* 投球数 */}
              <label className="flex items-center gap-1 text-[#64748b]">
                投球数
                <input type="number" value={p.pitches ?? 0} min={0}
                  onChange={e => setPitcherField(pIdx, 'pitches', parseInt(e.target.value) || 0)}
                  className="w-12 text-center py-0.5 text-xs" />
              </label>

              {/* 失点 */}
              <label className="flex items-center gap-1 text-[#64748b]">
                失点
                <input type="number" value={p.runs} min={0}
                  onChange={e => setPitcherField(pIdx, 'runs', parseInt(e.target.value) || 0)}
                  className="w-10 text-center py-0.5 text-xs" />
              </label>

              {/* 自責点 */}
              <label className="flex items-center gap-1 text-[#64748b]">
                自責
                <input type="number" value={p.earnedRuns ?? p.runs} min={0}
                  onChange={e => setPitcherField(pIdx, 'earnedRuns', parseInt(e.target.value) || 0)}
                  className="w-10 text-center py-0.5 text-xs" />
              </label>

              {/* 被安打 */}
              <label className="flex items-center gap-1 text-[#64748b]">
                被安打
                <input type="number" value={p.hitsAllowed ?? 0} min={0}
                  onChange={e => setPitcherField(pIdx, 'hitsAllowed', parseInt(e.target.value) || 0)}
                  className="w-10 text-center py-0.5 text-xs" />
              </label>

              {/* 与四球 */}
              <label className="flex items-center gap-1 text-[#64748b]">
                四球
                <input type="number" value={p.walks ?? 0} min={0}
                  onChange={e => setPitcherField(pIdx, 'walks', parseInt(e.target.value) || 0)}
                  className="w-10 text-center py-0.5 text-xs" />
              </label>

              {/* 奪三振 */}
              <label className="flex items-center gap-1 text-[#64748b]">
                三振
                <input type="number" value={p.strikeouts ?? 0} min={0}
                  onChange={e => setPitcherField(pIdx, 'strikeouts', parseInt(e.target.value) || 0)}
                  className="w-10 text-center py-0.5 text-xs" />
              </label>

              <button type="button" onClick={() => removePitcher(pIdx)}
                className="text-[#475569] hover:text-red-400 transition-colors text-sm ml-auto">
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ━━━━ SAVE ━━━━ */}
      <div className="border-t border-[#1e3a5f] pt-4 flex flex-col gap-3">
        <div className="text-xs text-[#475569] bg-[#0d1b2a]/40 rounded-lg px-3 py-2 leading-relaxed">
          💡 スコアブックを保存すると個人成績（打席・打数・安打・本塁打・打点・盗塁など）が自動反映されます
        </div>

        {lineConfigured && (
          <label className="flex items-center gap-2.5 cursor-pointer select-none w-full">
            <input
              type="checkbox"
              checked={sendLine}
              onChange={e => setSendLine(e.target.checked)}
              style={{ width: '1.125rem', height: '1.125rem', flexShrink: 0 }}
              className="cursor-pointer accent-[#22c55e]"
            />
            <span className="text-sm text-[#22c55e]">
              保存後にLINEに試合結果を送信する
            </span>
          </label>
        )}

        <button
          type="button" onClick={handleSave} disabled={isPending}
          className={`w-full text-sm px-4 py-3 rounded-xl border font-medium transition-all ${
            status === 'saved'
              ? 'bg-[#22c55e]/20 border-[#22c55e] text-[#22c55e]'
              : status === 'error'
              ? 'bg-red-900/20 border-red-500/40 text-red-400'
              : isPending
              ? 'border-[#2563eb]/20 text-[#60a5fa]/40 cursor-wait'
              : 'border-[#2563eb]/40 text-[#60a5fa] hover:bg-[#2563eb]/10'
          }`}
        >
          {isPending
            ? '⏳ 保存中...'
            : status === 'saved'
            ? '✅ 保存しました（個人成績に自動反映済み）'
            : status === 'error'
            ? '❌ エラーが発生しました'
            : '💾 試合結果を保存'}
        </button>
      </div>
    </div>
  )
}
