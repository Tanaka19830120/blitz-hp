import { prisma } from '@/lib/prisma'
import Image from 'next/image'

export default async function ProfilePage() {
  const [totalGames, wins, losses, draws] = await Promise.all([
    prisma.game.count(),
    prisma.game.count({ where: { result: 'WIN' } }),
    prisma.game.count({ where: { result: 'LOSE' } }),
    prisma.game.count({ where: { result: 'DRAW' } }),
  ])

  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0

  return (
    <div className="pt-16 max-w-4xl mx-auto px-4 py-12">
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

      {/* Team info */}
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <div className="glass-card rounded-2xl p-6">
          <h3 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase mb-4">基本情報</h3>
          <dl className="space-y-3 text-sm">
            {[
              { label: 'チーム名', value: 'BLITZ（ブリッツ）' },
              { label: '種目', value: 'ソフトボール（混合）' },
              { label: '所属リーグ', value: 'SD リーグ' },
              { label: '活動地域', value: '兵庫県（加古川・加古郡・明石）' },
              { label: '活動日', value: '土・日曜日（月2回程度）' },
              { label: '年間試合数', value: '20試合以上' },
            ].map(({ label, value }) => (
              <div key={label} className="flex gap-3">
                <dt className="text-[#64748b] w-24 shrink-0">{label}</dt>
                <dd className="text-[#e2e8f0]">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <h3 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase mb-4">活動グラウンド</h3>
          <dl className="space-y-3 text-sm">
            {[
              { label: '公式戦', value: '住友ゴム グラウンド（岩岡・神戸）' },
              { label: '練習試合', value: '成岡グラウンド（稲美町・加古郡）' },
              { label: '遠征', value: '姫路〜神戸エリアを中心に' },
            ].map(({ label, value }) => (
              <div key={label} className="flex gap-3">
                <dt className="text-[#64748b] w-20 shrink-0">{label}</dt>
                <dd className="text-[#e2e8f0]">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 pt-4 border-t border-[#1e3a5f]/50">
            <h4 className="text-xs text-[#64748b] mb-2">永久欠番</h4>
            <div className="flex gap-2">
              <span className="text-lg font-black text-[#fbbf24]">#6</span>
              <span className="text-lg font-black text-[#fbbf24]">#18</span>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="glass-card rounded-2xl p-6 mb-6">
        <h3 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase mb-4">チームについて</h3>
        <div className="space-y-3 text-sm text-[#94a3b8] leading-relaxed">
          <p>
            BLITZは兵庫県加古川・加古郡・明石エリアを拠点とする混合ソフトボールチームです。
            SDリーグに所属し、毎年20試合以上を戦っています。
          </p>
          <p>
            試合には女性2〜5名が参加し、チームワークを大切にしながら活動しています。
            勝利を目指しながらも、楽しく仲間と切磋琢磨することを大切にしています。
          </p>
          <p>
            試合だけでなく、バーベキューやビアガーデン、バス旅行など
            チームや家族・友人を含めた交流イベントも積極的に行っています。
          </p>
        </div>
      </div>

      {/* League records */}
      <div className="glass-card rounded-2xl p-6">
        <h3 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase mb-4">SD リーグ 過去成績</h3>
        <div className="flex flex-wrap gap-4 text-sm">
          {[
            { year: '2018', result: '4位' },
            { year: '2017', result: '6位' },
            { year: '2016', result: '2位' },
            { year: '2015', result: '5位' },
          ].map(({ year, result }) => (
            <div key={year} className="glass-card rounded-xl px-4 py-3 text-center min-w-[80px]">
              <div className="text-xs text-[#64748b] mb-1">{year}</div>
              <div className="font-black text-[#e2e8f0]">{result}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
