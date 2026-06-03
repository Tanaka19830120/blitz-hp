'use client'

import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

interface Props {
  children:      ReactNode
  pendingLabel?: string
  className?:    string
  /** クリック時に確認ダイアログを出す場合のメッセージ */
  confirm?:      string
}

/** フォーム送信中に「○○中…」を表示する submit ボタン（<form action> 内で使用） */
export function SubmitButton({ children, pendingLabel = '処理中…', className, confirm }: Props) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className ?? ''} disabled:opacity-60 disabled:cursor-wait`}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault() }}
    >
      {pending ? pendingLabel : children}
    </button>
  )
}
