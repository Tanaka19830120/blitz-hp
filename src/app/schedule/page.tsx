import { prisma } from '@/lib/prisma'
import { auth } from '@/auth'
import { revalidatePath } from 'next/cache'

async function updateAttendance(formData: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.id) return

  const scheduleId = String(formData.get('scheduleId'))
  const status = String(formData.get('status')) as 'ATTENDING' | 'ABSENT' | 'MAYBE'

  await prisma.attendance.upsert({
    where: { userId_scheduleId: { userId: session.user.id, scheduleId } },
    create: { userId: session.user.id, scheduleId, status },
    update: { status },
  })
  revalidatePath('/schedule')
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })
}

function statusLabel(status: string) {
  if (status === 'ATTENDING') return { label: '参加', cls: 'badge-attending' }
  if (status === 'ABSENT') return { label: '欠席', cls: 'badge-absent' }
  if (status === 'MAYBE') return { label: '未定', cls: 'badge-pending' }
  return { label: '未回答', cls: 'badge-pending' }
}

export default async function SchedulePage() {
  const session = await auth()
  const now = new Date()

  const schedules = await prisma.schedule.findMany({
    where: { date: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } },
    orderBy: { date: 'asc' },
    include: {
      attendances: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
    take: 20,
  })

  return (
    <div className="pt-16 max-w-7xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-[#e2e8f0] mb-2">日程・出欠</h1>
        <p className="text-[#64748b]">試合・練習の日程と出欠状況</p>
      </div>

      {schedules.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center text-[#64748b]">
          予定されている日程はありません
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {schedules.map((schedule) => {
            const myAttendance = schedule.attendances.find(
              (a) => a.userId === session?.user?.id
            )
            const attending = schedule.attendances.filter((a) => a.status === 'ATTENDING')
            const absent = schedule.attendances.filter((a) => a.status === 'ABSENT')
            const { label, cls } = statusLabel(myAttendance?.status ?? 'PENDING')
            const isPast = new Date(schedule.date) < now

            return (
              <div key={schedule.id} className={`glass-card rounded-2xl p-6 ${isPast ? 'opacity-60' : ''}`}>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${
                        schedule.type === 'REGULAR'
                          ? 'text-[#60a5fa] border-[#1d4ed8]/40 bg-[#1d4ed8]/10'
                          : schedule.type === 'TOURNAMENT'
                            ? 'text-[#fbbf24] border-[#d97706]/40 bg-[#d97706]/10'
                            : 'text-[#94a3b8] border-[#1e3a5f] bg-[#1e3a5f]/20'
                      }`}>
                        {schedule.type === 'REGULAR' ? '公式戦' : schedule.type === 'PRACTICE' ? '練習試合' : 'トーナメント'}
                      </span>
                      {isPast && <span className="text-xs text-[#64748b] border border-[#1e3a5f] px-2 py-0.5 rounded">終了</span>}
                    </div>
                    <div className="text-[#94a3b8] text-sm mb-1">{formatDate(schedule.date)}</div>
                    <div className="text-xl font-bold mb-2">
                      vs <span className="text-[#fbbf24]">{schedule.opponent}</span>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-[#64748b]">
                      <span>📍 {schedule.location}</span>
                      {schedule.meetTime && <span>🕐 集合 {schedule.meetTime}</span>}
                      {schedule.startTime && <span>⚾ 開始 {schedule.startTime}</span>}
                    </div>
                    {schedule.note && (
                      <p className="mt-2 text-sm text-[#94a3b8] bg-[#0d1b2a] rounded-lg px-3 py-2">
                        {schedule.note}
                      </p>
                    )}
                  </div>

                  {/* Attendance */}
                  <div className="flex flex-col gap-3 lg:items-end">
                    {session?.user && !isPast && (
                      <div>
                        <div className="text-xs text-[#64748b] mb-2">あなたの出欠: <span className={cls}>{label}</span></div>
                        <form action={updateAttendance} className="flex gap-2">
                          <input type="hidden" name="scheduleId" value={schedule.id} />
                          <button
                            name="status"
                            value="ATTENDING"
                            type="submit"
                            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                              myAttendance?.status === 'ATTENDING'
                                ? 'bg-green-900/40 border-green-600/50 text-green-400'
                                : 'border-[#1e3a5f] text-[#64748b] hover:border-green-600/50 hover:text-green-400'
                            }`}
                          >
                            ✓ 参加
                          </button>
                          <button
                            name="status"
                            value="ABSENT"
                            type="submit"
                            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                              myAttendance?.status === 'ABSENT'
                                ? 'bg-red-900/40 border-red-600/50 text-red-400'
                                : 'border-[#1e3a5f] text-[#64748b] hover:border-red-600/50 hover:text-red-400'
                            }`}
                          >
                            ✗ 欠席
                          </button>
                          <button
                            name="status"
                            value="MAYBE"
                            type="submit"
                            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                              myAttendance?.status === 'MAYBE'
                                ? 'bg-yellow-900/40 border-yellow-600/50 text-yellow-400'
                                : 'border-[#1e3a5f] text-[#64748b] hover:border-yellow-600/50 hover:text-yellow-400'
                            }`}
                          >
                            ? 未定
                          </button>
                        </form>
                      </div>
                    )}

                    <div className="flex gap-3 text-sm">
                      <span className="text-[#22c55e]">参加 {attending.length}名</span>
                      <span className="text-[#ef4444]">欠席 {absent.length}名</span>
                    </div>

                    {attending.length > 0 && (
                      <div className="text-xs text-[#64748b]">
                        {attending.slice(0, 8).map((a) => a.user.name).join('・')}
                        {attending.length > 8 && ` 他${attending.length - 8}名`}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
