'use client'

import { useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { LineConfirmModal } from './LineConfirmModal'

interface Props {
  label:         string
  buttonClass?:  string
  previewAction: () => Promise<string>
  sendAction:    () => Promise<void>
}

export function LineAdminButton({ label, buttonClass, previewAction, sendAction }: Props) {
  const [showModal,  setShowModal]  = useState(false)
  const [preview,    setPreview]    = useState('')
  const [isLoading,  setLoading]    = useState(false)
  const [isPending,  startTransition] = useTransition()
  const [sent,       setSent]       = useState(false)
  const [toast,      setToast]      = useState<string | null>(null)
  const [mounted,    setMounted]    = useState(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  async function handleClick() {
    setLoading(true)
    try {
      const text = await previewAction()
      setPreview(text)
      setShowModal(true)
    } finally {
      setLoading(false)
    }
  }

  function handleConfirm() {
    setShowModal(false)
    startTransition(async () => {
      await sendAction()
      setSent(true)
      setToast('LINEに送信しました')
      setTimeout(() => setSent(false), 4000)
    })
  }

  return (
    <>
      <LineConfirmModal
        isOpen={showModal}
        title={label}
        preview={preview}
        onConfirm={handleConfirm}
        onCancel={() => setShowModal(false)}
        isPending={isPending}
      />

      {mounted && toast && createPortal(
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[9999] px-5 py-2.5 rounded-xl shadow-lg text-sm font-bold bg-[#16a34a] text-white">
          ✅ {toast}
        </div>,
        document.body
      )}

      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading || isPending}
        className={buttonClass ?? 'text-xs px-3 py-1 rounded-lg border transition-all'}
      >
        {isLoading  ? '⏳ 読込中…' :
         isPending  ? '⏳ 送信中…' :
         sent       ? '✅ 送信しました' :
         label}
      </button>
    </>
  )
}
