import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { MemberAvatar } from '@/components/MemberAvatar'

export const dynamic = 'force-dynamic'

export default async function MembersPage() {
  const members = await prisma.user.findMany({
    // 現メンバーのみ（正式ログインアカウント=メールが @b）。元メンバー(@guest)・助っ人は除外
    where: { isGuest: false, email: { endsWith: '@b' } },
    orderBy: [{ number: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      number: true,
      position: true,
      photoUrl: true,
      role: true,
      _count: { select: { gameStats: true } },
    },
  })

  return (
    <div className="pt-16 max-w-7xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-[#e2e8f0] mb-2">メンバー</h1>
        <p className="text-[#64748b]">チームメンバー一覧 — {members.length}名</p>
      </div>

      <h2 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase mb-4">Players</h2>
      {members.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center text-[#64748b]">
          メンバーはまだ登録されていません
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {members.map((member) => (
            <Link
              key={member.id}
              href={`/members/${member.id}`}
              className="glass-card rounded-xl p-5 hover:border-[#2563eb]/40 transition-all block"
            >
              <div className="flex items-start gap-4">
                <MemberAvatar
                  photoUrl={member.photoUrl}
                  name={member.name}
                  number={member.number}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[#e2e8f0] truncate flex items-center gap-1.5">
                    {member.name}
                    {member.role === 'ADMIN' && (
                      <span className="text-[10px] text-[#fbbf24] border border-[#fbbf24]/30 px-1 rounded shrink-0">管理者</span>
                    )}
                  </div>
                  {member.number != null && (
                    <div className="text-xs text-[#60a5fa] font-medium">#{member.number}</div>
                  )}
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
