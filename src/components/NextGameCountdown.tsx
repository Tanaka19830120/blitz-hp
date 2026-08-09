'use client'
import { useEffect, useState } from 'react'

interface Props {
  targetDate: string   // ISO string
  label: string        // 例: "BBQ" or "vs ビクトリー"
  meetTime?: string | null
  startTime?: string | null
}

function pad(n: number) { return String(n).padStart(2, '0') }

function calcCountdown(targetDate: string, meetTime?: string | null, startTime?: string | null) {
  const base = new Date(targetDate)
  // 集合 → PB → 00:00 の優先順
  if (meetTime) {
    const [h, m] = meetTime.replace(/[^0-9]/g, '').match(/.{1,2}/g)!.map(Number)
    base.setHours(h, m ?? 0, 0, 0)
  } else if (startTime) {
    const [h, m] = startTime.replace(/[^0-9]/g, '').match(/.{1,2}/g)!.map(Number)
    base.setHours(h, m ?? 0, 0, 0)
  }
  const diff = base.getTime() - Date.now()
  if (diff <= 0) return null
  const totalSec = Math.floor(diff / 1000)
  const d = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return { d, h, m, s }
}

export function NextGameCountdown({ targetDate, label, meetTime, startTime }: Props) {
  const [cd, setCd] = useState(() => calcCountdown(targetDate, meetTime, startTime))

  useEffect(() => {
    const timer = setInterval(() => {
      setCd(calcCountdown(targetDate, meetTime, startTime))
    }, 1000)
    return () => clearInterval(timer)
  }, [targetDate, meetTime, startTime])

  if (!cd) return null

  const units = [
    { val: cd.d, label: '日' },
    { val: cd.h, label: '時間' },
    { val: cd.m, label: '分' },
    { val: cd.s, label: '秒' },
  ]

  return (
    <div className="w-full border-b border-[#1e3a5f]/60 bg-[#050a15]/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-center gap-4 flex-wrap">
        <span className="text-xs text-[#60a5fa] font-bold tracking-wider uppercase shrink-0">
          Next ▶ {label} まで
        </span>
        <div className="flex items-center gap-1.5">
          {units.map(({ val, label: ul }, i) => (
            <div key={ul} className="flex items-center gap-1.5">
              <div className="flex flex-col items-center">
                <span
                  className="font-black font-mono tabular-nums text-[#e2e8f0]"
                  style={{ fontSize: 'clamp(1rem, 3vw, 1.5rem)', lineHeight: 1 }}
                >
                  {ul === '日' ? cd.d : pad(val)}
                </span>
                <span className="text-[9px] text-[#475569] mt-0.5">{ul}</span>
              </div>
              {i < units.length - 1 && (
                <span className="text-[#1e3a5f] font-black text-lg mb-3">:</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
