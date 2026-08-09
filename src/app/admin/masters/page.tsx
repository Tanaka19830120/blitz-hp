import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  getMasterList, saveMasterList,
  getGameTypeLabels, GAME_TYPE_KEYS, GAME_TYPE_DEFAULT_LABELS,
} from '@/lib/settings'
import { SubmitButton } from '@/components/SubmitButton'

const mastersToast = (msg: string) => `/admin/masters?toast=${encodeURIComponent(msg)}`

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
  redirect(mastersToast('対戦相手を追加しました'))
}

async function removeOpponent(formData: FormData) {
  'use server'
  const name = String(formData.get('name') || '')
  const list = await getMasterList('opponentMaster')
  await saveMasterList('opponentMaster', list.filter(x => x !== name))
  revalidatePath('/admin/masters')
  redirect(mastersToast('対戦相手を削除しました'))
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
  redirect(mastersToast('球場を追加しました'))
}

async function removeLocation(formData: FormData) {
  'use server'
  const name = String(formData.get('name') || '')
  const list = await getMasterList('locationMaster')
  await saveMasterList('locationMaster', list.filter(x => x !== name))
  revalidatePath('/admin/masters')
  redirect(mastersToast('球場を削除しました'))
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
  redirect(mastersToast('種別ラベルを更新しました'))
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
  redirect(mastersToast('既存データから取り込みました'))
}

// ─── Page ────────────────────────────────────────────────────────

export default async function AdminMastersPage() {
  const [opponents, locations, gameTypeLabels, allUsers] = await Promise.all([
    getMasterList('opponentMaster'),
    getMasterList('locationMaster'),
    getGameTypeLabels(),
    prisma.user.findMany({
      select: { id: true, name: true, number: true, position: true, email: true, isGuest: true, _count: { select: { gameStats: true } } },
      orderBy: [{ number: 'asc' }, { name: 'asc' }],
    }),
  ])

  // カテゴリ分け: 現メンバー(@b・助っ人でない) / 元メンバー(@guest・助っ人でない) / 助っ人(isGuest)
  const currentMembers = allUsers.filter(u => !u.isGuest && u.email.endsWith('@b'))
  const formerMembers  = allUsers.filter(u => !u.isGuest && !u.email.endsWith('@b'))
  const guests         = allUsers.filter(u => u.isGuest)

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-10">
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
          <SubmitButton pendingLabel="追加中…" className="btn-primary px-4 py-2 text-sm whitespace-nowrap">追加</SubmitButton>
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
          <SubmitButton pendingLabel="追加中…" className="btn-primary px-4 py-2 text-sm whitespace-nowrap">追加</SubmitButton>
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
          <SubmitButton pendingLabel="保存中…" className="btn-primary w-full py-2.5 mt-2">ラベルを保存</SubmitButton>
        </form>
      </section>

      {/* ── 選手マスタ ── */}
      <section className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold text-[#60a5fa] tracking-widest uppercase">選手マスタ</h2>
          <span className="text-xs text-[#475569]">計 {allUsers.length}名</span>
        </div>
        <p className="text-xs text-[#475569] mb-5">
          登録されている全選手。名前・背番号の編集は<Link href="/admin/members" className="text-[#60a5fa] hover:underline">メンバー管理</Link>から。
        </p>

        {([
          { label: '現メンバー', list: currentMembers, color: 'text-[#22c55e]', desc: 'ログイン可能な現役メンバー' },
          { label: '元メンバー', list: formerMembers, color: 'text-[#94a3b8]', desc: '過去に在籍（背番号あり・脱退）' },
          { label: '助っ人',     list: guests,        color: 'text-[#a78bfa]', desc: '過去に参加した助っ人（背番号なし）' },
        ] as const).map(({ label, list, color, desc }) => (
          <div key={label} className="mb-5 last:mb-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs font-bold ${color}`}>{label}</span>
              <span className="text-[10px] text-[#475569]">{list.length}名 ・ {desc}</span>
            </div>
            {list.length === 0 ? (
              <p className="text-xs text-[#475569]">（なし）</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {list.map(u => (
                  <Link
                    key={u.id}
                    href={`/admin/members?edit=${u.id}`}
                    className="flex items-center gap-1.5 bg-[#0d1b2a] border border-[#1e3a5f] rounded-lg px-2.5 py-1 text-xs hover:border-[#2563eb]/50 transition-colors"
                    title={`${u.position ?? ''} 試合数${u._count.gameStats}`}
                  >
                    {u.number != null && <span className="text-[#475569]">#{u.number}</span>}
                    <span className="text-[#e2e8f0]">{u.name}</span>
                    {u.position && <span className="text-[#64748b]">{u.position}</span>}
                    <span className="text-[#3b4f6a]">{u._count.gameStats}試</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  )
}
