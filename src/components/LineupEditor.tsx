'use client'

import { useState, useTransition, useMemo } from 'react'

type Player = { id: string; name: string; number: number | null }

const POSITIONS       = ['投', '捕', '一', '二', '三', '遊', '左', '中', '右', 'DP']
const FIELD_POSITIONS = ['投', '捕', '一', '二', '三', '遊', '左', '中', '右']

// 打順1スロット（前半・後半）
interface HalfEntry { playerId: string; position: string }
interface OrderSlot { first: HalfEntry; second: HalfEntry }
interface FpSlot    { playerId: string; position: string }

export interface LineupData {
  slots:         OrderSlot[]
  fpSlots:       FpSlot[]
  umpireFirst:   string   // playerId
  umpireSecond:  string   // playerId
  note:          string
}

interface Props {
  players:            Player[]
  scheduleId:         string
  initialData:        LineupData
  saveAction:         (fd: FormData) => Promise<void>
}

const empty = (): HalfEntry => ({ playerId: '', position: '' })

// ─── ポジション重複チェック ────────────────────────────────────
function findDups(positions: string[]): Set<string> {
  const cnt = new Map<string, number>()
  for (const p of positions) if (p && p !== 'DP') cnt.set(p, (cnt.get(p) ?? 0) + 1)
  return new Set([...cnt.entries()].filter(([, c]) => c > 1).map(([p]) => p))
}

