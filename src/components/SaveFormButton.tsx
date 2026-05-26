'use client'

import { useFormStatus } from 'react-dom'
import { useState, useEffect, useRef } from 'react'

interface Props {
  label?: string
  className?: string
}

export function SaveFormButton({ label = '保存する', className = 'btn-primary w-full py-2.5' }: Props) {
  const { pending } = useFormStatus()
  const [saved, setSaved] = useState(false)
  const prevRef = useRef(false)

  useEffect(() => {
    if (prevRef.current && !pending) {
      setSaved(true)
      const t = setTimeout(() => setSaved(false), 3000)
      return () => clearTimeout(t)
    }
    prevRef.current = pending
  }, [pending])

  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className} disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
        saved ? '!bg-[#16a34a] !border-[#16a34a]' : ''
      }`}
    >
      {pending ? '保存中...' : saved ? '✓ 保存しました' : label}
    </button>
  )
}
