import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'

async function createSchedule(formData: FormData) {
  'use server'
  const date = String(formData.get('date'))
  const dateTime = new Date(`${date}T00:00:00`)

  const meetTime = String(formData.get('meetTime') || '').trim()
  const startTime = String(formData.get('startTime') || '').trim()
  const typeRaw = String(formData.get('type') || 'PRACTICE')
  const type = (['REGULAR', 'PRACTICE', 'TOURNAMENT', 'EVENT'].includes(typeRaw) ? typeRaw : 'REGULAR') as 'REGULAR' | 'PRACTICE' | 'TOURNAMENT' | 'EVENT'

  await prisma.schedule.create({
    data: {
      date: dateTime,
      opponent: String(formData.get('opponent')),
      location: String(formData.get('location')),
      type,
      meetTime: meetTime || null,
      startTime: startTime || null,
      note: String(formData.get('note') || '') || null,
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
  const [schedules, opponentList, locationList] = await Promise.all([
    prisma.schedule.findMany({
      orderBy: { date: 'desc' },
      take: 30,
      include: { game: { select: { id: true } } },
    }),
    prisma.schedule.findMany({
      select: { opponent: true },
      distinct: ['opponent'],
      orderBy: { opponent: 'asc' },
    }),
    prisma.schedule.findMany({
      select: { location: true },
      distinct: ['location'],
      orderBy: { location: 'asc' },
    }),
  ])

  const opponents = opponentList.map((s) => s.opponent).filter(Boolean)
  const locations = locationList.map((s) => s.location).filter(Boolean)

  return (
    <div className="pt-16 max-w-4xl mx-auto px-4 py-12">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin" className="text-[#64748b] hover:text-[#94a3b8]">← 管理</Link>
        <h1 className="text-2xl font-black text-[#e2e8f0]">日程を追加</h1>
      </div>

      {/* datalists for autocomplete */}
      <datalist id="opponents-list">
        {opponents.map((o) => <option key={o} value={o} />)}
      </datalist>
      <datalist id="locations-list">
        {locations.map((l) => <option key={l} value={l} />)}
      </datalist>

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
                <option value="REGULAR">公式戦（SDリーグ）</option>
                <option value="TOURNAMENT">トーナメント・大会</option>
                <option value="PRACTICE">練習試合</option>
                <option value="EVENT">イベント（BBQ・レクなど）</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">対戦相手 *</label>
            <input
              type="text"
              name="opponent"
              required
              placeholder="チーム名"
              list="opponents-list"
            />
            {opponents.length > 0 && (
              <p className="text-[10px] text-[#475569] mt-1">過去の対戦相手から選択可</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">場所 *</label>
            <input
              type="text"
              name="location"
              required
              placeholder="球場名"
              list="locations-list"
            />
            {locations.length > 0 && (
              <p className="text-[10px] text-[#475569] mt-1">過去の場所から選択可</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">集合時間</label>
            <input type="time" name="meetTime" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">試合開始</label>
            <input type="time" name="startTime" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">メモ・備考</label>
            <input type="text" name="note" placeholder="備考・注意事項・集合場所など" />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary w-full py-2.5">追加する</button>
          </div>
        </form>
      </div>

      <h2 className="text-xs font-bold tracking-[0.3em] text-[#60a5fa] uppercase mb-4">
        登録済み日程（直近30件）
      </h2>
      <div className="flex flex-col gap-2">
        {schedules.map((s) => (
          <div key={s.id} className="glass-card rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-sm font-medium text-[#e2e8f0]">vs {s.opponent}</span>
              <span className="text-xs text-[#64748b] ml-3">
                {new Date(s.date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })}
              </span>
              <span className="text-xs text-[#475569] ml-2">📍 {s.location}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={`text-xs ${
                s.type === 'REGULAR' ? 'text-[#60a5fa]' :
                s.type === 'TOURNAMENT' ? 'text-[#fbbf24]' :
                s.type === 'EVENT' ? 'text-[#a78bfa]' : 'text-[#94a3b8]'
              }`}>
                {s.type === 'REGULAR' ? '公式戦' : s.type === 'TOURNAMENT' ? '大会' : s.type === 'EVENT' ? 'イベント' : '練習'}
              </span>
              {!s.game && (
                <form action={deleteSchedule}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className="text-xs text-[#ef4444]/60 hover:text-[#ef4444] transition-colors">
                    削除
                  </button>
                </form>
              )}
              {s.game && <span className="text-xs text-[#22c55e]">✓</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
