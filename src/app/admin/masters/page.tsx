import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import {
  getMasterList, saveMasterList,
  getGameTypeLabels, GAME_TYPE_KEYS, GAME_TYPE_DEFAULT_LABELS,
} from '@/lib/settings'

export const dynamic = 'force-dynamic'

// ─── 対戦相手マスタ ─────────────────────────────────────────────

async function addOpponent(formData: FormData) {
  'use server'
  const name = String(formData.get('name') || '').trim()
  if (!name) return
  const list = await getMasterList('opponentMaster')
  if (!list.includes(name)) {
    await saveMasterList('opponentMaster', [...list, name].sort())
  }
  revalidatePath('/admin/masters')
}

async function removeOpponent(formData: FormData) {
  'use server'
  const name = String(formData.get('name') || '')
  const list = await getMasterList('opponentMaster')
  await saveMasterList('opponentMaster', list.filter(x => x !== name))
  revalidatePath('/admin/masters')
}

// ─── 球場マスタ ──────────────────────────────────────────────────

async function addLocation(formData: FormData) {
  'use server'
  const name = String(formData.get('name') || '').trim()
  if (!name) return
  const list = await getMasterList('locationMaster')
  if (!list.includes(name)) {
    await saveMasterList('locationMaster', [...list, name].sort())
  }
  revalidatePath('/admin/masters')
}

async function removeLocation(formData: FormData) {
  'use server'
  const name = String(formData.get('name') || '')
  const list = await getMasterList('locationMaster')
  await saveMasterList('locationMaster', list.filter(x => x !== name))
  revalidatePath('/admin/masters')
}

// ─── 試合種別ラベル ──────────────────────────────────────────────

async function updateGameTypeLabels(formData: FormData) {
  'use server'
  for (const key of GAME_TYPE_KEYS) {
    const label = String(formData.get(`label_${key}`) || '').trim()
    if (label) {
      await prisma.setting.upsert({
        where:  { key: `gameTypeLabel_${key}` },
        create: { key: `gameTypeLabel_${key}`, value: label },
        update: { value: label },
      })
    }
  }
  revalidatePath('/admin/masters')
  revalidatePath('/admin/schedule')
  revalidatePath('/schedule')
}

// ─── 初期シード（既存のScheduleデータからマスタを作成）────────────

async function seedMasters(formData: FormData) {
  'use server'
  const target = String(formData.get('target'))

  if (target === 'opponent') {
    const rows = await prisma.schedule.findMany({
      select: { opponent: true },
      distinct: ['opponent'],
      orderBy: { opponent: 'asc' },
    })
    const existing = await getMasterList('opponentMaster')
    const merged = Array.from(new Set([...existing, ...rows.map(r => r.opponent).filter(Boolean)])).sort()
    await saveMasterList('opponentMaster', merged)
  }

  if (target === 'location') {
    const rows = await prisma.schedule.findMany({
      select: { location: true },
      distinct: ['location'],
      orderBy: { location: 'asc' },
    })
    const existing = await getMasterList('locationMaster')
    const merged = Array.from(new Set([...existing, ...rows.map(r => r.location).filter(Boolean)])).sort()
    await saveMasterList('locationMaster', merged)
  }

  revalidatePath('/admin/masters')
}

// ─── Page ────────────────────────────────────────────────────────

export default async function AdminMastersPage() {
  const [opponents, locations, gameTypeLabels] = await Promise.all([
    getMasterList('opponentMaster'),
    getMasterList('locationMaster'),
    getGameTypeLabels(),
  ])

  return (
    <div className="pt-16 max-w-3xl mx-auto px-4 py-12 space-y-10">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin" className="text-[#64748b] hover:text-[#94a3b8]">← 管理</Link>
        <h1 className="text-2xl font-black text-[#e2e8f0]">マスタ管理</h1>
      </div>

      {/* ── 対戦相手マスタ ── */}
      <section className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-[#60a5fa] tracking-widest uppercase">対戦相手マスタ</h2>
          <form action={seedMasters}>
            <input type="hidden" name="target" value="opponent" />
            <button type="submit" className="text-xs text-[#475569] hover:text-[#94a3b8] transition-colors border border-[#1e3a5f] px-2.5 py-1 rounded-lg">
              過去データから取込
            </button>
          </form>
        </div>

        {/* 追加フォーム */}
        <form action={addOpponent} className="flex gap-2 mb-4">
          <input type="text" name="name" placeholder="チーム名を入力" className="flex-1" required />
          <button type="submit" className="btn-primary px-4 py-2 text-sm whitespace-nowrap">追加</button>
        </form>

        {/* 一覧 */}
        {opponents.length === 0 ? (
          <p className="text-xs text-[#475569]">まだ登録がありません。「過去データから取込」か手動で追加してください。</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {opponents.map(name => (
              <div key={name} className="flex items-center gap-1.5 bg-[#0d1b2a] border border-[#1e3a5f] rounded-lg px-3 py-1.5">
                <span className="text-sm text-[#e2e8f0]">{name}</span>
                <form action={removeOpponent}>
                  <input type="hidden" name="name" value={name} />
                  <button type="submit" className="text-[#64748b] hover:text-[#ef4444] transition-colors text-xs leading-none">×</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 球場マスタ ── */}
      <section className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-[#60a5fa] tracking-widest uppercase">球場マスタ</h2>
          <form action={seedMasters}>
            <input type="hidden" name="target" value="location" />
            <button type="submit" className="text-xs text-[#475569] hover:text-[#94a3b8] transition-colors border border-[#1e3a5f] px-2.5 py-1 rounded-lg">
              過去データから取込
            </button>
          </form>
        </div>

        <form action={addLocation} className="flex gap-2 mb-4">
          <input type="text" name="name" placeholder="球場名を入力" className="flex-1" required />
          <button type="submit" className="btn-primary px-4 py-2 text-sm whitespace-nowrap">追加</button>
        </form>

        {locations.length === 0 ? (
          <p className="text-xs text-[#475569]">まだ登録がありません。「過去データから取込」か手動で追加してください。</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {locations.map(name => (
              <div key={name} className="flex items-center gap-1.5 bg-[#0d1b2a] border border-[#1e3a5f] rounded-lg px-3 py-1.5">
                <span className="text-sm text-[#e2e8f0]">{name}</span>
                <form action={removeLocation}>
                  <input type="hidden" name="name" value={name} />
                  <button type="submit" className="text-[#64748b] hover:text-[#ef4444] transition-colors text-xs leading-none">×</button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 試合種別ラベル ── */}
      <section className="glass-card rounded-2xl p-6">
        <h2 className="text-sm font-bold text-[#60a5fa] tracking-widest uppercase mb-1">試合種別ラベル</h2>
        <p className="text-xs text-[#475569] mb-5">日程追加フォームや日程一覧に表示されるラベルを変更できます。</p>
        <form action={updateGameTypeLabels} className="space-y-3">
          {GAME_TYPE_KEYS.map(key => (
            <div key={key} className="flex items-center gap-4">
              <span className="text-xs text-[#64748b] w-28 shrink-0">
                {key}
                <span className="text-[#3b4f6a] ml-1">（デフォルト: {GAME_TYPE_DEFAULT_LABELS[key]}）</span>
              </span>
              <input
                type="text"
                name={`label_${key}`}
                defaultValue={gameTypeLabels[key]}
                placeholder={GAME_TYPE_DEFAULT_LABELS[key]}
                className="flex-1"
              />
            </div>
          ))}
          <button type="submit" className="btn-primary w-full py-2.5 mt-2">ラベルを保存</button>
        </form>
      </section>
    </div>
  )
}
