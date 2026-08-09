'use client'
import { useEffect, useState } from 'react'

interface GameInfo {
  opponent: string
  location: string
  meetTime: string | null
  startTime: string | null
  date: string // ISO string
}

function pad(n: number) { return String(n).padStart(2, '0') }

function parseTime(timeStr: string, baseDate: Date): Date {
  const d = new Date(baseDate)
  const clean = timeStr.replace(/[^0-9:]/g, '')
  const parts = clean.includes(':') ? clean.split(':') : [clean.slice(0, 2), clean.slice(2)]
  d.setHours(parseInt(parts[0] ?? '9'), parseInt(parts[1] ?? '0'), 0, 0)
  return d
}

function getCountdown(gameDate: string, meetTime: string | null, startTime: string | null) {
  const base = new Date(gameDate)
  // 集合時刻 → 試合開始時刻 → デフォルト9:00 の優先順
  const target = meetTime
    ? parseTime(meetTime, base)
    : startTime
    ? parseTime(startTime, base)
    : (() => { base.setHours(9, 0, 0, 0); return base })()
  const diff = target.getTime() - Date.now()
  if (diff <= 0) return null
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  return { h, m, s, label: meetTime ? '集合まで' : startTime ? 'PBまで' : '試合まで' }
}

export function GameDayBanner({ games }: { games: GameInfo[] }) {
  const [countdown, setCountdown] = useState<{ h: number; m: number; s: number; label: string } | null>(null)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (games.length === 0) return
    const primary = games[0]
    const update = () => setCountdown(getCountdown(primary.date, primary.meetTime, primary.startTime))
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [games])

  if (!visible || games.length === 0) return null

  return (
    <div
      className="relative overflow-hidden w-full"
      style={{
        background: 'linear-gradient(135deg, #0a1628 0%, #1a0a28 50%, #0a1628 100%)',
        borderBottom: '1px solid rgba(251,191,36,0.3)',
      }}
    >
      {/* 背景グロー */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-64 h-32 bg-yellow-400/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-64 h-32 bg-orange-400/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-4">
        {/* 左：試合情報 */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* 炎バッジ */}
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black"
            style={{
              background: 'linear-gradient(135deg, #f97316, #fbbf24)',
              color: '#000',
              animation: 'bannerPulse 1.5s ease-in-out infinite',
            }}
          >
            ⚾ 今日は試合！
          </div>
          <div>
            {games.map((g, i) => (
              <div key={i} className="text-sm font-bold" style={{ color: '#fbbf24' }}>
                vs {g.opponent}
                <span className="text-xs text-[#94a3b8] ml-2 font-normal">📍{g.location}</span>
                {g.meetTime  && <span className="text-xs text-[#60a5fa] ml-2 font-normal">🕐集合{g.meetTime}</span>}
                {g.startTime && <span className="text-xs text-[#fb923c] ml-2 font-normal">⚾PB {g.startTime}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* 右：カウントダウン */}
        {countdown && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#64748b]">{countdown.label}</span>
            {[
              { label: '時間', val: countdown.h },
              { label: '分', val: countdown.m },
              { label: '秒', val: countdown.s },
            ].map(({ label, val }) => (
              <div key={label} className="flex flex-col items-center">
                <div
                  className="text-xl font-black font-mono w-10 text-center rounded-lg py-0.5"
                  style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}
                >
                  {pad(val)}
                </div>
                <div className="text-[9px] text-[#64748b] mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        )}
        {!countdown && (
          <div className="text-xs text-[#f59e0b] font-bold animate-pulse">🎯 プレイボール！</div>
        )}

        {/* 閉じるボタン */}
        <button
          onClick={() => setVisible(false)}
          className="text-[#475569] hover:text-[#94a3b8] text-lg leading-none ml-2"
          title="閉じる"
        >
          ×
        </button>
      </div>

      <style>{`
        @keyframes bannerPulse {
          0%,100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>
    </div>
  )
}
