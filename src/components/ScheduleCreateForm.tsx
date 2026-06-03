'use client'

import { useActionState, useEffect, useState, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type ActionResult = { ok: boolean; error?: string } | null

interface Props {
  opponents:  string[]
  locations:  string[]
  types:      readonly string[]
  typeLabels: Record<string, string>
  action:     (prev: ActionResult, formData: FormData) => Promise<ActionResult>
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full py-2.5 disabled:opacity-60">
      {pending ? '保存中…' : '追加する'}
    </button>
  )
}

export function ScheduleCreateForm({ opponents, locations, types, typeLabels, action }: Props) {
  const router = useRouter()
  const [state, formAction] = useActionState<ActionResult, FormData>(action, null)
  const [type, setType] = useState<string>(types[0] ?? 'REGULAR')
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; msg: string } | null>(null)
  const [formKey, setFormKey] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)

  const opponentRequired = type !== 'EVENT'

  useEffect(() => {
    if (!state) return
    if (state.ok) {
      setToast({ kind: 'success', msg: '保存しました' })
      setFormKey(k => k + 1)     // フォームをリセット
      setType(types[0] ?? 'REGULAR')
      router.refresh()           // 登録済み一覧を更新
    } else if (state.error) {
      setToast({ kind: 'error', msg: state.error })
    }
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [state, router, types])

  return (
    <div className="glass-card rounded-2xl p-6 mb-8 relative">
      {/* トースト通知 */}
      {toast && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-xl shadow-lg text-sm font-bold ${
          toast.kind === 'success'
            ? 'bg-[#16a34a] text-white'
            : 'bg-[#dc2626] text-white'
        }`}>
          {toast.kind === 'success' ? '✅ ' : '⚠ '}{toast.msg}
        </div>
      )}

      <form key={formKey} ref={formRef} action={formAction} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">日付 *</label>
            <input type="date" name="date" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">試合種別 *</label>
            <select name="type" value={type} onChange={e => setType(e.target.value)}>
              {types.map(t => <option key={t} value={t}>{typeLabels[t] ?? t}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">
            対戦相手 {opponentRequired ? '*' : <span className="text-[#475569]">（イベントは任意）</span>}
          </label>
          {opponents.length > 0 ? (
            <>
              <select name="opponentSelect" required={opponentRequired} className="mb-2" defaultValue="">
                <option value="">── 選択してください ──</option>
                {opponents.map(o => <option key={o} value={o}>{o}</option>)}
                <option value="__custom__">その他（直接入力）...</option>
              </select>
              <input type="text" name="opponentCustom" placeholder="マスタにない場合は直接入力" className="text-sm" />
              <p className="text-[10px] text-[#475569] mt-1">
                新しいチームを追加するには<Link href="/admin/masters" className="text-[#60a5fa] ml-1 hover:underline">マスタ管理</Link>へ
              </p>
            </>
          ) : (
            <input type="text" name="opponentCustom" required={opponentRequired} placeholder="チーム名" />
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">場所 *</label>
          {locations.length > 0 ? (
            <>
              <select name="locationSelect" required className="mb-2" defaultValue="">
                <option value="">── 選択してください ──</option>
                {locations.map(l => <option key={l} value={l}>{l}</option>)}
                <option value="__custom__">その他（直接入力）...</option>
              </select>
              <input type="text" name="locationCustom" placeholder="マスタにない場合は直接入力" className="text-sm" />
              <p className="text-[10px] text-[#475569] mt-1">
                新しい球場を追加するには<Link href="/admin/masters" className="text-[#60a5fa] ml-1 hover:underline">マスタ管理</Link>へ
              </p>
            </>
          ) : (
            <input type="text" name="locationCustom" required placeholder="球場名" />
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
          <textarea name="note" rows={3} placeholder="備考・注意事項・集合場所など（改行可）" className="w-full resize-y" />
        </div>
        <div className="sm:col-span-2">
          <SubmitButton />
        </div>
      </form>
    </div>
  )
}
