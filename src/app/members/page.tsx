import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { MemberAvatar } from '@/components/MemberAvatar'

export const revalidate = 0

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const sp = await searchParams
  const isAlumni = sp.tab === 'alumni'

  const [current, alumni] = await Promise.all([
    prisma.user.findMany({
      where: { isGuest: false, email: { endsWith: '@b' } },
      orderBy: [{ number: 'asc' }, { name: 'asc' }],
      select: {
        id: true, name: true, number: true, position: true, photoUrl: true, role: true, themeColor: true,
        _count: { select: { gameStats: true } },
      },
    }),
    prisma.user.findMany({
      where: {
        OR: [
          { isGuest: false, NOT: { email: { endsWith: '@b' } } },
        ],
        gameStats: { some: {} },
      },
      orderBy: [{ number: 'asc' }, { name: 'asc' }],
      select: {
        id: true, name: true, number: true, position: true, photoUrl: true, themeColor: true,
        _count: { select: { gameStats: true } },
      },
    }),
  ])

  const members = isAlumni ? alumni : current

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-[#e2e8f0] mb-2">メンバー</h1>
        <p className="text-[#64748b]">チームメンバー一覧</p>
      </div>

      {/* タブ */}
      <div className="flex gap-2 mb-6">
        <Link
          href="/members"
          className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
            !isAlumni
              ? 'bg-[#2563eb] border-[#2563eb] text-white'
              : 'border-[#1e3a5f] text-[#64748b] hover:border-[#2563eb]/50 hover:text-[#94a3b8]'
          }`}
        >
          現メンバー {current.length}名
        </Link>
        <Link
          href="/members?tab=alumni"
          className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
            isAlumni
              ? 'bg-[#8b5cf6] border-[#8b5cf6] text-white'
              : 'border-[#1e3a5f] text-[#64748b] hover:border-[#8b5cf6]/50 hover:text-[#94a3b8]'
          }`}
        >
          元メンバー {alumni.length}名
        </Link>
      </div>

      <h2 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase mb-4">
        {isAlumni ? 'Alumni' : 'Players'}
      </h2>

      {members.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center text-[#64748b]">
          {isAlumni ? '元メンバーのデータはありません' : 'メンバーはまだ登録されていません'}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {members.map((member) => (
            <Link
              key={member.id}
              href={`/members/${member.id}`}
              className="group relative block min-h-[310px] overflow-hidden rounded-2xl border bg-[#081321] transition-all duration-300 hover:-translate-y-2 hover:scale-[1.01] hover:shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
              style={member.themeColor ? {
                borderColor: `${member.themeColor}55`,
                boxShadow: `inset 0 0 40px ${member.themeColor}0d`,
              } : { borderColor: '#1e3a5f' }}
            >
              <div
                className="absolute inset-x-0 top-0 h-1 transition-all duration-300 group-hover:h-1.5"
                style={{ backgroundColor: member.themeColor ?? '#2563eb' }}
              />
              <div className="absolute -right-2 top-3 select-none text-[8rem] font-black leading-none text-white/[0.035] transition-all duration-300 group-hover:text-white/[0.07]">
                {member.number ?? 'B'}
              </div>
              <div className="absolute inset-x-0 top-0 h-44 bg-[radial-gradient(circle_at_50%_20%,rgba(37,99,235,0.24),transparent_65%)]" />

              <div className="relative flex h-full flex-col items-center px-5 pb-5 pt-8 text-center">
                <div
                  className="mb-4 rounded-full p-1 ring-1 transition-transform duration-300 group-hover:scale-110"
                  style={{
                    backgroundColor: `${member.themeColor ?? '#2563eb'}22`,
                    boxShadow: `0 0 30px ${member.themeColor ?? '#2563eb'}30`,
                    color: member.themeColor ?? '#60a5fa',
                  }}
                >
                <MemberAvatar
                  photoUrl={member.photoUrl}
                  name={member.name}
                  number={member.number}
                  size="xl"
                  className="ring-2 ring-current"
                />
                </div>

                <div className="mb-1 flex items-center justify-center gap-2">
                  {member.number != null && (
                    <span className="text-sm font-black" style={{ color: member.themeColor ?? '#60a5fa' }}>
                      #{member.number}
                    </span>
                  )}
                  <span className="text-xl font-black tracking-wide text-[#f8fafc]">{member.name}</span>
                </div>

                <div className="flex min-h-6 items-center justify-center gap-1.5">
                    {'role' in member && member.role === 'ADMIN' && (
                    <span className="rounded-full border border-[#fbbf24]/40 bg-[#fbbf24]/10 px-2 py-0.5 text-[10px] font-bold text-[#fbbf24]">CAPTAIN</span>
                    )}
                    {isAlumni && (
                    <span className="rounded-full border border-[#8b5cf6]/40 bg-[#8b5cf6]/10 px-2 py-0.5 text-[10px] font-bold text-[#a78bfa]">ALUMNI</span>
                    )}
                </div>

                <div className="mt-auto grid w-full grid-cols-2 overflow-hidden rounded-xl border border-[#1e3a5f]/70 bg-[#050a15]/70">
                  <div className="border-r border-[#1e3a5f]/70 px-2 py-3">
                    <div className="text-lg font-black text-[#e2e8f0]">{member.position || '—'}</div>
                    <div className="mt-0.5 text-[9px] font-bold tracking-[0.18em] text-[#475569]">POSITION</div>
                  </div>
                  <div className="px-2 py-3">
                    <div className="text-lg font-black text-[#e2e8f0]">{member._count.gameStats}</div>
                    <div className="mt-0.5 text-[9px] font-bold tracking-[0.18em] text-[#475569]">GAMES</div>
                  </div>
                </div>

                <div className="mt-3 text-[10px] font-bold tracking-[0.25em] text-[#334155] transition-colors group-hover:text-[#60a5fa]">
                  VIEW PLAYER CARD →
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
