'use client'

import { useState, useTransition } from 'react'

type Status = 'ATTENDING' | 'ABSENT' | 'MAYBE'

type MemberAttendance = {
  id: string
  name: string
  status: Status | null
  note: string
  guestCount: number
}

type Props = {
  scheduleId: string
  isMulti: boolean
  members: MemberAttendance[]
  updateAction: (
    scheduleId: string,
    targetUserId: string,
    status: Status,
    note: string,
    guestCount: number,
  ) => Promise<void>
}

export default function AdminAttendanceEditor({ scheduleId, isMulti, members, updateAction }: Props) {
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [status, setStatus] = useState<Status>('ATTENDING')
  const [note, setNote] = useState('')
  const [guestCount, setGuestCount] = useState(0)
  const [pending, startTransition] = useTransition()

  function selectMember(id: string) {
    setSelectedId(id)
    const member = members.find(item => item.id === id)
    setStatus(member?.status ?? 'ATTENDING')
    setNote(member?.note ?? '')
    setGuestCount(member?.status === 'ATTENDING' ? member.guestCount : 0)
  }

  function save() {
    if (!selectedId) return
    startTransition(async () => {
      await updateAction(
        scheduleId,
        selectedId,
        status,
        note,
        status === 'ATTENDING' ? guestCount : 0,
      )
    })
  }

  if (members.length === 0) return null

  return (
    <div className="mt-4 rounded-xl border border-[#d97706]/30 bg-[#d97706]/5">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-[#fbbf24]">
        <span>管理者：他メンバーの出欠を登録</span>
        <span className="text-[#94a3b8]">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="grid gap-3 border-t border-[#d97706]/20 px-4 py-4 md:grid-cols-2 lg:grid-cols-5">
          <label className="block lg:col-span-1">
            <span className="mb-1 block text-xs text-[#94a3b8]">対象メンバー</span>
            <select
              value={selectedId}
              onChange={event => selectMember(event.target.value)}
              className="h-10 w-full rounded-lg border border-[#1e3a5f] bg-[#091827] px-3 text-sm text-[#e2e8f0] outline-none focus:border-[#d97706]">
              <option value="">選択してください</option>
              {members.map(member => (
                <option key={member.id} value={member.id}>
                  {member.name}{member.status ? `（${member.status === 'ATTENDING' ? '参加' : member.status === 'ABSENT' ? '欠席' : '未定'}）` : '（未回答）'}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-[#94a3b8]">出欠</span>
            <select
              value={status}
              onChange={event => {
                const next = event.target.value as Status
                setStatus(next)
                if (next !== 'ATTENDING') setGuestCount(0)
              }}
              disabled={!selectedId}
              className="h-10 w-full rounded-lg border border-[#1e3a5f] bg-[#091827] px-3 text-sm text-[#e2e8f0] outline-none disabled:opacity-40 focus:border-[#d97706]">
              <option value="ATTENDING">参加</option>
              <option value="ABSENT">欠席</option>
              <option value="MAYBE">未定</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-[#94a3b8]">助っ人数</span>
            <input
              type="number"
              min={0}
              max={20}
              value={guestCount}
              onChange={event => {
                const value = Number.parseInt(event.target.value, 10)
                setGuestCount(Number.isNaN(value) ? 0 : Math.max(0, Math.min(20, value)))
              }}
              disabled={!selectedId || status !== 'ATTENDING'}
              className="h-10 w-full rounded-lg border border-[#1e3a5f] bg-[#091827] px-3 text-sm text-[#e2e8f0] outline-none disabled:opacity-40 focus:border-[#d97706]"
            />
          </label>

          <label className="block md:col-span-2 lg:col-span-2">
            <span className="mb-1 block text-xs text-[#94a3b8]">コメント（任意）</span>
            <input
              type="text"
              value={note}
              maxLength={200}
              onChange={event => setNote(event.target.value.slice(0, 200))}
              disabled={!selectedId}
              placeholder="例：管理者による代理登録"
              className="h-10 w-full rounded-lg border border-[#1e3a5f] bg-[#091827] px-3 text-sm text-[#e2e8f0] outline-none placeholder:text-[#475569] disabled:opacity-40 focus:border-[#d97706]"
            />
          </label>

          <div className="flex items-end md:col-span-2 lg:col-span-5">
            <button
              type="button"
              onClick={save}
              disabled={!selectedId || pending}
              className="rounded-lg bg-[#d97706] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#f59e0b] disabled:cursor-not-allowed disabled:opacity-40">
              {pending ? '登録中...' : '選択したメンバーの出欠を登録'}
            </button>
            {isMulti && <span className="ml-3 text-xs text-[#64748b]">同日の全試合に適用されます</span>}
          </div>
        </div>
      )}
    </div>
  )
}
