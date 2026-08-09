import { prisma } from '@/lib/prisma'
import Image from 'next/image'
import {
  getProfileSetting, parseKVLines, parseRecordLines,
} from '@/lib/settings'

export default async function ProfilePage() {
  const [totalGames, wins, losses, draws, about, infoRaw, groundsRaw, retiredRaw, recordsRaw] = await Promise.all([
    prisma.game.count(),
    prisma.game.count({ where: { result: 'WIN' } }),
    prisma.game.count({ where: { result: 'LOSE' } }),
    prisma.game.count({ where: { result: 'DRAW' } }),
    getProfileSetting('profile_about'),
    getProfileSetting('profile_info'),
    getProfileSetting('profile_grounds'),
    getProfileSetting('profile_retiredNumbers'),
    getProfileSetting('profile_records'),
  ])

  const decidedGames = wins + losses  // 引き分けを分母から除外
  const winRate     = decidedGames > 0 ? Math.round((wins / decidedGames) * 100) : 0
  const infoItems   = parseKVLines(infoRaw)
  const groundItems = parseKVLines(groundsRaw)
  const records     = parseRecordLines(recordsRaw)
  const retired     = retiredRaw.split(',').map(s => s.trim()).filter(Boolean)
  const paragraphs  = about.split('\n\n').map(p => p.trim()).filter(Boolean)

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-[#e2e8f0] mb-2">チームプロフィール</h1>
        <p className="text-[#64748b]">BLITZ ソフトボールチームについて</p>
      </div>

      {/* Team header */}
      <div className="glass-card rounded-2xl p-8 mb-6 text-center">
        <Image src="/blitz-logo.jpg" alt="BLITZ" width={100} height={100} className="rounded-full mx-auto mb-4 shadow-lg" />
        <h2 className="text-6xl font-black text-gradient mb-2">BLITZ</h2>
        <p className="text-[#60a5fa] font-semibold tracking-widest text-sm uppercase">ブリッツ</p>
        <p className="text-[#64748b] mt-3">ソフトボールチーム（混合）</p>
      </div>

      {/* Stats */}
      {totalGames > 0 && (
        <div className="glass-card rounded-2xl p-6 mb-6">
          <h3 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase mb-4">通算成績</h3>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-3xl font-black text-[#22c55e]">{wins}</div>
              <div className="text-xs text-[#64748b] mt-1">勝</div>
            </div>
            <div>
              <div className="text-3xl font-black text-[#ef4444]">{losses}</div>
              <div className="text-xs text-[#64748b] mt-1">敗</div>
            </div>
            <div>
              <div className="text-3xl font-black text-[#f59e0b]">{draws}</div>
              <div className="text-xs text-[#64748b] mt-1">分</div>
            </div>
            <div>
              <div className="text-3xl font-black text-[#60a5fa]">{winRate}%</div>
              <div className="text-xs text-[#64748b] mt-1">勝率</div>
            </div>
          </div>
        </div>
      )}

      {/* Team info + grounds */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        {infoItems.length > 0 && (
          <div className="glass-card rounded-2xl p-6">
            <h3 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase mb-4">基本情報</h3>
            <dl className="space-y-3 text-sm">
              {infoItems.map(({ label, value }) => (
                <div key={label} className="flex gap-3">
                  <dt className="text-[#64748b] w-24 shrink-0">{label}</dt>
                  <dd className="text-[#e2e8f0]">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {groundItems.length > 0 && (
          <div className="glass-card rounded-2xl p-6">
            <h3 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase mb-4">活動グラウンド</h3>
            <dl className="space-y-3 text-sm">
              {groundItems.map(({ label, value }) => (
                <div key={label} className="flex gap-3">
                  <dt className="text-[#64748b] w-20 shrink-0">{label}</dt>
                  <dd className="text-[#e2e8f0]">{value}</dd>
                </div>
              ))}
            </dl>
            {retired.length > 0 && (
              <div className="mt-4 pt-4 border-t border-[#1e3a5f]/50">
                <h4 className="text-xs text-[#64748b] mb-2">永久欠番</h4>
                <div className="flex gap-2">
                  {retired.map(n => (
                    <span key={n} className="text-lg font-black text-[#fbbf24]">{n}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Description */}
      {paragraphs.length > 0 && (
        <div className="glass-card rounded-2xl p-6 mb-6">
          <h3 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase mb-4">チームについて</h3>
          <div className="space-y-3 text-sm text-[#94a3b8] leading-relaxed">
            {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </div>
      )}

      {/* League records */}
      {records.length > 0 && (
        <div className="glass-card rounded-2xl p-6">
          <h3 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase mb-4">過去成績</h3>
          <div className="flex flex-wrap gap-4 text-sm">
            {records.map(({ year, result }) => (
              <div key={year} className="glass-card rounded-xl px-4 py-3 text-center min-w-[80px]">
                <div className="text-xs text-[#64748b] mb-1">{year}</div>
                <div className="font-black text-[#e2e8f0]">{result}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
