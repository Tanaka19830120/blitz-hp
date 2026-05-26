import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'DP', 'EH']

async function saveLineup(formData: FormData) {
  'use server'
  const scheduleId = String(formData.get('scheduleId'))

  // Get all users
  const users = await prisma.user.findMany({ orderBy: [{ number: 'asc' }, { name: 'asc' }] })

  for (const user of users) {
    const order = formData.get(`order_${user.id}`)
    const pos = formData.get(`pos_${user.id}`)
    const isDH = formData.get(`dh_${user.id}`) === 'on'

    if (order || pos) {
      await prisma.lineup.upsert({
        where: { userId_scheduleId: { userId: user.id, scheduleId } },
        create: {
          userId: user.id,
          scheduleId,
          battingOrder: order ? parseInt(String(order)) || null : null,
          position: String(pos || '') || null,
          isDH,
        },
        update: {
          battingOrder: order ? parseInt(String(order)) || null : null,
          position: String(pos || '') || null,
          isDH,
        },
      })
    } else {
      // Clear lineup entry if no order/position
      await prisma.lineup.deleteMany({
        where: { userId: user.id, scheduleId },
      })
    }
  }

  revalidatePath('/admin/lineup')
  revalidatePath('/schedule')
}

export default async function AdminLineupPage({
  searchParams,
}: {
  searchParams: Promise<{ scheduleId?: string }>
}) {
  const sp = await searchParams

  const [upcomingSchedules, allUsers] = await Promise.all([
    prisma.schedule.findMany({
      where: { date: { gte: new Date() } },
      orderBy: { date: 'asc' },
      take: 10,
    }),
    prisma.user.findMany({
      orderBy: [{ number: 'asc' }, { name: 'asc' }],
    }),
  ])

  const selectedId = sp.scheduleId ?? upcomingSchedules[0]?.id
  const selectedSchedule = selectedId
    ? upcomingSchedules.find((s) => s.id === selectedId) ??
      (await prisma.schedule.findUnique({ where: { id: selectedId } }))
    : null

  const existingLineup = selectedId
    ? await prisma.lineup.findMany({
        where: { scheduleId: selectedId },
        include: { user: true },
        orderBy: { battingOrder: 'asc' },
      })
    : []

  const lineupMap = new Map(existingLineup.map((l) => [l.userId, l]))

  return (
    <div className="pt-16 max-w-4xl mx-auto px-4 py-12">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin" className="text-[#64748b] hover:text-[#94a3b8]">← 管理</Link>
        <h1 className="text-2xl font-black text-[#e2e8f0]">スタメン入力</h1>
      </div>

      {upcomingSchedules.length === 0 && !selectedSchedule ? (
        <div className="glass-card rounded-2xl p-12 text-center text-[#64748b]">
          今後の日程がありません。
          <Link href="/admin/schedule" className="text-[#60a5fa] ml-2">日程を追加する</Link>
        </div>
      ) : (
        <>
          {/* Schedule selector */}
          <div className="glass-card rounded-2xl p-4 mb-6">
            <label className="block text-xs font-medium text-[#94a3b8] mb-2">試合を選択</label>
            <div className="flex flex-wrap gap-2">
              {upcomingSchedules.map((s) => (
                <Link
                  key={s.id}
                  href={`/admin/lineup?scheduleId=${s.id}`}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                    s.id === selectedId
                      ? 'bg-[#2563eb] border-[#2563eb] text-white'
                      : 'border-[#1e3a5f] text-[#64748b] hover:border-[#2563eb]/50'
                  }`}
                >
                  {new Date(s.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })} vs {s.opponent}
                </Link>
              ))}
            </div>
          </div>

          {selectedSchedule && (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="text-[#e2e8f0] font-bold">
                  {new Date(selectedSchedule.date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
                  <span className="text-[#fbbf24] ml-2">vs {selectedSchedule.opponent}</span>
                </div>
                <span className="text-xs text-[#64748b]">📍 {selectedSchedule.location}</span>
              </div>

              <form action={saveLineup} className="glass-card rounded-2xl p-6">
                <input type="hidden" name="scheduleId" value={selectedSchedule.id} />
                <p className="text-xs text-[#64748b] mb-4">
                  打順と守備位置を入力してください。DH・DPの場合はチェックを入れてください。9名を超えて入力可能です（DH/DP対応）。
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#1e3a5f] text-xs text-[#64748b]">
                        <th className="text-left py-2 px-2">選手</th>
                        <th className="text-center py-2 px-2 w-20">打順</th>
                        <th className="text-center py-2 px-2 w-28">守備位置</th>
                        <th className="text-center py-2 px-2 w-16">DH/DP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allUsers.map((user) => {
                        const entry = lineupMap.get(user.id)
                        return (
                          <tr key={user.id} className="border-b border-[#0d1b2a] hover:bg-[#1e3a5f]/10">
                            <td className="py-2 px-2 text-[#94a3b8]">
                              {user.number != null && (
                                <span className="text-[#60a5fa] text-xs mr-2">#{user.number}</span>
                              )}
                              {user.name}
                            </td>
                            <td className="py-1 px-1">
                              <input
                                type="number"
                                name={`order_${user.id}`}
                                min="1"
                                max="20"
                                defaultValue={entry?.battingOrder ?? ''}
                                placeholder="–"
                                className="w-16 text-center py-1 text-sm"
                              />
                            </td>
                            <td className="py-1 px-1">
                              <select
                                name={`pos_${user.id}`}
                                defaultValue={entry?.position ?? ''}
                                className="w-full py-1 text-sm"
                              >
                                <option value="">–</option>
                                {POSITIONS.map((p) => (
                                  <option key={p} value={p}>{p}</option>
                                ))}
                              </select>
                            </td>
                            <td className="py-1 px-1 text-center">
                              <input
                                type="checkbox"
                                name={`dh_${user.id}`}
                                defaultChecked={entry?.isDH ?? false}
                                className="w-4 h-4 accent-[#2563eb]"
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6">
                  <button type="submit" className="btn-primary w-full py-2.5">
                    スタメンを保存
                  </button>
                </div>
              </form>

              {/* Preview */}
              {existingLineup.length > 0 && (
                <div className="glass-card rounded-2xl p-5 mt-4">
                  <h3 className="text-xs font-bold text-[#60a5fa] tracking-wider uppercase mb-3">
                    登録済みスタメン
                  </h3>
                  <div className="space-y-2">
                    {existingLineup
                      .filter((l) => l.battingOrder != null)
                      .sort((a, b) => (a.battingOrder ?? 99) - (b.battingOrder ?? 99))
                      .map((l) => (
                        <div key={l.id} className="flex items-center gap-3 text-sm">
                          <span className="w-6 text-right text-[#60a5fa] font-bold">{l.battingOrder}</span>
                          <span className="w-12 text-xs text-[#64748b]">{l.position ?? '–'}</span>
                          <span className="text-[#e2e8f0]">{l.user.name}</span>
                          {l.user.number != null && (
                            <span className="text-xs text-[#475569]">#{l.user.number}</span>
                          )}
                          {l.isDH && <span className="text-xs text-[#fbbf24]">DH</span>}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
