'use client'

import { useTransition, useState } from 'react'

interface Props {
  scheduleId:  string
  sendAction:  (scheduleId: string) => Promise<void>
  senderLabel: string  // 表示用のみ（編集不可）
}

export function LineSendButton({ scheduleId, sendAction, senderLabel }: Props) {
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<'idle' | 'sent'>('idle')

  function handleClick() {
    startTransition(async () => {
      await sendAction(scheduleId)
      setStatus('sent')
      setTimeout(() => setStatus('idle'), 4000)
    })
  }

  return (
    <>
      {/* 送信完了トースト */}
      {status === 'sent' && (
        <div className="fixed top-5 right-5 z-50 bg-[#22c55e] text-white text-sm px-4 py-3 rounded-xl shadow-xl flex items-center gap-2">
          ✅ LINEに送信しました！
        </div>
      )}

      <div className="glass-card rounded-2xl p-4 space-y-3">
        {/* 送信者表示（変更不可） */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[#64748b]">📨 送信者:</span>
          <span className="text-[#94a3b8] font-medium">
            {senderLabel || '（未設定）'}
          </span>
          <span className="text-[#475569] ml-auto">ログインユーザー固定</span>
        </div>

        {/* 送信ボタン */}
        <button
          type="button"
          onClick={handleClick}
          disabled={isPending}
          className={`w-full text-sm px-4 py-2.5 rounded-xl border transition-all ${
            status === 'sent'
              ? 'bg-[#22c55e]/20 border-[#22c55e] text-[#22c55e]'
              : isPending
              ? 'border-[#22c55e]/20 text-[#22c55e]/40 cursor-wait'
              : 'border-[#22c55e]/40 text-[#22c55e] hover:bg-[#22c55e]/10'
          }`}
        >
          {isPending ? '⏳ 送信中...' : status === 'sent' ? '✅ 送信しました' : '📋 LINEにスタメン送信'}
        </button>
      </div>
    </>
  )
}
