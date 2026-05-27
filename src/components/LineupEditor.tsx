'use client'

import { useState, useTransition, useEffect, useRef } from 'react'

type Player = { id: string; name: string; number: number | null }

const POSITIONS       = ['投', '捕', '一', '二', '三', '遊', '左', '中', '右', 'DP']
const FIELD_POSITIONS = ['投', '捕', '一', '二', '三', '遊', '左', '中', '右']

// 助っ人：固定4枠
const GUEST_PLAYERS: Player[] = [
  { id: '__guest_1', name: '助っ人1', number: null },
  { id: '__guest_2', name: '助っ人2', number: null },
  { id: '__guest_3', name: '助っ人3', number: null },
  { id: '__guest_4', name: '助っ人4', number: null },
]

// 打順1スロット（前半・後半）
interface HalfEntry { playerId: string; position: string }
interface OrderSlot { first: HalfEntry; second: HalfEntry }
interface FpSlot    { playerId: string; position: string }

export interface UmpireSlot { playerId: string; half: string }

export interface LineupData {
  slots:    OrderSlot[]
  fpSlots:  FpSlot[]
  umpires:  UmpireSlot[]   // 最大4人
  bench:    string[]       // ベンチ入り選手 (playerId[])
  note:     string
}

interface Props {
  players:            Player[]
  scheduleId:         string
  initialData:        LineupData
  saveAction:         (fd: FormData) => Promise<void>
}

const empty = (): HalfEntry => ({ playerId: '', position: '' })

type SaveState = 'idle' | 'saving' | 'saved'

