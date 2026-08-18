'use client'

import { useState } from 'react'
import Image from 'next/image'

interface MemberAvatarProps {
  photoUrl: string | null
  name: string
  number: number | null
  /** sm = 28px, md = 56px, lg = 80px, xl = 96px */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizeClasses = {
  sm: 'w-7 h-7',
  md: 'w-14 h-14',
  lg: 'w-20 h-20',
  xl: 'w-24 h-24',
}

const textClasses = {
  sm: 'text-[10px]',
  md: 'text-sm',
  lg: 'text-xl',
  xl: 'text-2xl',
}

const imageSizes = {
  sm: '28px',
  md: '56px',
  lg: '80px',
  xl: '96px',
}

export function MemberAvatar({ photoUrl, name, number, size = 'md', className = '' }: MemberAvatarProps) {
  const [imgError, setImgError] = useState(false)

  const showFallback = !photoUrl || imgError

  return (
    <div
      className={`${sizeClasses[size]} rounded-full overflow-hidden shrink-0 relative bg-gradient-to-br from-[#1d4ed8] to-[#1e3a5f] flex items-center justify-center ${className}`}
    >
      {!showFallback && (
        <Image
          src={photoUrl!}
          alt={name}
          fill
          sizes={imageSizes[size]}
          className="object-cover"
          onError={() => setImgError(true)}
        />
      )}
      {showFallback && (
        <span className={`font-black text-white relative z-10 ${textClasses[size]}`}>
          {number != null ? `#${number}` : name[0]}
        </span>
      )}
    </div>
  )
}
