'use client'

import { useState, useTransition } from 'react'
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