export function LineupEditor({ players, scheduleId, initialData, saveAction }: Props) {
  const [isPending, startTransition] = useTransition()
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const prevPendingRef = useRef(false)

  const [slots, setSlots] = useState<OrderSlot[]>(() => {
    const len = Math.max(9, initialData.slots.length)
    return Array.from({ length: len }, (_, i) =>
      initialData.slots[i] ?? { first: empty(), second: empty() }
    )
  })
  const [fpSlots,  setFpSlots]  = useState<FpSlot[]>(initialData.fpSlots)
  const [umpires,  setUmpires]  = useState<UmpireSlot[]>(initialData.umpires ?? [])
  const [bench,    setBench]    = useState<string[]>(initialData.bench ?? [])
  const [note,     setNote]     = useState(initialData.note)

  // ─── 助っ人自動備考 ──────────────────────────────────────────────
  // 現在いずれかのスロットで使われている助っ人名を「助っ人1,助っ人2」形式のキーに変換
  const usedGuestKey = [...new Set([
    ...slots.flatMap(s => [s.first.playerId, s.second.playerId]),
    ...fpSlots.map(f => f.playerId),
  ].filter(id => id.startsWith('__guest_')))]
    .sort()
    .map(id => GUEST_PLAYERS.find(g => g.id === id)?.name ?? '')
    .filter(Boolean)
    .join(',')

  useEffect(() => {
    const selectedNames = usedGuestKey.split(',').filter(Boolean)
    setNote(prev => {
      const lines = prev.split('\n')

      // 既存の「助っ人X：...」行と、それ以外の行を分離
      const existingGuestLines = new Map<string, string>()
      const otherLines: string[] = []
      for (const line of lines) {
        const m = line.match(/^(助っ人\d+)：/)
        if (m) existingGuestLines.set(m[1], line)
        else   otherLines.push(line)
      }

      // 選択中の助っ人行を順に並べる（既入力内容を保持）
      const guestLines = selectedNames.map(name =>
        existingGuestLines.get(name) ?? `${name}：`
      )

      // 末尾の空行を除去
      while (otherLines.length > 0 && otherLines[otherLines.length - 1].trim() === '') {
        otherLines.pop()
      }

      return [...guestLines, ...otherLines].join('\n')
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usedGuestKey])

  // isPending が true → false になったタイミングで「保存しました」表示
  useEffect(() => {
    if (prevPendingRef.current && !isPending && saveState === 'saving') {
      setSaveState('saved')
      const t = setTimeout(() => setSaveState('idle'), 3000)
      return () => clearTimeout(t)
    }
    prevPendingRef.current = isPending
  }, [isPending, saveState])

  // ─── ポジション選択肢（全件表示・入れ替えは update 側で処理） ──────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function availableFirstPos(_idx: number)  { return POSITIONS }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function availableSecondPos(_idx: number) { return POSITIONS }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function availableFpPos(_idx: number)     { return FIELD_POSITIONS }

  // ─── 前半選手変更（打順内でスワップ） ─────────────────────────
  function changeFirst(idx: number, newId: string) {
    const next  = slots.map(s => ({ first: { ...s.first }, second: { ...s.second } }))
    const nextFp = fpSlots.map(f => ({ ...f }))
    if (newId) {
      // newId が空のときはスワップ不要（空スロットを誤って動かさないため）
      const displaced = next[idx].first.playerId
      const ci = next.findIndex((s, i) => i !== idx && s.first.playerId === newId)
      if (ci !== -1) next[ci].first.playerId = displaced
      // 後半欄・FPに同じ選手がいればクリア
      next.forEach((s, i) => { if (i !== idx && s.second.playerId === newId) s.second.playerId = '' })
      const fpIdx = nextFp.findIndex(f => f.playerId === newId)
      if (fpIdx !== -1) nextFp[fpIdx].playerId = ''
      setBench(prev => prev.filter(id => id !== newId))
    }
    next[idx].first.playerId = newId
    setSlots(next); setFpSlots(nextFp)
  }

  // ─── 後半選手変更 ────────────────────────────────────────────
  function changeSecond(idx: number, newId: string) {
    const next  = slots.map(s => ({ first: { ...s.first }, second: { ...s.second } }))
    const nextFp = fpSlots.map(f => ({ ...f }))
    if (newId) {
      // newId が空（「─ 同じ ─」）のときはスワップ不要
      const displaced = next[idx].second.playerId
      const ci = next.findIndex((s, i) => i !== idx && s.second.playerId === newId)
      if (ci !== -1) next[ci].second.playerId = displaced
      // 前半・FPに同じ選手がいればクリア
      next.forEach((s, i) => { if (i !== idx && s.first.playerId === newId) s.first.playerId = '' })
      const fpIdx = nextFp.findIndex(f => f.playerId === newId)
      if (fpIdx !== -1) nextFp[fpIdx].playerId = ''
      setBench(prev => prev.filter(id => id !== newId))
    }
    next[idx].second.playerId = newId
    setSlots(next); setFpSlots(nextFp)
  }

  // ─── ポジション更新 ────────────────────────────────────────────
  // 前半と後半は独立したハーフ。前半ポジションを変えても後半には干渉しない（逆も同様）。
  // 同じハーフ内で重複があれば旧ポジションと自動入れ替え。
  //
  // 後半ポジションの「実効値」:
  //   second.position が設定されていれば それを使用
  //   second.position が空 かつ second.playerId が空（= 前半と同じ選手）なら first.position を使用
  //   → これにより「前半と同じ選手のまま後半だけポジション変更」も正しくスワップ検出できる

  function updateFirstPos(idx: number, pos: string) {
    const oldPos = slots[idx].first.position
    if (oldPos === pos) return
    const ns = slots.map(s => ({ first: { ...s.first }, second: { ...s.second } }))
    const nf = fpSlots.map(f => ({ ...f }))
    if (pos && pos !== 'DP') {
      // 前半スロット内のみ重複チェック（後半には一切干渉しない）
      for (let i = 0; i < ns.length; i++) {
        if (i !== idx && ns[i].first.position === pos) { ns[i].first.position = oldPos; break }
      }
      // FPスロットとの重複チェック
      for (let i = 0; i < nf.length; i++) {
        if (nf[i].position === pos) { nf[i].position = oldPos; break }
      }
    }
    ns[idx].first.position = pos
    setSlots(ns); setFpSlots(nf)
  }

  function updateSecondPos(idx: number, pos: string) {
    const oldPos = slots[idx].second.position
    if (oldPos === pos) return
    const ns = slots.map(s => ({ first: { ...s.first }, second: { ...s.second } }))
    const nf = fpSlots.map(f => ({ ...f }))

    // idx の後半の実効ポジション（変更前）
    const idxEffective = oldPos !== ''
      ? oldPos
      : (ns[idx].second.playerId === '' ? ns[idx].first.position : '')

    if (pos && pos !== 'DP') {
      // 後半スロット内の重複チェック
      // second.playerId="" (前半と同じ選手) の行も含め、実効ポジションで比較
      for (let i = 0; i < ns.length; i++) {
        if (i === idx) continue
        const effPos = ns[i].second.position !== ''
          ? ns[i].second.position
          : (ns[i].second.playerId === '' ? ns[i].first.position : '')
        if (effPos === pos) {
          ns[i].second.position = idxEffective
          break  // 最初の重複のみスワップ
        }
      }
      // FPスロットとの重複チェック
      for (let i = 0; i < nf.length; i++) {
        if (nf[i].position === pos) { nf[i].position = idxEffective; break }
      }
    }
    ns[idx].second.position = pos
    setSlots(ns); setFpSlots(nf)
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
    setBench(prev => prev.filter(id => id !== newId))
    setFpSlots(next); setSlots(nextSlots)
  }
  function updateFpPos(idx: number, pos: string) {
    const oldPos = fpSlots[idx]?.position ?? ''
    if (oldPos === pos) return
    const ns = slots.map(s => ({ first: { ...s.first }, second: { ...s.second } }))
    const nf = fpSlots.map(f => ({ ...f }))
    if (pos) {
      for (let i = 0; i < ns.length; i++) {
        if (ns[i].first.position === pos) ns[i].first.position = oldPos
      }
      for (let i = 0; i < ns.length; i++) {
        if (ns[i].second.playerId && ns[i].second.position === pos) ns[i].second.position = oldPos
      }
      for (let i = 0; i < nf.length; i++) {
        if (i !== idx && nf[i].position === pos) nf[i].position = oldPos
      }
    }
    nf[idx].position = pos
    setSlots(ns); setFpSlots(nf)
  }
  function addFp()              { setFpSlots(prev => [...prev, { playerId: '', position: '' }]) }
  function removeFp(idx: number){ setFpSlots(prev => prev.filter((_, i) => i !== idx)) }

  // ─── 審判 ────────────────────────────────────────────────────
  function addUmpire()               { if (umpires.length < 4) setUmpires(prev => [...prev, { playerId: '', half: '前半' }]) }
  function removeUmpire(idx: number) { setUmpires(prev => prev.filter((_, i) => i !== idx)) }
  function updateUmpirePlayer(idx: number, v: string) { setUmpires(prev => prev.map((u, i) => i === idx ? { ...u, playerId: v } : u)) }
  function updateUmpireHalf(idx: number, v: string)   { setUmpires(prev => prev.map((u, i) => i === idx ? { ...u, half: v } : u)) }

  // ─── ベンチ ──────────────────────────────────────────────────
  // スタメン（打順・FP）に入っていない選手一覧
  const assignedIds = new Set<string>([
    ...slots.flatMap(s => [s.first.playerId, s.second.playerId]),
    ...fpSlots.map(f => f.playerId),
  ].filter(Boolean))

  function toggleBench(id: string) {
    setBench(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  // ─── 保存 ───────────────────────────────────────────────────
  function save() {
    setSaveState('saving')
    const data: LineupData = { slots, fpSlots, umpires, bench, note }
    const fd = new FormData()
    fd.append('scheduleId', scheduleId)
    fd.append('lineupJson', JSON.stringify(data))
    startTransition(() => { saveAction(fd) })
  }

  // ─── スタイル ─────────────────────────────────────────────
  const sCls   = 'w-full bg-[#0d1b2a] border border-[#1e3a5f] rounded-lg px-1.5 py-1.5 text-sm text-[#e2e8f0] focus:border-[#2563eb] focus:outline-none'
  const sFpCls = 'w-full bg-[#0d1b2a] border border-[#f59e0b]/30 rounded-lg px-1.5 py-1.5 text-sm text-[#e2e8f0] focus:border-[#f59e0b] focus:outline-none'

  // グリッド列定義: [番] [前半選手] [前半POS] [後半選手] [後半POS] [削除]
  // 固定幅でスマホ横スクロール対応
  const ROW = '1.75rem 1fr 4rem 1fr 4rem 1.5rem'
  const HDR = '1.75rem 1fr 4rem 1fr 4rem 1.5rem'

  // 全選手（レギュラー＋助っ人）
  const allPlayers = [...players, ...GUEST_PLAYERS]

  const playerOpts = (
    <>
      <option value="">──</option>
      {players.map(p => (
        <option key={p.id} value={p.id}>
          {p.number != null ? `#${p.number} ` : ''}{p.name}
        </option>
      ))}
      <optgroup label="─ 助っ人 ─">
        {GUEST_PLAYERS.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </optgroup>
    </>
  )

  const secondPlayerOpts = (
    <>
      <option value="">─ 同じ ─</option>
      {players.map(p => (
        <option key={p.id} value={p.id}>
          {p.number != null ? `#${p.number} ` : ''}{p.name}
        </option>
      ))}
      <optgroup label="─ 助っ人 ─">
        {GUEST_PLAYERS.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </optgroup>
    </>
  )

  return (
    <div className="space-y-4">

      {/* ヘッダー凡例 */}
      <div className="flex items-baseline justify-between flex-wrap gap-1">
        <p className="text-xs font-bold text-[#60a5fa] tracking-widest uppercase">打順・ポジション</p>
        <p className="text-[11px] text-[#475569]">DP：打つだけ　FP：守るだけ</p>
      </div>

      {/* ── 打順・FP（横スクロール対応） ── */}
      <div className="overflow-x-auto">
        <div className="min-w-[540px] space-y-1.5">

          {/* 列ヘッダー */}
          <div style={{ display: 'grid', gridTemplateColumns: HDR, gap: '0.5rem', alignItems: 'center' }} className="px-0.5 mb-1">
            <div />
            <div className="text-[10px] text-[#3b82f6] font-bold text-center tracking-wider">前半</div>
            <div />
            <div className="text-[10px] text-[#f59e0b] font-bold text-center tracking-wider">後半</div>
            <div />
            <div />
          </div>

          {/* 打順リスト */}
          {slots.map((slot, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: ROW, gap: '0.4rem', alignItems: 'center' }}>

              {/* 番号 */}
              <span className="text-[#3b82f6] font-black text-sm text-right">{idx + 1}</span>

              {/* 前半選手 */}
              <select value={slot.first.playerId} onChange={e => changeFirst(idx, e.target.value)} className={sCls}>
                {playerOpts}
              </select>

              {/* 前半POS */}
              <select value={slot.first.position} onChange={e => updateFirstPos(idx, e.target.value)} className={sCls}>
                <option value=""> </option>
                {availableFirstPos(idx).map(p => <option key={p} value={p}>{p}</option>)}
              </select>

              {/* 後半選手 */}
              <select value={slot.second.playerId} onChange={e => changeSecond(idx, e.target.value)}
                className={sCls} style={{ borderColor: slot.second.playerId ? '#f59e0b40' : undefined }}>
                {secondPlayerOpts}
              </select>

              {/* 後半POS */}
              <select value={slot.second.position} onChange={e => updateSecondPos(idx, e.target.value)}
                className={sCls} style={{ borderColor: slot.second.playerId ? '#f59e0b40' : undefined }}>
                <option value=""> </option>
                {availableSecondPos(idx).map(p => <option key={p} value={p}>{p}</option>)}
              </select>

              {/* 削除 */}
              {idx >= 9
                ? <button type="button" onClick={() => removeSlot(idx)} className="text-[#64748b] hover:text-red-400 text-base leading-none text-center">×</button>
                : <div />}
            </div>
          ))}

          {/* ＋打順追加 */}
          <button type="button" onClick={addSlot} className="text-xs text-[#3b82f6] hover:text-[#60a5fa] transition-colors pt-1">
            ＋ {slots.length + 1}番を追加
          </button>

          {/* FP（守備専任）*/}
          {(fpSlots.length > 0) && (
            <div className="pt-2 space-y-1.5">
              {fpSlots.map((fp, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: ROW, gap: '0.4rem', alignItems: 'center' }}>
                  <div />
                  <select value={fp.playerId} onChange={e => changeFpPlayer(idx, e.target.value)}
                    className={`col-span-1 w-full bg-[#0d1b2a] border border-[#f59e0b]/30 rounded-lg px-1.5 py-1.5 text-sm text-[#e2e8f0] focus:border-[#f59e0b] outline-none`}>
                    {playerOpts}
                  </select>
                  <select value={fp.position} onChange={e => updateFpPos(idx, e.target.value)} className={sFpCls}>
                    <option value=""> </option>
                    {availableFpPos(idx).map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <div /><div />
                  <button type="button" onClick={() => removeFp(idx)} className="text-[#64748b] hover:text-red-400 text-base leading-none text-center">×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── FP セクションヘッダー＋追加ボタン（スクロール外） ── */}
      <div className="pt-1 border-t border-[#1e3a5f]">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-[#f59e0b] tracking-widest uppercase flex items-baseline gap-2">
            FP <span className="text-[#475569] normal-case font-normal text-[11px]">守るだけ（打順なし）</span>
          </p>
          <button type="button" onClick={addFp} className="text-xs text-[#f59e0b] hover:text-[#fbbf24] transition-colors">
            ＋ FP を追加
          </button>
        </div>
      </div>

      {/* ── ベンチ入り選手 ── */}
      <div className="pt-3 border-t border-[#1e3a5f]">
        <p className="text-xs font-bold text-[#22d3ee] tracking-widest uppercase mb-2">
          ベンチ入り <span className="text-[#475569] normal-case font-normal text-[11px] ml-1">スタメン外で参加する選手</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {players.map(p => {
            const inLineup = assignedIds.has(p.id)
            const inBench  = bench.includes(p.id)
            if (inLineup) return null  // スタメンはここに出さない
            if (p.id.startsWith('__guest_')) return null  // 助っ人はベンチ欄不要
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggleBench(p.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                  inBench
                    ? 'bg-[#22d3ee]/15 border-[#22d3ee]/60 text-[#22d3ee]'
                    : 'border-[#1e3a5f] text-[#475569] hover:border-[#22d3ee]/40 hover:text-[#94a3b8]'
                }`}
              >
                {p.number != null ? `#${p.number} ` : ''}{p.name}
              </button>
            )
          })}
        </div>
        {bench.length > 0 && (
          <p className="text-[11px] text-[#22d3ee]/60 mt-2">
            ベンチ: {bench
              .map(id => players.find(p => p.id === id))
              .filter(Boolean)
              .map(p => (p!.number != null ? `#${p!.number} ` : '') + p!.name)
              .join('、')}
          </p>
        )}
      </div>

      {/* ── 審判 ── */}
      <div className="pt-3 border-t border-[#1e3a5f]">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-[#a78bfa] tracking-widest uppercase">
            審判 <span className="text-[#475569] normal-case font-normal text-[11px] ml-1">最大4名</span>
          </p>
          {umpires.length < 4 && (
            <button type="button" onClick={addUmpire}
              className="text-xs text-[#a78bfa] hover:text-[#c4b5fd] transition-colors">
              ＋ 追加
            </button>
          )}
        </div>

        {umpires.length === 0 && (
          <p className="text-xs text-[#3b4f6a]">「＋ 追加」で審判担当を登録できます。</p>
        )}

        <div className="space-y-2">
          {umpires.map((u, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '5rem 1fr 1.5rem', gap: '0.4rem', alignItems: 'center' }}>
              {/* 前半/後半/全試合 */}
              <select value={u.half} onChange={e => updateUmpireHalf(idx, e.target.value)}
                className="w-full bg-[#0d1b2a] border border-[#7c3aed]/30 rounded-lg px-2 py-1.5 text-xs text-[#a78bfa] focus:border-[#a78bfa] outline-none">
                <option value="前半">前半</option>
                <option value="後半">後半</option>
                <option value="全試合">全試合</option>
              </select>
              {/* 選手 */}
              <select value={u.playerId} onChange={e => updateUmpirePlayer(idx, e.target.value)}
                className="w-full bg-[#0d1b2a] border border-[#7c3aed]/30 rounded-lg px-2 py-1.5 text-sm text-[#e2e8f0] focus:border-[#a78bfa] outline-none min-w-0">
                <option value="">── 選手を選択 ──</option>
                {players.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.number != null ? `#${p.number} ` : ''}{p.name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => removeUmpire(idx)}
                className="text-[#64748b] hover:text-red-400 text-base leading-none text-center">×</button>
            </div>
          ))}
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

      {/* 保存ボタン + フィードバック */}
      <div className="flex items-center gap-3 mt-1">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className={`btn-primary flex-1 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
            saveState === 'saved' ? 'bg-[#16a34a] border-[#16a34a]' : ''
          }`}
        >
          {saveState === 'saving'
            ? '保存中...'
            : saveState === 'saved'
              ? '✓ 保存しました'
              : 'スタメンを保存'}
        </button>
      </div>
    </div>
  )
}
