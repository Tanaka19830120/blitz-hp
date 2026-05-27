'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'

export interface LineupGameStep {
  scheduleId: string
  label:      string   // "第1試合 vs 相手" or "vs 相手"
  href:       string
  saved:      boolean
  isActive:   boolean
}

interface Props {
  games:          LineupGameStep[]
  primaryId:      string
  lineSentAt:     string | null
  lineConfigured: boolean
  senderLabel:    string
  sendAction:     (primaryId: string) => Promise<void>
}

export function LineupProgressPanel({
  games, primaryId, lineSentAt, lineConfigured, senderLabel, sendAction,
}: Props) {
  const allSaved = games.every(g => g.saved)
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle')

  function handleSend() {
    startTransition(async () => {
      try {
        await sendAction(primaryId)
        setStatus('sent')
        setTimeout(() => setStatus('idle'), 4000)
      } catch {
        setStatus('error')
        setTimeout(() => setStatus('idle'), 4000)
      }
    })
  }

  // ── ステップ定義（ゲーム + LINE送信） ──
  const allSteps = [
    ...games.map(g => ({
      key:      g.scheduleId,
      label:    g.label,
      done:     g.saved,
      isActive: g.isActive,
      href:     g.href,
    })),
    {
      key:      '__line',
      label:    'LINE送信',
      done:     status === 'sent' || !!lineSentAt,
      isActive: false,
      href:     '',
    },
  ]

  return (
    <div className="glass-card rounded-2xl p-4 mb-5">
      <p className="text-[10px] font-bold text-[#64748b] tracking-widest uppercase mb-3">進捗</p>

      {/* ── ステップ: モバイル縦 / デスクトップ横 ── */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-y-1 gap-x-1 mb-4">
        {allSteps.map((step, i) => {
          const isLast = i === allSteps.length - 1

          const stepEl = step.href ? (
            <Link
              key={step.key}
              href={step.href}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-all shrink-0 ${
                step.isActive
                  ? 'bg-[#7c3aed]/15 border-[#7c3aed]/60 text-[#a78bfa]'
                  : step.done
                  ? 'border-[#22c55e]/40 bg-[#22c55e]/5 text-[#22c55e]'
                  : 'border-[#1e3a5f] text-[#64748b] hover:border-[#7c3aed]/40'
              }`}
            >
              <span className="text-sm leading-none">{step.done ? '✅' : '○'}</span>
              <span className="leading-none">{step.label}</span>
            </Link>
          ) : (
            <div
              key={step.key}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border shrink-0 ${
                step.done
                  ? 'border-[#22c55e]/40 bg-[#22c55e]/5 text-[#22c55e]'
                  : allSaved && lineConfigured
                  ? 'border-[#2563eb]/50 text-[#60a5fa]'
                  : 'border-[#1e3a5f] text-[#475569]'
              }`}
            >
              <span className="text-sm leading-none">{step.done ? '✅' : '📤'}</span>
              <span className="leading-none">{step.label}</span>
            </div>
          )

          return (
            <div key={step.key} className="flex items-center gap-1 shrink-0">
              {/* 矢印: モバイルは↓、デスクトップは→ */}
              {i > 0 && (
                <span className="text-[#1e3a5f] text-xs select-none">
                  <span className="sm:hidden">↓&nbsp;</span>
                  <span className="hidden sm:inline">→&nbsp;</span>
                </span>
              )}
              {stepEl}
              {/* 最終以外はデスクトップ用末尾→不要 (次のiで先頭→を出す) */}
              {isLast && null}
            </div>
          )
        })}
      </div>

      {/* ── ステータスメッセージ ── */}
      {!allSaved && (
        <p className="text-xs text-[#64748b] mb-3">
          {games.filter(g => !g.saved).map(g => g.label).join('・')} のスタメンを保存してください
        </p>
      )}
      {(status === 'sent' || lineSentAt) && (
        <p className="text-xs text-[#64748b] mb-3">
          最終送信: {new Date(
            status === 'sent' ? new Date().toISOString() : lineSentAt!
          ).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      {/* ── 送信ボタン ── */}
      {lineConfigured && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSend}
            disabled={!allSaved || isPending}
            className={`text-sm px-4 py-2.5 rounded-xl border font-medium transition-all ${
              status === 'sent'
                ? 'bg-[#22c55e]/20 border-[#22c55e] text-[#22c55e]'
                : status === 'error'
                ? 'bg-red-900/20 border-red-500/40 text-red-400'
                : !allSaved || isPending
                ? 'border-[#1e3a5f] text-[#475569] cursor-not-allowed opacity-40'
                : lineSentAt
                ? 'border-[#2563eb]/40 text-[#60a5fa] hover:bg-[#2563eb]/10'
                : 'bg-[#2563eb]/10 border-[#2563eb] text-[#60a5fa] hover:bg-[#2563eb]/20 active:scale-95'
            }`}
          >
            {isPending
              ? '⏳ 送信中…'
              : status === 'sent'
              ? '✅ LINEに送信しました'
              : status === 'error'
              ? '❌ 送信に失敗しました'
              : lineSentAt
              ? `📤 再送信${games.length > 1 ? `（${games.length}試合）` : ''}`
              : games.length > 1
              ? `📤 ${games.length}試合分まとめてLINE送信`
              : '📤 スタメンをLINEに送信'}
          </button>
          {senderLabel && (
            <span className="text-xs text-[#475569]">送信者: {senderLabel}</span>
          )}
        </div>
      )}
    </div>
  )
}
