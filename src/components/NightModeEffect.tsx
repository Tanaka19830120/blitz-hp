'use client'
import { useEffect, useState } from 'react'

export function NightModeEffect() {
  const [isNight, setIsNight] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const h = new Date().getHours()
    setIsNight(h >= 0 && h < 4)
  }, [])

  if (!isNight) return null

  return (
    <>
      {/* 全体に追加暗転フィルター */}
      <div
        className="fixed inset-0 pointer-events-none z-[1]"
        style={{ background: 'rgba(0,0,10,0.55)', mixBlendMode: 'multiply' }}
      />

      {/* 星のキラキラ */}
      <div className="fixed inset-0 pointer-events-none z-[2] overflow-hidden">
        {[...Array(18)].map((_, i) => (
          <span
            key={i}
            className="absolute text-white/40 select-none"
            style={{
              top: `${Math.random() * 70}%`,
              left: `${Math.random() * 100}%`,
              fontSize: `${6 + Math.random() * 8}px`,
              animation: `twinkle ${1.5 + Math.random() * 2}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 2}s`,
            }}
          >
            ✦
          </span>
        ))}
        <style>{`
          @keyframes twinkle {
            0%,100% { opacity: 0.1; transform: scale(0.8); }
            50% { opacity: 0.7; transform: scale(1.2); }
          }
        `}</style>
      </div>

      {/* 深夜練習モードバッジ */}
      {!dismissed && (
        <div className="fixed top-20 right-4 z-50">
          <div
            className="flex items-center gap-2 rounded-2xl px-4 py-2 text-xs font-bold shadow-2xl border cursor-pointer"
            style={{
              background: 'rgba(10,10,40,0.92)',
              borderColor: 'rgba(99,102,241,0.5)',
              color: '#a5b4fc',
              backdropFilter: 'blur(8px)',
              animation: 'nightPulse 3s ease-in-out infinite',
            }}
            onClick={() => setDismissed(true)}
            title="クリックで閉じる"
          >
            <span style={{ animation: 'moonSway 4s ease-in-out infinite', display: 'inline-block' }}>🌙</span>
            <span>深夜練習モード</span>
          </div>
          <style>{`
            @keyframes nightPulse {
              0%,100% { box-shadow: 0 0 12px rgba(99,102,241,0.3); }
              50% { box-shadow: 0 0 24px rgba(99,102,241,0.7), 0 0 40px rgba(99,102,241,0.2); }
            }
            @keyframes moonSway {
              0%,100% { transform: rotate(-10deg); }
              50% { transform: rotate(10deg); }
            }
          `}</style>
        </div>
      )}
    </>
  )
}
