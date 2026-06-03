'use client'

import type { ReactNode } from 'react'

interface Props {
  message:    string
  className?: string
  children:   ReactNode
}

/** 送信前に確認ダイアログを表示する submit ボタン（フォーム内で使用） */
export function ConfirmSubmitButton({ message, className, children }: Props) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault()
      }}
    >
      {children}
    </button>
  )
}
