'use client'

import { useTransition, useState, useEffect } from 'react'

interface Props {
  scheduleId: string
  sendAction: (fd: FormData) => Promise<void>
}

export function LineSendButton({ scheduleId, sendAction }: Props) {
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<'idle' | 'sent'>('idle')
  const [senderNumber, setSenderNumber] = useState('')
  const [senderName,   setSenderName]   = useState('')

  // localStorage から前回の送信者を復元
  useEffect(() => {
    setSenderNumber(localStorage.getItem('lineSenderNumber') ?? '')
    setSenderName(localStorage.getItem('lineSenderName')   ?? '')
  }, [])

  function handleChange(field: 'number' | 'name', val: string) {
    if (field === 'number') {
      setSenderNumber(val)
      localStorage.setItem('lineSenderNumber', val)
    } else {
      setSenderName(val)
      localStorage.setItem('lineSenderName', val)
    }
  }

  function handleClick() {
    const fd = new FormData()
    fd.append('scheduleId',   scheduleId)
    fd.append('senderName',   senderName.trim())
    fd.append('senderNumber', senderNumber.trim())
    startTransition(async () => {
      await sendAction(fd)
      setStatus('sent')
      setTimeout(() => setStatus('idle'), 4000)
    })
  }

  const inputCls = 'bg-[#0d1b2a] border border-[#1e3a5f] rounded-lg px-2 py-1.5 text-sm text-[#e2e8f0] focus:border-[#22c55e]/60 focus:outline-none'

  return (
    <>
      {/* 送信完了トースト */}
      {status === 'sent' && (
        <div className="fixed top-5 right-5 z-50 bg-[#22c55e] text-white text-sm px-4 py-3 rounded-xl shadow-xl flex items-center gap-2">
          ✅ LINEに送信しました！
        </div>
      )}

      <div className="glass-card rounded-2xl p-4 space-y-3">
        {/* 送信者入力 */}
        <div>
          <p className="text-xs text-[#64748b] mb-1.5">送信者（メッセージ末尾に記載）</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="#番号"
              value={senderNumber}
              onChange={e => handleChange('number', e.target.value)}
              className={`${inputCls} w-16 text-center`}
            />
            <input
              type="text"
              placeholder="名前"
              value={senderName}
              onChange={e => handleChange('name', e.target.value)}
              className={`${inputCls} flex-1`}
            />
          </div>
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
