import { prisma } from '@/lib/prisma'

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF']

export default async function MembersPage() {
  const members = await prisma.user.findMany({
    where: { role: 'PLAYER' },
    orderBy: [{ number: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      number: true,
      position: true,
      _count: { select: { gameStats: true } },
    },
  })

  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true, name: true, position: true },
  })

  return (
    <div className="pt-16 max-w-7xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-[#e2e8f0] mb-2">メンバー</h1>
        <p className="text-[#64748b]">チームメンバー一覧 — {members.length}名</p>
      </div>

      {/* Admins */}
      {admins.length > 0 && (
        <div className="mb-10">
          <h2 className="text-xs font-bold tracking-[0.3em] text-[#fbbf24] uppercase mb-4">Staff</h2>
          <div className="flex flex-wrap gap-3">
            {admins.map((admin) => (
              <div key={admin.id} className="glass-card rounded-xl px-5 py-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-600 to-amber-400 flex items-center justify-center text-white font-black text-sm">
                  {admin.name[0]}
                </div>
                <div>
                  <div className="font-semibold text-[#e2e8f0]">{admin.name}</div>
                  <div className="text-xs text-[#fbbf24]">管理者</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Players grid */}
      <h2 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase mb-4">Players</h2>
      {members.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center text-[#64748b]">
          メンバーはまだ登録されていません
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {members.map((member) => (
            <div key={member.id} className="glass-card rounded-xl p-5 hover:border-[#2563eb]/40 transition-all">
              <div className="flex items-start gap-4">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-700 to-blue-500 flex items-center justify-center text-white font-black">
                    {member.number != null ? `#${member.number}` : member.name[0]}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[#e2e8f0] truncate">{member.name}</div>
                  {member.position && (
                    <div className="text-xs text-[#60a5fa] font-medium mt-0.5">{member.position}</div>
                  )}
                  <div className="text-xs text-[#64748b] mt-1">
                    出場 {member._count.gameStats}試合
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
