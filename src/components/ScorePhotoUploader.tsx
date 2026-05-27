'use client'

import { useState, useRef, useTransition } from 'react'

interface Props {
  scheduleId:      string
  currentPhotoUrl: string | null
  savePhotoAction: (scheduleId: string, photoUrl: string) => Promise<void>
}

export function ScorePhotoUploader({ scheduleId, currentPhotoUrl, savePhotoAction }: Props) {
  const [preview, setPreview]       = useState<string | null>(currentPhotoUrl)
  const [isUploading, setUploading] = useState(false)
  const [status, setStatus]         = useState<'idle' | 'saved' | 'error'>('idle')
  const [errMsg, setErrMsg]         = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [, startTransition] = useTransition()

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // 即プレビュー表示
    const reader = new FileReader()
    reader.onload = ev => setPreview(ev.target?.result as string)
    reader.readAsDataURL(file)

    setUploading(true)
    setStatus('idle')
    setErrMsg('')

    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('scheduleId', scheduleId)

      const res = await fetch('/api/upload-score-photo', { method: 'POST', body: fd })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(body.error ?? res.statusText)
      }
      const { url } = await res.json()

      startTransition(async () => {
        await savePhotoAction(scheduleId, url)
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 3500)
      })
    } catch (err) {
      setErrMsg(String(err))
      setStatus('error')
      setTimeout(() => setStatus('idle'), 5000)
    } finally {
      setUploading(false)
      // input をリセット（同じファイルを再選択できるように）
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div>
      <h3 className="text-xs font-bold text-[#94a3b8] tracking-widest uppercase mb-3">
        📷 スコア表写真
      </h3>

      {/* プレビュー */}
      {preview && (
        <div className="mb-3 rounded-xl overflow-hidden border border-[#1e3a5f]">
          <img
            src={preview}
            alt="スコア表"
            className="w-full max-h-[28rem] object-contain bg-[#0d1b2a]"
          />
        </div>
      )}

      {/* アップロードボタン */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          id={`score-photo-${scheduleId}`}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          disabled={isUploading}
          className="hidden"
        />
        <label
          htmlFor={`score-photo-${scheduleId}`}
          className={`inline-flex items-center gap-2 cursor-pointer text-sm px-4 py-2 rounded-xl border transition-all select-none ${
            isUploading
              ? 'border-[#2563eb]/20 text-[#60a5fa]/40 cursor-wait'
              : 'border-[#1e3a5f] text-[#64748b] hover:text-[#94a3b8] hover:border-[#64748b]/50 active:scale-95'
          }`}
        >
          {isUploading
            ? <><span className="animate-spin">⏳</span> アップロード中…</>
            : preview
            ? <>📷 撮り直す / 選び直す</>
            : <>📷 スコア表を撮影 · 選択</>}
        </label>

        {status === 'saved' && (
          <span className="text-xs text-[#22c55e]">✅ 保存しました</span>
        )}
        {status === 'error' && (
          <span className="text-xs text-[#f87171]">❌ {errMsg || 'アップロード失敗'}</span>
        )}
      </div>

      <p className="mt-2 text-[10px] text-[#475569]">
        スマホのカメラで直接撮影、またはギャラリーから選択できます。
        保存後、試合詳細ページに表示されます。
      </p>
    </div>
  )
}
