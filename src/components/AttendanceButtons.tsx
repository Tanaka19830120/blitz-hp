'use client'

import { useState, useTransition } from 'react'

type Status = 'ATTENDING' | 'ABSENT' | 'MAYBE'

const STATUS_LABEL: Record<Status, string> = {
  ATTENDING: '参加',
  ABSENT:    '欠席',
  MAYBE:     '未定',
}

const STATUS_CONFIRM: Record<Status, string> = {
  ATTENDING: '✓ 参加',
  ABSENT:    '✗ 欠席',
  MAYBE:     '? 未定',
}

interface Props {
  scheduleId:    string
  currentStatus: Status | null
  isMulti:       boolean
  updateAction:  (scheduleId: string, status: Status) => Promise<void>
}

export default function AttendanceButtons({ scheduleId, currentStatus, isMulti, updateAction }: Props) {
  const [pending, startTransition] = useTransition()
  const [confirm, setConfirm] = useState<Status | null>(null)

  function handleClick(status: Status) {
    // 既に同じステータスなら何もしない
    if (status === currentStatus) return
    setConfirm(status)
  }

  function handleConfirm() {
    if (!confirm) return
    const status = confirm
    setConfirm(null)
    startTransition(async () => {
      await updateAction(scheduleId, status)
    })
  }

  return (
    <>
      <div className="flex gap-2">
        <button
          onClick={() => handleClick('ATTENDING')}
          disabled={pending}
          className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all disabled:opacity-40 ${
            currentStatus === 'ATTENDING'
              ? 'bg-green-900/40 border-green-600/50 text-green-400'
              : 'border-[#1e3a5f] text-[#64748b] hover:border-green-600/50 hover:text-green-400'
          }`}>
          ✓ 参加
        </button>
        <button
          onClick={() => handleClick('ABSENT')}
          disabled={pending}
          className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all disabled:opacity-40 ${
            currentStatus === 'ABSENT'
              ? 'bg-red-900/40 border-red-600/50 text-red-400'
              : 'border-[#1e3a5f] text-[#64748b] hover:border-red-600/50 hover:text-red-400'
          }`}>
          ✗ 欠席
        </button>
        <button
          onClick={() => handleClick('MAYBE')}
          disabled={pending}
          className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all disabled:opacity-40 ${
            currentStatus === 'MAYBE'
              ? 'bg-yellow-900/40 border-yellow-600/50 text-yellow-400'
              : 'border-[#1e3a5f] text-[#64748b] hover:border-yellow-600/50 hover:text-yellow-400'
          }`}>
          ? 未定
        </button>
      </div>

      {/* 登録中オーバーレイ */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f2744] border border-[#1e3a5f] rounded-2xl shadow-2xl px-8 py-6 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[#1d4ed8] border-t-transparent rounded-full animate-spin" />
            <p className="text-[#94a3b8] text-sm">登録中...</p>
          </div>
        </div>
      )}

      {/* 確認ダイアログ */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f2744] border border-[#1e3a5f] rounded-2xl shadow-2xl p-6 w-80 mx-4">
            <p className="text-[#e2e8f0] text-base font-semibold mb-1">出欠の登録</p>
            <p className="text-[#94a3b8] text-sm mb-4">
              {currentStatus
                ? <>現在の登録（<span className="text-[#e2e8f0] font-medium">{STATUS_LABEL[currentStatus]}</span>）を
                  <span className="text-[#e2e8f0] font-medium">「{STATUS_LABEL[confirm]}」</span>に変更します。</>
                : <><span className="text-[#e2e8f0] font-medium">「{STATUS_LABEL[confirm]}」</span>で登録します。</>
              }
              {isMulti && <span className="block mt-1 text-[#64748b] text-xs">※ 同日の全試合に適用されます</span>}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 py-2 rounded-lg border border-[#1e3a5f] text-[#64748b] text-sm hover:border-[#2a4a6f] hover:text-[#94a3b8] transition-all">
                キャンセル
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 py-2 rounded-lg bg-[#1d4ed8] text-white text-sm font-medium hover:bg-[#2563eb] transition-all">
                {STATUS_CONFIRM[confirm]}で登録
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
