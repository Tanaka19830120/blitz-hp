import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import Image from 'next/image'

async function getHomeData() {
  const now = new Date()
  const [games, nextSchedule, totalGames] = await Promise.all([
    prisma.game.findMany({
      take: 6,
      orderBy: { schedule: { date: 'desc' } },
      include: { schedule: true },
    }),
    prisma.schedule.findFirst({
      where: { date: { gt: now } },
      orderBy: { date: 'asc' },
    }),
    prisma.game.groupBy({
      by: ['result'],
      _count: { result: true },
    }),
  ])
  const wins = totalGames.find((g) => g.result === 'WIN')?._count.result ?? 0
  const losses = totalGames.find((g) => g.result === 'LOSE')?._count.result ?? 0
  const draws = totalGames.find((g) => g.result === 'DRAW')?._count.result ?? 0
  return { games, nextSchedule, wins, losses, draws }
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('ja-JP', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })
}

function daysUntil(date: Date) {
  return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

export default async function HomePage() {
  const { games, nextSchedule, wins, losses, draws } = await getHomeData()
  const total = wins + losses + draws

  return (
    <div className="pt-16">
      {/* Hero */}
      <section className="relative overflow-hidden min-h-[100svh] flex items-center">
        {/* AI-generated softball action photo background */}
        <div className="absolute inset-0">
          <Image
            src="/hero-softball.jpg"
            alt="BLITZ softball action"
            fill
            priority
            className="object-cover object-center"
          />
          {/* Dark overlay gradient — left side darker for text, right shows image */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(105deg, rgba(5,10,21,0.95) 0%, rgba(5,10,21,0.85) 40%, rgba(5,10,21,0.5) 65%, rgba(5,10,21,0.2) 100%)',
            }}
          />
          {/* Bottom fade to page bg */}
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#050a15] to-transparent" />
        </div>

        {/* Background atmospheric layers */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Glowing orbs on top of photo */}
          <div className="absolute top-1/3 left-0 w-[300px] h-[300px] bg-blue-600/10 rounded-full blur-[80px]" />
          {/* Grid overlay */}
          <div
            className="absolute inset-0 opacity-[0.015]"
            style={{
              backgroundImage: 'linear-gradient(rgba(96,165,250,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(96,165,250,0.5) 1px, transparent 1px)',
              backgroundSize: '60px 60px',
            }}
          />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 py-24 w-full">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: team identity */}
            <div>
              {/* Logo + badge */}
              <div className="flex items-center gap-4 mb-8">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-blue-500/20 blur-xl scale-150" />
                  <Image
                    src="/blitz-logo.jpg"
                    alt="BLITZ"
                    width={72}
                    height={72}
                    className="relative rounded-full ring-2 ring-[#2563eb]/40"
                  />
                </div>
                <div>
                  <div className="text-[#60a5fa] text-xs font-bold tracking-[0.4em] uppercase">Softball Team</div>
                  <div className="text-[#475569] text-xs tracking-widest mt-0.5">SDソフトボールリーグ</div>
                </div>
              </div>

              {/* Main headline */}
              <h1 className="font-black tracking-tight leading-none mb-3">
                <span
                  className="block text-[clamp(5rem,18vw,11rem)]"
                  style={{
                    background: 'linear-gradient(135deg, #ffffff 0%, #60a5fa 40%, #fbbf24 80%, #ffffff 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    filter: 'drop-shadow(0 0 40px rgba(96,165,250,0.3))',
                  }}
                >
                  BLITZ
                </span>
              </h1>

              {/* Accent line */}
              <div className="flex items-center gap-4 mb-6">
                <div className="h-px flex-1 max-w-[80px]" style={{ background: 'linear-gradient(90deg, #2563eb, transparent)' }} />
                <span className="text-[#64748b] text-xs tracking-[0.3em] uppercase font-semibold">Est. 2019</span>
              </div>

              <p className="text-[#94a3b8] text-lg md:text-xl mb-10 leading-relaxed">
                熱く、鋭く、打ち勝つ。<br />
                <span className="text-[#60a5fa]">仲間と共に頂点を目指す。</span>
              </p>

              <div className="flex flex-wrap gap-4">
                <Link href="/schedule" className="btn-primary text-base px-6 py-3">
                  📅 日程・出欠を確認
                </Link>
                <Link href="/results" className="btn-gold text-base px-6 py-3">
                  ⚾ 試合結果
                </Link>
              </div>
            </div>

            {/* Right: scoreboard stats */}
            {total > 0 && (
              <div className="flex justify-center lg:justify-end">
                <div className="w-full max-w-xs">
                  {/* Scoreboard header */}
                  <div
                    className="rounded-t-2xl px-5 py-3 flex items-center justify-between"
                    style={{ background: 'linear-gradient(135deg, #1d4ed8, #1e3a5f)' }}
                  >
                    <span className="text-xs font-bold tracking-[0.3em] text-white/80 uppercase">Season Record</span>
                    <span className="text-xs text-[#60a5fa] font-mono">{total}G</span>
                  </div>
                  {/* Score rows */}
                  <div className="rounded-b-2xl overflow-hidden border border-[#1e3a5f] border-t-0">
                    {[
                      { label: 'WIN', value: wins, color: '#22c55e', bg: 'rgba(34,197,94,0.08)', bar: wins / total },
                      { label: 'LOSE', value: losses, color: '#ef4444', bg: 'rgba(239,68,68,0.08)', bar: losses / total },
                      { label: 'DRAW', value: draws, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', bar: draws / total },
                    ].map(({ label, value, color, bg, bar }) => (
                      <div key={label} className="relative px-5 py-4 border-b border-[#1e3a5f] last:border-0" style={{ background: bg }}>
                        {/* Progress bar */}
                        <div
                          className="absolute left-0 top-0 bottom-0 opacity-20"
                          style={{ width: `${bar * 100}%`, background: color }}
                        />
                        <div className="relative flex items-center justify-between">
                          <span className="text-xs font-bold tracking-[0.3em]" style={{ color }}>{label}</span>
                          <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-black" style={{ color }}>{value}</span>
                            <span className="text-xs text-[#475569]">
                              {total > 0 ? Math.round(value / total * 100) : 0}%
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {/* Win rate */}
                    <div className="px-5 py-3 bg-[#0d1b2a]/80 flex items-center justify-between">
                      <span className="text-xs text-[#64748b] tracking-widest">WIN RATE</span>
                      <span
                        className="text-xl font-black"
                        style={{
                          background: 'linear-gradient(135deg, #22c55e, #60a5fa)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          backgroundClip: 'text',
                        }}
                      >
                        {total > 0 ? (wins / total * 100).toFixed(1) : '0.0'}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Next Game */}
      {nextSchedule && (
        <section className="max-w-7xl mx-auto px-4 py-12">
          <h2 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase mb-6">Next Game</h2>
          <div className="glass-card rounded-2xl p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="badge-pending">
                  {nextSchedule.type === 'REGULAR' ? '公式戦' : nextSchedule.type === 'TOURNAMENT' ? 'トーナメント' : nextSchedule.type === 'EVENT' ? 'イベント' : '練習試合'}
                </span>
                <span className="text-[#60a5fa] font-bold text-sm">
                  {daysUntil(nextSchedule.date) === 0 ? '本日' : `${daysUntil(nextSchedule.date)}日後`}
                </span>
              </div>
              <div className="text-[#94a3b8] text-sm mb-1">{formatDate(nextSchedule.date)}</div>
              <div className="text-2xl font-bold">
                vs <span className="text-[#fbbf24]">{nextSchedule.opponent}</span>
              </div>
              <div className="flex flex-wrap gap-4 mt-3 text-sm text-[#64748b]">
                <span>📍 {nextSchedule.location}</span>
                {nextSchedule.meetTime && <span>🕐 集合 {nextSchedule.meetTime}</span>}
              </div>
            </div>
            <Link href="/schedule" className="btn-primary whitespace-nowrap">
              出欠を登録
            </Link>
          </div>
        </section>
      )}

      {/* Recent Results */}
      {games.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 pb-16">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase">Recent Results</h2>
            <Link href="/results" className="text-sm text-[#64748b] hover:text-[#94a3b8] transition-colors">
              すべて見る →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((game) => (
              <div key={game.id} className="glass-card rounded-xl p-5 hover:border-[#2563eb]/40 transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className={game.result === 'WIN' ? 'badge-win' : game.result === 'LOSE' ? 'badge-lose' : 'badge-draw'}>
                    {game.result === 'WIN' ? '勝利' : game.result === 'LOSE' ? '敗戦' : '引分'}
                  </span>
                  <span className="text-xs text-[#64748b]">{formatDate(game.schedule.date)}</span>
                </div>
                <div className="text-sm text-[#94a3b8] mb-1">vs {game.schedule.opponent}</div>
                <div className="text-2xl font-black">
                  <span className={game.result === 'WIN' ? 'text-[#22c55e]' : game.result === 'LOSE' ? 'text-[#ef4444]' : 'text-[#f59e0b]'}>
                    {game.ourScore}
                  </span>
                  <span className="text-[#1e3a5f] mx-2">-</span>
                  <span className="text-[#64748b]">{game.opponentScore}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {total === 0 && games.length === 0 && !nextSchedule && (
        <section className="max-w-7xl mx-auto px-4 py-20 text-center">
          <div className="text-[#64748b] text-lg">
            シーズンデータを読み込んでいます...
          </div>
        </section>
      )}
    </div>
  )
}
