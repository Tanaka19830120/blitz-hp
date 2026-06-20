'use client'
import { useState } from 'react'

export function PastSchedulesCollapse({ count, children }: { count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-6">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 rounded-xl border border-[#1e3a5f] text-[#64748b] hover:text-[#94a3b8] hover:border-[#2563eb]/30 transition-all text-sm"
      >
        <span>📂 過去の予定（{count}件）</span>
        <span className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && (
        <div className="flex flex-col gap-4 mt-4">
          {children}
        </div>
      )}
    </div>
  )
}
