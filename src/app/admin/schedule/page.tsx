import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'

async function createSchedule(formData: FormData) {
  'use server'
  const date = String(formData.get('date'))
  const time = String(formData.get('time') || '00:00')
  const dateTime = new Date(`${date}T${time}:00`)

  await prisma.schedule.create({
    data: {
      date: dateTime,
      opponent: String(formData.get('opponent')),
      location: String(formData.get('location')),
      type: String(formData.get('type')) as 'REGULAR' | 'PRACTICE' | 'TOURNAMENT',
      meetTime: String(formData.get('meetTime') || ''),
      startTime: String(formData.get('startTime') || ''),
      note: String(formData.get('note') || ''),
    },
  })
  revalidatePath('/schedule')
  revalidatePath('/admin')
  redirect('/admin')
}

async function deleteSchedule(formData: FormData) {
  'use server'
  const id = String(formData.get('id'))
  await prisma.schedule.delete({ where: { id } })
  revalidatePath('/schedule')
  revalidatePath('/admin')
}

export default async function AdminSchedulePage() {
  const schedules = await prisma.schedule.findMany({
    orderBy: { date: 'desc' },
    take: 20,
    include: { game: { select: { id: true } } },
  })

  return (
    <div className="pt-16 max-w-4xl mx-auto px-4 py-12">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin" className="text-[#64748b] hover:text-[#94a3b8]">← 管理</Link>
        <h1 className="text-2xl font-black text-[#e2e8f0]">日程を追加</h1>
      </div>

      <div className="glass-card rounded-2xl p-6 mb-8">
        <form action={createSchedule} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">日付 *</label>
              <input type="date" name="date" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">試合種別 *</label>
              <select name="type">
                <option value="REGULAR">公式戦</option>
                <option value="PRACTICE">練習試合</option>
                <option value="TOURNAMENT">トーナメント</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">対戦相手 *</label>
            <input type="text" name="opponent" required placeholder="チーム名" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">場所 *</label>
            <input type="text" name="location" required placeholder="球場名" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">集合時間</label>
            <input type="text" name="meetTime" placeholder="例: 8:30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">試合開始</label>
            <input type="text" name="startTime" placeholder="例: 10:00" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">メモ</label>
            <input type="text" name="note" placeholder="備考・注意事項など" />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary w-full py-2.5">追加する</button>
          </div>
        </form>
      </div>

      <h2 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase mb-4">登録済み日程</h2>
      <div className="flex flex-col gap-2">
        {schedules.map((s) => (
          <div key={s.id} className="glass-card rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <span className="text-sm font-medium text-[#e2e8f0]">vs {s.opponent}</span>
              <span className="text-xs text-[#64748b] ml-3">
                {new Date(s.date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })}
              </span>
            </div>
            {!s.game && (
              <form action={deleteSchedule}>
                <input type="hidden" name="id" value={s.id} />
                <button type="submit" className="text-xs text-[#ef4444]/60 hover:text-[#ef4444] transition-colors">
                  削除
                </button>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
