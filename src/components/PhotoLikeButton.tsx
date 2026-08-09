'use client'

import { useState, useTransition } from 'react'

interface Props {
  photoId:      string
  count:        number
  liked:        boolean
  toggleAction: (photoId: string) => Promise<void>
}

export default function PhotoLikeButton({ photoId, count, liked, toggleAction }: Props) {
  const [localLiked, setLocalLiked] = useState(liked)
  const [localCount, setLocalCount] = useState(count)
  const [pending, startTransition]  = useTransition()

  function handleClick() {
    if (pending) return
    const next = !localLiked
    startTransition(async () => {
      await toggleAction(photoId)
      setLocalLiked(next)
      setLocalCount(c => next ? c + 1 : c - 1)
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all
        ${localLiked
          ? 'bg-[#ef4444]/20 border border-[#ef4444]/40 text-[#ef4444]'
          : 'bg-[#1e3a5f]/60 border border-[#1e3a5f] text-[#64748b] hover:border-[#ef4444]/40 hover:text-[#ef4444]'
        } disabled:opacity-60`}
    >
      <span>{localLiked ? '❤️' : '🤍'}</span>
      {localCount > 0 && <span>{localCount}</span>}
    </button>
  )
}
