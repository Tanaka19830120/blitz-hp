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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {members.map((member) => (
            <Link
              key={member.id}
              href={`/members/${member.id}`}
              className="glass-card rounded-xl p-5 transition-all block"
              style={member.themeColor ? {
                borderColor: `${member.themeColor}30`,
              } : undefined}
            >
              <div className="flex items-start gap-4">
                <MemberAvatar
                  photoUrl={member.photoUrl}
                  name={member.name}
                  number={member.number}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {member.number != null && (
                      <span
                        className="text-xs font-black px-2 py-0.5 rounded shrink-0"
                        style={member.themeColor ? {
                          color: member.themeColor,
                          backgroundColor: `${member.themeColor}20`,
                        } : { color: '#60a5fa', backgroundColor: '#1e3a5f' }}
                      >
                        #{member.number}
                      </span>
                    )}
                    <span
                      className="font-bold truncate"
                      style={{ color: member.themeColor ?? '#e2e8f0' }}
                    >
                      {member.name}
                    </span>
                    {'role' in member && member.role === 'ADMIN' && (
                      <span className="text-[10px] text-[#fbbf24] border border-[#fbbf24]/30 px-1 rounded shrink-0">管理者</span>
                    )}
                    {isAlumni && (
                      <span className="text-[10px] text-[#8b5cf6] border border-[#8b5cf6]/30 px-1 rounded shrink-0">OB</span>
                    )}
                  </div>
                  {member.position && (
                    <div className="text-xs text-[#94a3b8] mt-0.5">{member.position}</div>
                  )}
                  <div className="text-xs text-[#64748b] mt-1">
                    出場 {member._count.gameStats}試合
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
