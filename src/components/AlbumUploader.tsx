'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/** 画像を長辺1600px・JPEG品質0.8に圧縮して容量を抑える */
async function compress(file: File): Promise<Blob> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = rej
    r.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = rej
    i.src = dataUrl
  })
  const MAX = 1600
  let { width, height } = img
  if (width > MAX || height > MAX) {
    if (width >= height) { height = Math.round(height * MAX / width); width = MAX }
    else { width = Math.round(width * MAX / height); height = MAX }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
  return new Promise<Blob>((res) => canvas.toBlob(b => res(b!), 'image/jpeg', 0.8))
}

export function AlbumUploader({ albumId }: { albumId: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return

    setBusy(true)
    setError(null)
    setProgress({ done: 0, total: files.length })

    let ok = 0
    for (const file of files) {
      try {
        let body: Blob = file
        if (file.type.startsWith('image/')) {
          try { body = await compress(file) } catch { body = file }
        }
        const fd = new FormData()
        fd.append('file', body, 'photo.jpg')
        fd.append('albumId', albumId)
        const res = await fetch('/api/upload-photo', { method: 'POST', body: fd })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j.error || res.statusText)
        }
        ok++
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
      setProgress(p => ({ ...p, done: p.done + 1 }))
    }

    setBusy(false)
    if (ok > 0) router.refresh()
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFiles}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
      >
        {busy ? `アップロード中… (${progress.done}/${progress.total})` : '📷 写真を追加'}
      </button>
      {error && <p className="text-xs text-[#ef4444] mt-2">⚠ {error}</p>}
      <p className="text-[10px] text-[#475569] mt-1">複数選択できます。自動で圧縮して保存します。</p>
    </div>
  )
}
