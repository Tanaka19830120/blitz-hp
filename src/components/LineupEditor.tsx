'use client'

import { useState, useTransition } from 'react'

type Player = { id: string; name: string; number: number | null }

// 打順に入る選手のポジション（DP = 打つだけ）
const POSITIONS = ['投', '捕', '一', '二', '三', '遊', '左', '中', '右', 'DP']

// FP（守るだけ）のポジション
const FIELD_POSITIONS = ['投', '捕', '一', '二', '三', '遊', '左', '中', '右']

// グリッド列定義: [打順番号] [選手名] [ポジション] [削除ボタン]
const ROW_COLS = '1.75rem 1fr 4.5rem 1.5rem'

interface OrderEntry {
  playerId: string
  position: string
}

interface Props {
  players: Player[]
  scheduleId: string
  initialEntries: OrderEntry[]   // 打順（DP含む）
  initialFpEntries: OrderEntry[] // FP（守備専任）
  initialNote: string            // 自由記述
  saveAction: (fd: FormData) => Promise<void>
}

export function LineupEditor({ players, scheduleId, initialEntries, initialFpEntries, initialNote, saveAction }: Props) {
  const [isPending, startTransition] = useTransition()

  const [entries, setEntries] = useState<OrderEntry[]>(() => {
    const len = Math.max(9, initialEntries.length)
    return Array.from({ length: len }, (_, i) => initialEntries[i] ?? { playerId: '', position: '' })
  })

  const [fpEntries, setFpEntries] = useState<OrderEntry[]>(initialFpEntries)
  const [note, setNote] = useState(initialNote)

  // 打順スロットの選手変更（重複時はスワップ or クリア）
  function changeEntryPlayer(idx: number, newId: string) {
    const nextEntries = entries.map(e => ({ ...e }))
    const displaced = nextEntries[idx].playerId         // 今のスロットにいた選手

    // 打順内で重複チェック → スワップ
    const conflictIdx = nextEntries.findIndex((e, i) => i !== idx && e.playerId === newId)
    if (conflictIdx !== -1) {
      nextEntries[conflictIdx].playerId = displaced     // 元いた場所に追い出し
    }
    nextEntries[idx].playerId = newId

    // FP欄に同じ選手がいればクリア
    const nextFp = fpEntries.map(e => e.playerId === newId ? { ...e, playerId: '' } : { ...e })

    setEntries(nextEntries)
    setFpEntries(nextFp)
  }

  // FP欄の選手変更（重複時はスワップ or クリア）
  function changeFpPlayer(idx: number, newId: string) {
    const nextFp = fpEntries.map(e => ({ ...e }))
    const displaced = nextFp[idx].playerId

    // FP内で重複チェック → スワップ
    const conflictIdx = nextFp.findIndex((e, i) => i !== idx && e.playerId === newId)
    if (conflictIdx !== -1) {
      nextFp[conflictIdx].playerId = displaced
    }
    nextFp[idx].playerId = newId

    // 打順欄に同じ選手がいればクリア
    const nextEntries = entries.map(e => e.playerId === newId ? { ...e, playerId: '' } : { ...e })

    setEntries(nextEntries)
    setFpEntries(nextFp)
  }

  function updateEntryPosition(idx: number, pos: string) {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, position: pos } : e))
  }
  function updateFpPosition(idx: number, pos: string) {
    setFpEntries(prev => prev.map((e, i) => i === idx ? { ...e, position: pos } : e))
  }

  function addSlot() { setEntries(prev => [...prev, { playerId: '', position: '' }]) }
  function removeSlot(idx: number) {
    if (entries.length <= 9) return
    setEntries(prev => prev.filter((_, i) => i !== idx))
  }
  function addFp() { setFpEntries(prev => [...prev, { playerId: '', position: '' }]) }
  function removeFp(idx: number) { setFpEntries(prev => prev.filter((_, i) => i !== idx)) }

  function save() {
    const fd = new FormData()
    fd.append('scheduleId', scheduleId)
    entries.forEach((entry, idx) => {
      if (!entry.playerId) return
      fd.append(`order_${entry.playerId}`, String(idx + 1))
      if (entry.position) fd.append(`pos_${entry.playerId}`, entry.position)
      if (entry.position === 'DP') fd.append(`dh_${entry.playerId}`, 'on')
    })
    fpEntries.forEach(entry => {
      if (!entry.playerId || !entry.position) return
      fd.append(`pos_${entry.playerId}`, entry.position)
    })
    fd.append('note', note)
    startTransition(() => { saveAction(fd) })
  }

  const selectCls   = 'w-full bg-[#0d1b2a] border border-[#1e3a5f] rounded-lg px-2 py-1.5 text-sm text-[#e2e8f0] focus:border-[#2563eb] outline-none'
  const selectFpCls = 'w-full bg-[#0d1b2a] border border-[#f59e0b]/30 rounded-lg px-2 py-1.5 text-sm text-[#e2e8f0] focus:border-[#f59e0b] outline-none'

  return (
    <div className="space-y-5">

      {/* ヘッダー + 凡例 */}
      <div className="flex items-baseline justify-between flex-wrap gap-1">
        <p className="text-xs font-bold text-[#60a5fa] tracking-widest uppercase">打順・ポジション</p>
        <p className="text-[11px] text-[#475569]">DP：打つだけ　／　FP：守るだけ</p>
      </div>

      {/* ── 打順リスト ── */}
      <div className="space-y-2">
        {entries.map((entry, idx) => (
          <div
            key={idx}
            style={{ display: 'grid', gridTemplateColumns: ROW_COLS, gap: '0.5rem', alignItems: 'center' }}
          >
            <span className="text-[#3b82f6] font-black text-sm text-right">{idx + 1}</span>

            <select
              value={entry.playerId}
              onChange={e => changeEntryPlayer(idx, e.target.value)}
              className={selectCls}
            >
              <option value="">── 選手を選択 ──</option>
              {players.map(p => (
                <option key={p.id} value={p.id}>
                  {p.number != null ? `#${p.number} ` : ''}{p.name}
                </option>
              ))}
            </select>

            <select
              value={entry.position}
              onChange={e => updateEntryPosition(idx, e.target.value)}
              className={selectCls}
            >
              <option value="">　</option>
              {POSITIONS.map(pos => <option key={pos} value={pos}>{pos}</option>)}
            </select>

            {idx >= 9
              ? <button type="button" onClick={() => removeSlot(idx)} className="text-[#64748b] hover:text-red-400 text-base leading-none text-center">×</button>
              : <div />
            }
          </div>
        ))}
      </div>

      {/* スロット追加 */}
      <button type="button" onClick={addSlot} className="text-xs text-[#3b82f6] hover:text-[#60a5fa] transition-colors">
        ＋ {entries.length + 1}番を追加
      </button>

      {/* ── FP（守備専任）セクション ── */}
      <div className="pt-3 border-t border-[#1e3a5f] space-y-2">
        <p className="text-xs font-bold text-[#f59e0b] tracking-widest uppercase flex items-baseline gap-2">
          FP
          <span className="text-[#475569] normal-case font-normal text-[11px]">守るだけ（打順なし）</span>
        </p>

        {fpEntries.map((entry, idx) => (
          <div
            key={idx}
            style={{ display: 'grid', gridTemplateColumns: ROW_COLS, gap: '0.5rem', alignItems: 'center' }}
          >
            <div />

            <select
              value={entry.playerId}
              onChange={e => changeFpPlayer(idx, e.target.value)}
              className={selectFpCls}
            >
              <option value="">── 選手を選択 ──</option>
              {players.map(p => (
                <option key={p.id} value={p.id}>
                  {p.number != null ? `#${p.number} ` : ''}{p.name}
                </option>
              ))}
            </select>

            <select
              value={entry.position}
              onChange={e => updateFpPosition(idx, e.target.value)}
              className={selectFpCls}
            >
              <option value="">　</option>
              {FIELD_POSITIONS.map(pos => <option key={pos} value={pos}>{pos}</option>)}
            </select>

            <button type="button" onClick={() => removeFp(idx)} className="text-[#64748b] hover:text-red-400 text-base leading-none text-center">×</button>
          </div>
        ))}

        <button type="button" onClick={addFp} className="text-xs text-[#f59e0b] hover:text-[#fbbf24] transition-colors">
          ＋ FP を追加
        </button>
      </div>

      {/* ── 自由記述欄 ── */}
      <div className="pt-3 border-t border-[#1e3a5f]">
        <label className="text-xs font-bold text-[#60a5fa] tracking-widest uppercase block mb-1.5">
          メモ・備考
          <span className="text-[#475569] normal-case font-normal ml-2">LINE配信にも反映されます</span>
        </label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="例: 雨天中止あり、審判当番あり、など"
          rows={3}
          className="w-full bg-[#0d1b2a] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:border-[#2563eb] outline-none resize-none placeholder:text-[#2d4a6e]"
        />
      </div>

      {/* 保存 */}
      <button type="button" onClick={save} disabled={isPending} className="btn-primary w-full py-2.5 mt-2">
        {isPending ? '保存中...' : 'スタメンを保存'}
      </button>
    </div>
  )
}
