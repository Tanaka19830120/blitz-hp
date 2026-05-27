'use client'

import { useState, useTransition, useRef } from 'react'
import type { ScoreBookData, BatterSlot, PitcherSlot, BatterStats } from '@/lib/scorebook'
import { calcBatterStats, parseCode, cellColor, ZERO_STATS } from '@/lib/scorebook'

interface OcrResult {
  ourScore:      number | null
  opponentScore: number | null
  batterCells:   Record<string, Record<string, string>>
}

interface PlayerOption {
  id:     string
  name:   string
  number: number | null
}

interface Props {
  players:        PlayerOption[]
  scheduleId:     string
  initialData:    ScoreBookData
  saveAction:     (scheduleId: string, json: string, sendLine: boolean) => Promise<void>
  lineConfigured: boolean
}

const INNINGS_OPTIONS = [5, 7, 9]
const DECISIONS = ['', '勝', '負', 'S', 'H'] as const

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
]

function playerLabel(p: PlayerOption): string {
  return (p.number != null ? `#${p.number} ` : '') + (p.name || '(未設定)')
}

export function ScoreBookEditor({ players, scheduleId, initialData, saveAction, lineConfigured }: Props) {
  /* ── スコア ── */
  const [ourScore,      setOurScore]      = useState<string>(
    initialData.ourScore != null ? String(initialData.ourScore) : ''
  )
  const [opponentScore, setOpponentScore] = useState<string>(
    initialData.opponentScore != null ? String(initialData.opponentScore) : ''
  )
  const [note, setNote] = useState<string>(initialData.note ?? '')
  const [sendLine, setSendLine] = useState(false)

  /* ── スコアブック ── */
  const [innings,  setInnings]  = useState<number>(initialData.innings)
  const [batters,  setBatters]  = useState<BatterSlot[]>(initialData.batters)
  const [pitchers, setPitchers] = useState<PitcherSlot[]>(initialData.pitchers)

  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  // ── OCR import ──
  const ocrInputRef = useRef<HTMLInputElement>(null)
  const [ocrState, setOcrState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [ocrMessage, setOcrMessage] = useState('')

  async function handleOcrImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so same file can be re-selected
    e.target.value = ''

    setOcrState('loading')
    setOcrMessage('')
    try {
      const fd = new FormData()
      fd.append('image',   file)
      fd.append('innings', String(innings))

      const res  = await fetch('/api/ocr-scorebook', { method: 'POST', body: fd })
      const json = await res.json()

      if (!res.ok || json.error) {
        setOcrState('error')
        setOcrMessage(json.error ?? 'OCR に失敗しました')
        return
      }

      const result: OcrResult = json.data
      // Apply extracted scores
      if (result.ourScore      != null) setOurScore(String(result.ourScore))
      if (result.opponentScore != null) setOpponentScore(String(result.opponentScore))
      // Apply extracted cell codes (by batting order)
      setBatters(prev => prev.map(b => {
        const orderKey  = String(b.order)
        const extracted = result.batterCells?.[orderKey]
        if (!extracted || Object.keys(extracted).length === 0) return b
        return { ...b, cells: { ...b.cells, ...Object.fromEntries(
          Object.entries(extracted)
            .filter(([, v]) => v && v !== '?')
            .map(([k, v]) => [k, v.toUpperCase()])
        ) } }
      }))

      const cellCount = Object.values(result.batterCells ?? {})
        .reduce((n, row) => n + Object.keys(row).length, 0)
      setOcrState('done')
      setOcrMessage(`✅ ${cellCount} セルを読み込みました。内容を確認して保存してください。`)
      setTimeout(() => setOcrState('idle'), 6000)
    } catch {
      setOcrState('error')
      setOcrMessage('通信エラーが発生しました')
    }
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
    setBatters(prev => [...prev, { order: prev.length + 1, userId: '', cells: {} }])
  }

  function removeLastBatter() {
    setBatters(prev => prev.length > 1 ? prev.slice(0, -1) : prev)
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
  function handleSave() {
    const data: ScoreBookData = {
      innings,
      batters,
      pitchers,
      ourScore:      ourScore !== '' ? parseInt(ourScore) : null,
      opponentScore: opponentScore !== '' ? parseInt(opponentScore) : null,
      note,
    }
    startTransition(async () => {
      try {
        await saveAction(scheduleId, JSON.stringify(data), sendLine)
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 3500)
      } catch {
        setStatus('error')
        setTimeout(() => setStatus('idle'), 3500)
      }
    })
  }

  /* ── live stats ── */
  const statsMap = batters.map(b => calcBatterStats(b.cells))

  return (
    <div className="flex flex-col gap-6">

      {/* ━━━━ SCORE ━━━━ */}
      <div>
        <h3 className="text-xs font-bold text-[#94a3b8] tracking-widest uppercase mb-3">スコア</h3>
        <div className="flex flex-wrap items-end gap-4">
          <div style={{ width: '8rem' }}>
            <label className="block text-xs text-[#64748b] mb-1">BLITZ 得点</label>
            <input
              type="number" min="0" value={ourScore}
              onChange={e => setOurScore(e.target.value)}
              placeholder="0"
              style={{ width: '100%' }}
              className="text-2xl font-black text-center"
            />
          </div>
          <div className="text-2xl font-black text-[#475569] pb-1">ー</div>
          <div style={{ width: '8rem' }}>
            <label className="block text-xs text-[#64748b] mb-1">相手 得点</label>
            <input
              type="number" min="0" value={opponentScore}
              onChange={e => setOpponentScore(e.target.value)}
              placeholder="0"
              style={{ width: '100%' }}
              className="text-2xl font-black text-center"
            />
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
              capture="environment"
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
              title="記入済みスコアシートの写真を撮影してAIが自動入力します"
            >
              {ocrState === 'loading' ? '⏳ 読み取り中…' : '📷 シートから読み込み'}
            </button>
            {ocrMessage && (
              <span className={`text-xs ${ocrState === 'error' ? 'text-red-400' : 'text-[#94a3b8]'}`}>
                {ocrMessage}
              </span>
            )}
          </div>

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
                <th className="text-left py-1.5 px-2 text-[#64748b] w-7 font-normal">#</th>
                <th className="text-left py-1.5 px-2 text-[#64748b] w-36 font-normal">選手</th>
                {Array.from({ length: innings }, (_, i) => (
                  <th key={i + 1} className="text-center py-1.5 px-0.5 text-[#64748b] w-11 font-normal">
                    {i + 1}
                  </th>
                ))}
                {STAT_COLS.map(c => (
                  <th key={c.key} className={`text-center py-1.5 px-0.5 w-9 font-normal ${c.color}`}
                    style={c.key === 'pa' ? { borderLeft: '1px solid #1e3a5f' } : {}}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batters.map((b, bIdx) => {
                const stats = statsMap[bIdx]
                return (
                  <tr key={bIdx} className="border-b border-[#0d1b2a] hover:bg-[#0d1b2a]/40 transition-colors">
                    {/* batting order */}
                    <td className="py-0.5 px-2 text-[#475569]">{b.order}</td>

                    {/* player select */}
                    <td className="py-0.5 px-1">
                      <select
                        value={b.userId}
                        onChange={e => setBatterPlayer(bIdx, e.target.value)}
                        className="w-34 py-0.5 text-xs max-w-[136px]"
                      >
                        <option value="">─ 未選択 ─</option>
                        {players.map(p => (
                          <option key={p.id} value={p.id}>{playerLabel(p)}</option>
                        ))}
                      </select>
                    </td>

                    {/* inning cells — 二巡目対応 */}
                    {Array.from({ length: innings }, (_, i) => {
                      const inning   = i + 1
                      const raw      = b.cells[inning] ?? ''
                      const commaIdx = raw.indexOf(',')
                      const hasAb2   = commaIdx >= 0
                      const ab1      = hasAb2 ? raw.slice(0, commaIdx) : raw
                      const ab2      = hasAb2 ? raw.slice(commaIdx + 1) : ''

                      const valid1 = !ab1 || parseCode(ab1) !== null
                      const valid2 = !ab2 || parseCode(ab2) !== null

                      return (
                        <td key={inning} className="py-0.5 px-0.5 group align-top">
                          <div className="flex flex-col items-center gap-px">
                            {/* 1巡目 */}
                            <input
                              type="text"
                              value={ab1}
                              onChange={e => setCell(bIdx, inning,
                                hasAb2 ? `${e.target.value},${ab2}` : e.target.value
                              )}
                              maxLength={4}
                              placeholder="─"
                              className={`w-9 text-center py-0.5 text-xs font-mono uppercase ${
                                !valid1 ? 'border-red-500/60 !text-red-400' : cellColor(ab1)
                              }`}
                            />
                            {/* 2巡目 or 追加ボタン */}
                            {hasAb2 ? (
                              <div className="flex items-center gap-px">
                                <input
                                  type="text"
                                  value={ab2}
                                  onChange={e => setCell(bIdx, inning, `${ab1},${e.target.value}`)}
                                  maxLength={4}
                                  placeholder="─"
                                  className={`w-8 text-center py-0.5 text-xs font-mono uppercase ${
                                    !valid2 ? 'border-red-500/60 !text-red-400' : cellColor(ab2)
                                  }`}
                                />
                                <button
                                  type="button"
                                  onClick={() => setCell(bIdx, inning, ab1)}
                                  className="text-[8px] text-[#1e3a5f] hover:text-red-400 leading-none transition-colors"
                                  title="二巡目を削除"
                                >✕</button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setCell(bIdx, inning, ab1 + ',')}
                                className="w-9 text-center text-[9px] text-[#1e3a5f] group-hover:text-[#475569] py-px leading-none transition-colors"
                                title="二巡目を追加"
                              >╌╌</button>
                            )}
                          </div>
                        </td>
                      )
                    })}

                    {/* stat columns */}
                    {STAT_COLS.map(c => (
                      <td key={c.key}
                        className={`py-0.5 px-0.5 text-center tabular-nums align-middle ${c.color}`}
                        style={c.key === 'pa' ? { borderLeft: '1px solid #1e3a5f' } : {}}>
                        {stats[c.key] > 0
                          ? stats[c.key]
                          : <span className="text-[#1e3a5f]">─</span>}
                      </td>
                    ))}
                  </tr>
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
        <div className="mt-3 p-3 rounded-lg bg-[#0d1b2a]/60 border border-[#1e3a5f]">
          <p className="text-[10px] text-[#64748b] font-medium mb-1">入力コード</p>
          <div className="text-[10px] text-[#475569] leading-[1.6] space-y-0.5">
            <div>
              O=<span className="text-[#94a3b8]">アウト</span>
              <span className="text-[#22c55e]">1</span>=単打
              <span className="text-[#22c55e]">2</span>=二塁打
              <span className="text-[#22c55e]">3</span>=三塁打
              <span className="text-[#22c55e]">4</span>=本塁打
            </div>
            <div>
              <span className="text-[#60a5fa]">B</span>=四球
              <span className="text-[#60a5fa]">D</span>=死球
              <span className="text-[#fbbf24]">S</span>=犠打
              <span className="text-[#fbbf24]">X</span>=犠飛
            </div>
            <div className="text-[#64748b]">
              数字サフィックス=打点（例: <span className="text-[#22c55e]">12</span>=単打2打点）
              s=盗塁（例: <span className="text-[#22c55e]">1s</span>=単打盗塁　<span className="text-[#22c55e]">12s</span>=単打2打点盗塁）
            </div>
            <div className="text-[#64748b]">
              二巡目: イニングセルにカーソルを当て「╌╌」をクリック → 2段目入力欄が表示されます
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
