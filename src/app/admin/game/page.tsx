import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'

async function saveGameResult(formData: FormData) {
  'use server'
  const scheduleId = String(formData.get('scheduleId'))
  const ourScore = parseInt(String(formData.get('ourScore')))
  const opponentScore = parseInt(String(formData.get('opponentScore')))

  let result: 'WIN' | 'LOSE' | 'DRAW'
  if (ourScore > opponentScore) result = 'WIN'
  else if (ourScore < opponentScore) result = 'LOSE'
  else result = 'DRAW'

  const game = await prisma.game.upsert({
    where: { scheduleId },
    create: {
      scheduleId,
      ourScore,
      opponentScore,
      result,
      note: String(formData.get('note') || ''),
    },
    update: {
      ourScore,
      opponentScore,
      result,
      note: String(formData.get('note') || ''),
    },
  })

  const players = await prisma.user.findMany({ where: { role: 'PLAYER' } })
  for (const player of players) {
    const atBats = parseInt(String(formData.get(`ab_${player.id}`) || '0')) || 0
    const hits = parseInt(String(formData.get(`h_${player.id}`) || '0')) || 0
    if (atBats > 0 || hits > 0) {
      await prisma.gameStat.upsert({
        where: { userId_gameId: { userId: player.id, gameId: game.id } },
        create: {
          userId: player.id,
          gameId: game.id,
          atBats,
          hits,
          rbi: parseInt(String(formData.get(`rbi_${player.id}`) || '0')) || 0,
          runs: parseInt(String(formData.get(`r_${player.id}`) || '0')) || 0,
          walks: parseInt(String(formData.get(`bb_${player.id}`) || '0')) || 0,
          battingOrder: parseInt(String(formData.get(`order_${player.id}`) || '0')) || null,
          position: String(formData.get(`pos_${player.id}`) || ''),
        },
        update: {
          atBats,
          hits,
          rbi: parseInt(String(formData.get(`rbi_${player.id}`) || '0')) || 0,
          runs: parseInt(String(formData.get(`r_${player.id}`) || '0')) || 0,
          walks: parseInt(String(formData.get(`bb_${player.id}`) || '0')) || 0,
          battingOrder: parseInt(String(formData.get(`order_${player.id}`) || '0')) || null,
          position: String(formData.get(`pos_${player.id}`) || ''),
        },
      })
    }
  }

  revalidatePath('/results')
  revalidatePath('/stats')
  revalidatePath('/')
  redirect('/admin')
}

export default async function AdminGamePage({ searchParams }: { searchParams: Promise<{ scheduleId?: string }> }) {
  const { scheduleId } = await searchParams

  const [schedules, players] = await Promise.all([
    prisma.schedule.findMany({
      where: { game: null },
      orderBy: { date: 'desc' },
      take: 20,
    }),
    prisma.user.findMany({
      where: { role: 'PLAYER' },
      orderBy: [{ number: 'asc' }, { name: 'asc' }],
    }),
  ])

  const selected = scheduleId
    ? await prisma.schedule.findUnique({ where: { id: scheduleId } })
    : schedules[0]

  return (
    <div className="pt-16 max-w-4xl mx-auto px-4 py-12">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin" className="text-[#64748b] hover:text-[#94a3b8]">← 管理</Link>
        <h1 className="text-2xl font-black text-[#e2e8f0]">試合結果を入力</h1>
      </div>

      {schedules.length === 0 && !selected ? (
        <div className="glass-card rounded-2xl p-12 text-center text-[#64748b]">
          結果未入力の試合がありません。
          <Link href="/admin/schedule" className="text-[#60a5fa] ml-2">日程を追加する</Link>
        </div>
      ) : (
        <form action={saveGameResult} className="flex flex-col gap-6">
          {/* Schedule select */}
          <div className="glass-card rounded-2xl p-6">
            <label className="block text-xs font-medium text-[#94a3b8] mb-2">試合を選択 *</label>
            <select name="scheduleId" defaultValue={selected?.id}>
              {schedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {new Date(s.date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })} vs {s.opponent}
                </option>
              ))}
            </select>
          </div>

          {/* Score */}
          <div className="glass-card rounded-2xl p-6">
            <h3 className="text-sm font-bold text-[#94a3b8] mb-4">スコア</h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-xs text-[#64748b] mb-1.5">BLITZ 得点 *</label>
                <input type="number" name="ourScore" min="0" required placeholder="0" className="text-2xl font-black text-center" />
              </div>
              <div>
                <label className="block text-xs text-[#64748b] mb-1.5">相手 得点 *</label>
                <input type="number" name="opponentScore" min="0" required placeholder="0" className="text-2xl font-black text-center" />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-xs text-[#64748b] mb-1.5">コメント</label>
              <input type="text" name="note" placeholder="試合のコメント（任意）" />
            </div>
          </div>

          {/* Player stats */}
          {players.length > 0 && (
            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-sm font-bold text-[#94a3b8] mb-4">個人成績（出場選手のみ入力）</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1e3a5f]">
                      <th className="text-left py-2 px-2 text-xs text-[#64748b]">選手</th>
                      <th className="text-center py-2 px-2 text-xs text-[#64748b]">打数</th>
                      <th className="text-center py-2 px-2 text-xs text-[#64748b]">安打</th>
                      <th className="text-center py-2 px-2 text-xs text-[#64748b]">打点</th>
                      <th className="text-center py-2 px-2 text-xs text-[#64748b]">得点</th>
                      <th className="text-center py-2 px-2 text-xs text-[#64748b]">四球</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((p) => (
                      <tr key={p.id} className="border-b border-[#0d1b2a]">
                        <td className="py-2 px-2 text-[#94a3b8] whitespace-nowrap">
                          {p.number != null && <span className="text-[#60a5fa] mr-1">#{p.number}</span>}
                          {p.name}
                        </td>
                        {['ab', 'h', 'rbi', 'r', 'bb'].map((stat) => (
                          <td key={stat} className="py-1 px-1">
                            <input
                              type="number"
                              name={`${stat}_${p.id}`}
                              min="0"
                              defaultValue="0"
                              className="w-12 text-center py-1 text-sm"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button type="submit" className="btn-primary w-full py-3 text-base">
            結果を保存
          </button>
        </form>
      )}
    </div>
  )
}
