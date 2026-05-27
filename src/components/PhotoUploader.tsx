'use client'

import { useState, useRef } from 'react'

interface Props {
  defaultUrl?: string
  name?: string  // hidden input の name（デフォルト: "photoUrl"）
}

export function PhotoUploader({ defaultUrl = '', name = 'photoUrl' }: Props) {
  const [url, setUrl]         = useState(defaultUrl)
  const [preview, setPreview] = useState(defaultUrl)
  const [uploading, setUploading] = useState(false)
  const [error, setError]     = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // プレビュー即時表示
    const localUrl = URL.createObjectURL(file)
    setPreview(localUrl)
    setUploading(true)
    setError('')

    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload-image', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Upload failed')
      setUrl(json.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'アップロードに失敗しました')
      setPreview(defaultUrl)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      {/* hidden input — フォーム送信時にURLが含まれる */}
      <input type="hidden" name={name} value={url} />

      <div className="flex items-center gap-3">
        {/* プレビュー */}
        <div className="w-14 h-14 rounded-full overflow-hidden bg-[#1e3a5f] flex items-center justify-center shrink-0">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[#475569] text-xl">👤</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* ファイル選択ボタン */}
          <label className={`inline-flex items-center gap-1.5 cursor-pointer px-3 py-1.5 rounded-lg text-xs border transition-all ${
            uploading
              ? 'border-[#1e3a5f] text-[#475569] cursor-not-allowed'
              : 'border-[#1e3a5f] text-[#60a5fa] hover:bg-[#1e3a5f]/50'
          }`}>
            {uploading ? '⬆ アップロード中...' : '📁 ファイルを選択'}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              onChange={handleFile}
              disabled={uploading}
              className="hidden"
            />
          </label>

          {/* エラー */}
          {error && (
            <p className="text-xs text-[#ef4444] mt-1">{error}</p>
          )}

          {/* アップロード済みURL（短縮表示） */}
          {url && !error && (
            <p className="text-[10px] text-[#475569] mt-1 truncate">
              ✓ {url.split('/').pop()}
            </p>
          )}

          {/* URLを直接入力する場合のリンク */}
          {!url && !uploading && (
            <button
              type="button"
              className="text-[10px] text-[#475569] hover:text-[#94a3b8] mt-1 block"
              onClick={() => {
                const v = prompt('画像URLを入力してください')
                if (v) { setUrl(v); setPreview(v) }
              }}
            >
              URLで指定する
            </button>
          )}
        </div>

        {/* クリアボタン */}
        {(url || preview) && (
          <button
            type="button"
            onClick={() => { setUrl(''); setPreview('') }}
            className="text-xs text-[#475569] hover:text-[#ef4444] transition-colors shrink-0"
            title="画像を削除"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
