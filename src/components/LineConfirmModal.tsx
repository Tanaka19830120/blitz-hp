'use client'

interface Props {
  isOpen:    boolean
  title:     string
  preview:   string
  onConfirm: () => void
  onCancel:  () => void
  isPending: boolean
}

export function LineConfirmModal({ isOpen, title, preview, onConfirm, onCancel, isPending }: Props) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="bg-[#0d1b2a] border border-[#1e3a5f] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e3a5f]">
          <div>
            <h2 className="text-sm font-bold text-[#e2e8f0]">📤 {title}</h2>
            <p className="text-xs text-[#64748b] mt-0.5">以下の内容をLINEグループに送信します</p>
          </div>
          <button
            onClick={onCancel}
            className="text-[#64748b] hover:text-[#94a3b8] transition-colors text-lg leading-none p-1"
          >
            ✕
          </button>
        </div>

        {/* プレビュー */}
        <div className="px-5 py-4">
          <pre className="text-xs text-[#e2e8f0] whitespace-pre-wrap bg-[#050a15] rounded-xl p-4 border border-[#1e3a5f] max-h-60 sm:max-h-80 overflow-y-auto leading-relaxed font-sans">
            {preview}
          </pre>
        </div>

        {/* ボタン */}
        <div className="px-5 pb-5 flex gap-3 justify-end border-t border-[#1e3a5f] pt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="text-sm px-4 py-2.5 rounded-xl border border-[#1e3a5f] text-[#64748b] hover:text-[#94a3b8] hover:border-[#64748b]/50 transition-all"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="text-sm px-5 py-2.5 rounded-xl bg-[#2563eb] border border-[#2563eb] text-white font-medium hover:bg-[#3b82f6] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? '⏳ 送信中…' : '✓ 送信する'}
          </button>
        </div>
      </div>
    </div>
  )
}
