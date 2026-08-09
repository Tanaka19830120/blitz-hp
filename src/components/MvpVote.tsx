'use client'

import { useState, useTransition } from 'react'

interface Candidate { id: string; name: string; number: number | null }
interface VoteCount  { nomineeId: string; count: number }

interface Props {
  gameId:        string
  candidates:    Candidate[]
  voteCounts:    VoteCount[]
  myVoteId:      string | null   // 自分が投票済みの nomineeId（null = 未投票）
  votingOpen:    boolean
  voteAction:    (gameId: string, nomineeId: string) => Promise<void>
}

export default function MvpVote({ gameId, candidates, voteCounts, myVoteId, votingOpen, voteAction }: Props) {
  const [pending, startTransition] = useTransition()
  const [localVote, setLocalVote] = useState(myVoteId)

  const total = voteCounts.reduce((s, v) => s + v.count, 0)
  const getCount = (id: string) => voteCounts.find(v => v.nomineeId === id)?.count ?? 0

  const sorted = [...candidates].sort((a, b) => getCount(b.id) - getCount(a.id))

  function handleVote(nomineeId: string) {
    if (!votingOpen || pending || localVote) return
    startTransition(async () => {
      await voteAction(gameId, nomineeId)
      setLocalVote(nomineeId)
    })
  }

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">🏆</span>
        <h2 className="text-sm font-bold text-[#e2e8f0]">MVP投票</h2>
        {!votingOpen && <span className="text-[10px] text-[#64748b] border border-[#1e3a5f] rounded px-1.5 py-0.5">投票終了</span>}
        {votingOpen && !localVote && <span className="text-[10px] text-[#22c55e] border border-[#22c55e]/40 rounded px-1.5 py-0.5">投票受付中</span>}
        {localVote && <span className="text-[10px] text-[#60a5fa] border border-[#60a5fa]/40 rounded px-1.5 py-0.5">投票済み</span>}
      </div>

      <div className="flex flex-col gap-2">
        {sorted.map((c) => {
          const count  = getCount(c.id)
          const pct    = total > 0 ? Math.round(count / total * 100) : 0
          const isMyVote = localVote === c.id
          const isTop  = sorted[0].id === c.id && count > 0

          return (
            <button
              key={c.id}
              onClick={() => handleVote(c.id)}
              disabled={!votingOpen || !!localVote || pending}
              className={`relative w-full text-left rounded-xl px-4 py-2.5 border transition-all overflow-hidden
                ${isMyVote ? 'border-[#60a5fa]/60 bg-[#1d4ed8]/20' : 'border-[#1e3a5f] hover:border-[#2a4a6f]'}
                ${votingOpen && !localVote ? 'cursor-pointer hover:bg-[#1e3a5f]/50' : 'cursor-default'}
                disabled:opacity-60`}
            >
              {/* 得票バー */}
              {(localVote || !votingOpen) && (
                <div
                  className={`absolute inset-0 rounded-xl transition-all duration-500 ${isTop ? 'bg-[#1d4ed8]/20' : 'bg-[#1e3a5f]/30'}`}
                  style={{ width: `${pct}%` }}
                />
              )}
              <div className="relative flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  {isTop && count > 0 && <span className="text-sm">👑</span>}
                  {isMyVote && <span className="text-[#60a5fa] text-xs">✓</span>}
                  <span className="text-sm text-[#e2e8f0] font-medium">{c.name}</span>
                  {c.number != null && <span className="text-xs text-[#64748b]">#{c.number}</span>}
                </span>
                {(localVote || !votingOpen) && (
                  <span className="text-xs text-[#94a3b8] shrink-0">{count}票 ({pct}%)</span>
                )}
                {votingOpen && !localVote && (
                  <span className="text-xs text-[#60a5fa] shrink-0">投票する →</span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {total > 0 && (
        <p className="text-[10px] text-[#475569] mt-3 text-right">総投票数 {total}票</p>
      )}
      {votingOpen && !localVote && (
        <p className="text-[10px] text-[#475569] mt-2">試合から2週間投票できます。1人1票。</p>
      )}
    </div>
  )
}