export function LineupEditor({ players, scheduleId, initialData, saveAction }: Props) {
  const [isPending, startTransition] = useTransition()

  const [slots, setSlots] = useState<OrderSlot[]>(() => {
    const len = Math.max(9, initialData.slots.length)
    return Array.from({ length: len }, (_, i) =>
      initialData.slots[i] ?? { first: empty(), second: empty() }
    )
  })
  const [fpSlots,      setFpSlots]      = useState<FpSlot[]>(initialData.fpSlots)
  const [umpireFirst,  setUmpireFirst]  = useState(initialData.umpireFirst)
  const [umpireSecond, setUmpireSecond] = useState(initialData.umpireSecond)
  const [note,         setNote]         = useState(initialData.note)

  // ─── ポジション重複検出 ──────────────────────────────────────
  const { firstConflicts, secondConflicts } = useMemo(() => {
    const firstPos  = [...slots.map(s => s.first.position),  ...fpSlots.map(f => f.position)]
    const secondPos = [...slots.map(s => s.second.playerId ? s.second.position : s.first.position),
                       ...fpSlots.map(f => f.position)]
    return { firstConflicts: findDups(firstPos), secondConflicts: findDups(secondPos) }
  }, [slots, fpSlots])

  const hasConflict = firstConflicts.size > 0 || secondConflicts.size > 0

  // ─── 前半選手変更（打順内でスワップ） ─────────────────────────
  function changeFirst(idx: number, newId: string) {
    const next = slots.map(s => ({ first: { ...s.first }, second: { ...s.second } }))
    const displaced = next[idx].first.playerId
    const ci = next.findIndex((s, i) => i !== idx && s.first.playerId === newId)
    if (ci !== -1) next[ci].first.playerId = displaced
    // 後半欄に同じ選手がいればクリア
    next.forEach((s, i) => { if (i !== idx && s.second.playerId === newId) s.second.playerId = '' })
    next[idx].first.playerId = newId
    const nextFp = fpSlots.map(f => f.playerId === newId ? { ...f, playerId: '' } : { ...f })
    setSlots(next); setFpSlots(nextFp)
  }

  // ─── 後半選手変更 ────────────────────────────────────────────
  function changeSecond(idx: number, newId: string) {
    const next = slots.map(s => ({ first: { ...s.first }, second: { ...s.second } }))
    const displaced = next[idx].second.playerId
    const ci = next.findIndex((s, i) => i !== idx && s.second.playerId === newId)
    if (ci !== -1) next[ci].second.playerId = displaced
    next.forEach((s, i) => { if (i !== idx && s.first.playerId === newId) s.first.playerId = '' })
    next[idx].second.playerId = newId
    const nextFp = fpSlots.map(f => f.playerId === newId ? { ...f, playerId: '' } : { ...f })
    setSlots(next); setFpSlots(nextFp)
  }

  function updateFirstPos(idx: number, pos: string) {
    setSlots(prev => prev.map((s, i) => i === idx ? { ...s, first: { ...s.first, position: pos } } : s))
  }
  function updateSecondPos(idx: number, pos: string) {
    setSlots(prev => prev.map((s, i) => i === idx ? { ...s, second: { ...s.second, position: pos } } : s))
  }

  function addSlot()       { setSlots(prev => [...prev, { first: empty(), second: empty() }]) }
  function removeSlot(idx: number) {
    if (slots.length <= 9) return
    setSlots(prev => prev.filter((_, i) => i !== idx))
  }

  // ─── FP ────────────────────────────────────────────────────
  function changeFpPlayer(idx: number, newId: string) {
    const next = fpSlots.map(f => ({ ...f }))
    const displaced = next[idx].playerId
    const ci = next.findIndex((f, i) => i !== idx && f.playerId === newId)
    if (ci !== -1) next[ci].playerId = displaced
    next[idx].playerId = newId
    const nextSlots = slots.map(s => ({
      first:  s.first.playerId  === newId ? { ...s.first,  playerId: '' } : { ...s.first },
      second: s.second.playerId === newId ? { ...s.second, playerId: '' } : { ...s.second },
    }))
    setFpSlots(next); setSlots(nextSlots)
  }
  function updateFpPos(idx: number, pos: string) {
    setFpSlots(prev => prev.map((f, i) => i === idx ? { ...f, position: pos } : f))
  }
  function addFp()              { setFpSlots(prev => [...prev, { playerId: '', position: '' }]) }
  function removeFp(idx: number){ setFpSlots(prev => prev.filter((_, i) => i !== idx)) }

  // ─── 保存 ───────────────────────────────────────────────────
  function save() {
    const data: LineupData = { slots, fpSlots, umpireFirst, umpireSecond, note }
    const fd = new FormData()
    fd.append('scheduleId', scheduleId)
    fd.append('lineupJson', JSON.stringify(data))
    startTransition(() => { saveAction(fd) })
  }

  // ─── スタイル ─────────────────────────────────────────────
  const sCls  = (conflict: boolean) =>
    `w-full bg-[#0d1b2a] border rounded-lg px-1.5 py-1.5 text-sm text-[#e2e8f0] focus:outline-none ${
      conflict ? 'border-[#ef4444] focus:border-[#ef4444]' : 'border-[#1e3a5f] focus:border-[#2563eb]'
    }`
  const sFpCls = (conflict: boolean) =>
    `w-full bg-[#0d1b2a] border rounded-lg px-1.5 py-1.5 text-sm text-[#e2e8f0] focus:outline-none ${
      conflict ? 'border-[#ef4444]' : 'border-[#f59e0b]/30 focus:border-[#f59e0b]'
    }`

  // グリッド列定義: [番] [前半選手] [前半POS] [後半選手] [後半POS] [削除]
  const ROW = '1.75rem 1fr 3.2rem 1fr 3.2rem 1.5rem'
  const HDR = '1.75rem 1fr 3.2rem 1fr 3.2rem 1.5rem'

  const playerOpts = (
    <>
      <option value="">──</option>
      {players.map(p => (
        <option key={p.id} value={p.id}>
          {p.number != null ? `#${p.number} ` : ''}{p.name}
        </option>
      ))}
    </>
  )

  return (
    <div className="space-y-4">

      {/* ヘッダー凡例 */}
      <div className="flex items-baseline justify-between flex-wrap gap-1">
        <p className="text-xs font-bold text-[#60a5fa] tracking-widest uppercase">打順・ポジション</p>
        <p className="text-[11px] text-[#475569]">DP：打つだけ　FP：守るだけ</p>
      </div>

      {/* 列ヘッダー */}
      <div style={{ display: 'grid', gridTemplateColumns: HDR, gap: '0.5rem', alignItems: 'center' }} className="px-0.5">
        <div />
        <div className="text-[10px] text-[#3b82f6] font-bold text-center tracking-wider">前半</div>
        <div />
        <div className="text-[10px] text-[#f59e0b] font-bold text-center tracking-wider">後半</div>
        <div />
        <div />
      </div>

      {/* ── 打順リスト ── */}
      <div className="space-y-1.5">
        {slots.map((slot, idx) => (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: ROW, gap: '0.4rem', alignItems: 'center' }}>

            {/* 番号 */}
            <span className="text-[#3b82f6] font-black text-sm text-right">{idx + 1}</span>

            {/* 前半選手 */}
            <select value={slot.first.playerId} onChange={e => changeFirst(idx, e.target.value)} className={sCls(false)}>
              {playerOpts}
            </select>

            {/* 前半POS */}
            <select value={slot.first.position} onChange={e => updateFirstPos(idx, e.target.value)}
              className={sCls(!!slot.first.position && firstConflicts.has(slot.first.position))}>
              <option value=""> </option>
              {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>

            {/* 後半選手 */}
            <select value={slot.second.playerId} onChange={e => changeSecond(idx, e.target.value)} className={sCls(false)}
              style={{ borderColor: slot.second.playerId ? '#f59e0b40' : undefined }}>
              <option value="">（前半と同じ）</option>
              {players.map(p => (
                <option key={p.id} value={p.id}>
                  {p.number != null ? `#${p.number} ` : ''}{p.name}
                </option>
              ))}
            </select>

            {/* 後半POS */}
            <select value={slot.second.position} onChange={e => updateSecondPos(idx, e.target.value)}
              className={sCls(!!slot.second.playerId && !!slot.second.position && secondConflicts.has(slot.second.position))}
              style={{ borderColor: slot.second.playerId ? '#f59e0b40' : undefined }}>
              <option value=""> </option>
              {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>

            {/* 削除 */}
            {idx >= 9
              ? <button type="button" onClick={() => removeSlot(idx)} className="text-[#64748b] hover:text-red-400 text-base leading-none text-center">×</button>
              : <div />}
          </div>
        ))}
      </div>

      <button type="button" onClick={addSlot} className="text-xs text-[#3b82f6] hover:text-[#60a5fa] transition-colors">
        ＋ {slots.length + 1}番を追加
      </button>

      {/* ── FP（守備専任）── */}
      <div className="pt-3 border-t border-[#1e3a5f] space-y-1.5">
        <p className="text-xs font-bold text-[#f59e0b] tracking-widest uppercase flex items-baseline gap-2">
          FP <span className="text-[#475569] normal-case font-normal text-[11px]">守るだけ（打順なし）</span>
        </p>
        {fpSlots.map((fp, idx) => (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: ROW, gap: '0.4rem', alignItems: 'center' }}>
            <div />
            <select value={fp.playerId} onChange={e => changeFpPlayer(idx, e.target.value)}
              className={`col-span-1 w-full bg-[#0d1b2a] border border-[#f59e0b]/30 rounded-lg px-1.5 py-1.5 text-sm text-[#e2e8f0] focus:border-[#f59e0b] outline-none`}>
              {playerOpts}
            </select>
            <select value={fp.position} onChange={e => updateFpPos(idx, e.target.value)}
              className={sFpCls(!!fp.position && firstConflicts.has(fp.position))}>
              <option value=""> </option>
              {FIELD_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <div /><div />
            <button type="button" onClick={() => removeFp(idx)} className="text-[#64748b] hover:text-red-400 text-base leading-none text-center">×</button>
          </div>
        ))}
        <button type="button" onClick={addFp} className="text-xs text-[#f59e0b] hover:text-[#fbbf24] transition-colors">
          ＋ FP を追加
        </button>
      </div>

      {/* ── 審判 ── */}
      <div className="pt-3 border-t border-[#1e3a5f]">
        <p className="text-xs font-bold text-[#a78bfa] tracking-widest uppercase mb-2">
          審判 <span className="text-[#475569] normal-case font-normal text-[11px] ml-1">担当者を選択</span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] text-[#3b82f6] font-bold mb-1">前半</label>
            <select value={umpireFirst} onChange={e => setUmpireFirst(e.target.value)}
              className="w-full bg-[#0d1b2a] border border-[#7c3aed]/30 rounded-lg px-2 py-1.5 text-sm text-[#e2e8f0] focus:border-[#a78bfa] outline-none">
              <option value="">──</option>
              {players.map(p => <option key={p.id} value={p.id}>{p.number != null ? `#${p.number} ` : ''}{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-[#f59e0b] font-bold mb-1">後半</label>
            <select value={umpireSecond} onChange={e => setUmpireSecond(e.target.value)}
              className="w-full bg-[#0d1b2a] border border-[#7c3aed]/30 rounded-lg px-2 py-1.5 text-sm text-[#e2e8f0] focus:border-[#a78bfa] outline-none">
              <option value="">──</option>
              {players.map(p => <option key={p.id} value={p.id}>{p.number != null ? `#${p.number} ` : ''}{p.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── メモ ── */}
      <div className="pt-3 border-t border-[#1e3a5f]">
        <label className="text-xs font-bold text-[#60a5fa] tracking-widest uppercase block mb-1.5">
          メモ・備考 <span className="text-[#475569] normal-case font-normal ml-1">LINE配信にも反映</span>
        </label>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
          placeholder="例: 雨天中止あり、審判当番あり、など"
          className="w-full bg-[#0d1b2a] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:border-[#2563eb] outline-none resize-none placeholder:text-[#2d4a6e]"
        />
      </div>

      {/* ポジション重複エラー */}
      {hasConflict && (
        <div className="rounded-xl border border-[#ef4444]/50 bg-[#ef4444]/5 px-4 py-2.5 text-sm text-[#ef4444]">
          ⚠ ポジションが重複しています。赤枠の箇所を確認してください。
        </div>
      )}

      {/* 保存ボタン */}
      <button type="button" onClick={save} disabled={isPending || hasConflict}
        className="btn-primary w-full py-2.5 mt-1 disabled:opacity-40 disabled:cursor-not-allowed">
        {isPending ? '保存中...' : hasConflict ? '⚠ ポジション重複あり（保存不可）' : 'スタメンを保存'}
      </button>
    </div>
  )
}
