'use client'

import { useState, useEffect, useCallback } from 'react'
import PhotoLikeButton from './PhotoLikeButton'

export interface PhotoData {
  id: string
  url: string
  uploadedByName?: string | null
  likeCount: number
  liked: boolean
  canDelete: boolean
}

interface Props {
  photos:       PhotoData[]
  toggleAction: (photoId: string) => Promise<void>
  deleteAction: (photoId: string, albumId: string) => Promise<void>
  albumId:      string
}

function Lightbox({
  photos, index, onClose, onPrev, onNext, toggleAction,
}: {
  photos: PhotoData[]; index: number
  onClose: () => void; onPrev: () => void; onNext: () => void
  toggleAction: (photoId: string) => Promise<void>
}) {
  const photo = photos[index]

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft')  onPrev()
      if (e.key === 'ArrowRight') onNext()
      if (e.key === 'Escape')     onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onPrev, onNext, onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <button onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl z-10 w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-all">
        ✕
      </button>
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-sm z-10">
        {index + 1} / {photos.length}
      </div>
      {photos.length > 1 && (
        <button onClick={e => { e.stopPropagation(); onPrev() }}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 flex items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/70 hover:text-white transition-all text-xl">
          ‹
        </button>
      )}
      <div className="max-w-4xl max-h-[80vh] mx-16 flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={photo.id} src={photo.url} alt=""
          className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-2xl" />
        <div className="flex items-center justify-between gap-4 w-full px-1">
          <span className="text-white/60 text-xs">
            {photo.uploadedByName ? `📷 ${photo.uploadedByName}` : ''}
          </span>
          <PhotoLikeButton photoId={photo.id} count={photo.likeCount} liked={photo.liked} toggleAction={toggleAction} />
        </div>
      </div>
      {photos.length > 1 && (
        <button onClick={e => { e.stopPropagation(); onNext() }}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 flex items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/70 hover:text-white transition-all text-xl">
          ›
        </button>
      )}
    </div>
  )
}

export default function PhotoGrid({ photos, toggleAction, deleteAction, albumId }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  const prev = useCallback(() => setOpenIndex(i => i === null ? null : (i - 1 + photos.length) % photos.length), [photos.length])
  const next = useCallback(() => setOpenIndex(i => i === null ? null : (i + 1) % photos.length), [photos.length])

  async function handleDelete(photoId: string) {
    if (!window.confirm('この写真を削除しますか？')) return
    setPending(photoId)
    await deleteAction(photoId, albumId)
    setPending(null)
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {photos.map((p, idx) => (
          <div key={p.id} className="relative group glass-card rounded-xl overflow-hidden">
            <button onClick={() => setOpenIndex(idx)}
              className="block w-full aspect-square bg-[#0d1b2a] cursor-zoom-in">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" loading="lazy"
                className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" />
            </button>
            <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/70 to-transparent flex items-end justify-between gap-1">
              {p.uploadedByName && (
                <span className="text-[10px] text-white/90">📷 {p.uploadedByName}</span>
              )}
              <span className="shrink-0">
                <PhotoLikeButton photoId={p.id} count={p.likeCount} liked={p.liked} toggleAction={toggleAction} />
              </span>
            </div>
            {p.canDelete && (
              <button
                onClick={() => handleDelete(p.id)}
                disabled={pending === p.id}
                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/60 text-white text-xs hover:bg-[#ef4444] transition-colors disabled:opacity-50"
              >
                {pending === p.id ? '…' : '✕'}
              </button>
            )}
          </div>
        ))}
      </div>

      {openIndex !== null && (
        <Lightbox
          photos={photos}
          index={openIndex}
          onClose={() => setOpenIndex(null)}
          onPrev={prev}
          onNext={next}
          toggleAction={toggleAction}
        />
      )}
    </>
  )
}
