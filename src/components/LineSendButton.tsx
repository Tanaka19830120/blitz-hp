'use client'

import { useTransition, useState } from 'react'

interface Props {
  scheduleId: string
  sendAction: (fd: FormData) => Promise<void>
}

export function LineSendButton({ scheduleId, sendAction }: Props) {
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<'idle' | 'sent'>('idle')

  function handleClick() {
    const fd = new FormData()
    fd.append('scheduleId', scheduleId)
    startTransition(async () => {
      await sendAction(fd)
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

      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className={`text-sm px-4 py-2 rounded-xl border transition-all ${
          status === 'sent'
            ? 'bg-[#22c55e]/20 border-[#22c55e] text-[#22c55e]'
            : isPending
            ? 'border-[#22c55e]/20 text-[#22c55e]/40 cursor-wait'
            : 'border-[#22c55e]/40 text-[#22c55e] hover:bg-[#22c55e]/10'
        }`}
      >
        {isPending ? '⏳ 送信中...' : status === 'sent' ? '✅ 送信しました' : '📋 LINEにスタメン送信'}
      </button>
    </>
  )
}
