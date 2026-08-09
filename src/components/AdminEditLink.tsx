'use client'

import { useSession } from 'next-auth/react'
import Link from 'next/link'

export default function AdminEditLink({ scheduleId }: { scheduleId: string }) {
  const { data: session } = useSession()
  const isAdmin = (session?.user as { role?: string })?.role === 'ADMIN'
  if (!isAdmin) return null
  return (
    <Link
      href={`/admin/game?id=${scheduleId}`}
      className="text-xs px-3 py-1.5 rounded-lg border border-[#1e3a5f] text-[#64748b] hover:border-[#2a4a6f] hover:text-[#94a3b8] transition-all">
      ✏ 編集
    </Link>
  )
}
