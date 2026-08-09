'use client'

interface Props { streak: number }

export function WinStreakFire({ streak }: Props) {
  if (streak < 3) return null

  const fires = Array.from({ length: Math.min(streak, 12) })

  return (
    <>
      {/* 左右から炎が上がる */}
      <div className="fixed inset-0 pointer-events-none z-[3] overflow-hidden">
        {fires.map((_, i) => {
          const isLeft = i % 2 === 0
          const size = 24 + Math.random() * 20
          const left = isLeft
            ? `${2 + (i / 2) * 5}%`
            : `${95 - (Math.floor(i / 2) * 5)}%`
          const delay = `${(i * 0.3) % 2}s`
          const duration = `${1.8 + (i % 3) * 0.4}s`

          return (
            <span
              key={i}
              className="absolute bottom-0 select-none"
              style={{
                left,
                fontSize: `${size}px`,
                animation: `fireRise ${duration} ease-in infinite`,
                animationDelay: delay,
                opacity: 0,
                filter: 'drop-shadow(0 0 8px rgba(251,146,60,0.8))',
              }}
            >
              🔥
            </span>
          )
        })}
      </div>

      {/* 連勝バッジ（ヒーローセクション左上） */}
      <div
        className="fixed top-20 left-4 z-50 flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-black shadow-2xl border"
        style={{
          background: 'linear-gradient(135deg, rgba(20,10,0,0.95), rgba(40,15,0,0.95))',
          borderColor: 'rgba(251,146,60,0.6)',
          color: '#fb923c',
          backdropFilter: 'blur(8px)',
          animation: 'fireBadgePulse 1s ease-in-out infinite',
        }}
      >
        <span style={{ animation: 'fireShake 0.4s ease-in-out infinite alternate' }}>🔥</span>
        <span>{streak}連勝中！</span>
        <span style={{ animation: 'fireShake 0.4s ease-in-out infinite alternate', animationDelay: '0.2s' }}>🔥</span>
      </div>

      <style>{`
        @keyframes fireRise {
          0%   { transform: translateY(0) scale(0.8) rotate(-5deg); opacity: 0; }
          10%  { opacity: 0.9; }
          60%  { transform: translateY(-60vh) scale(1.2) rotate(5deg); opacity: 0.6; }
          100% { transform: translateY(-100vh) scale(0.6) rotate(-3deg); opacity: 0; }
        }
        @keyframes fireBadgePulse {
          0%,100% { box-shadow: 0 0 16px rgba(251,146,60,0.4), 0 0 32px rgba(251,146,60,0.1); }
          50%     { box-shadow: 0 0 28px rgba(251,146,60,0.8), 0 0 60px rgba(251,146,60,0.3); }
        }
        @keyframes fireShake {
          0%   { transform: rotate(-15deg) scale(1); }
          100% { transform: rotate(15deg) scale(1.15); }
        }
      `}</style>
    </>
  )
}
