'use client'
import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'

const PRESETS: { label: string; color: string | null }[] = [
  { label: 'デフォルト', color: null },
  { label: 'ピンク',     color: '#f472b6' },
  { label: 'パープル',   color: '#a78bfa' },
  { label: 'ブルー',     color: '#60a5fa' },
  { label: 'ティール',   color: '#2dd4bf' },
  { label: 'グリーン',   color: '#4ade80' },
  { label: 'オレンジ',   color: '#fb923c' },
  { label: 'レッド',     color: '#f87171' },
  { label: 'ゴールド',   color: '#facc15' },
]

function hexToRgb(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}
function rgbToHex(r: number, g: number, b: number) {
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

interface Props {
  userId: string
  initialColor: string | null
}

export function ThemeColorPicker({ userId, initialColor }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const initRgb = initialColor ? hexToRgb(initialColor) : { r: 96, g: 165, b: 250 }
  const [r, setR] = useState(initRgb.r)
  const [g, setG] = useState(initRgb.g)
  const [b, setB] = useState(initRgb.b)
  const [useDefault, setUseDefault] = useState(!initialColor)

  const currentHex = rgbToHex(r, g, b)
  const previewColor = useDefault ? '#60a5fa' : currentHex

  const applyPreset = useCallback((color: string | null) => {
    if (color === null) {
      setUseDefault(true)
    } else {
      setUseDefault(false)
      const rgb = hexToRgb(color)
      setR(rgb.r); setG(rgb.g); setB(rgb.b)
    }
  }, [])

  const handleRgbChange = (ch: 'r' | 'g' | 'b', val: number) => {
    setUseDefault(false)
    if (ch === 'r') setR(val)
    else if (ch === 'g') setG(val)
    else setB(val)
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const colorToSave = useDefault ? null : currentHex
      const res = await fetch(`/api/members/${userId}/theme`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ color: colorToSave }),
      })
      if (res.ok) {
        setSaved(true)
        // Next.jsルーターキャッシュをクリアして再レンダリング
        router.refresh()
        setTimeout(() => {
          setOpen(false)
          setSaved(false)
        }, 800)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || `エラー (${res.status})`)
      }
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* トリガーボタン：右上に置く小アイコン */}
      <button
        onClick={() => setOpen(true)}
        title="テーマカラーを変更"
        className="flex items-center justify-center w-8 h-8 rounded-full bg-[#0d1f35]/80 border border-[#1e3a5f] hover:border-[#475569] transition-all text-base shadow-lg backdrop-blur-sm"
      >
        🎨
      </button>

      {/* モーダル：createPortal で <body> 直下にマウントし stacking context を脱出 */}
      {open && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative z-10 bg-[#0d1f35] border border-[#1e3a5f] rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-[#e2e8f0] mb-4">🎨 テーマカラー設定</h3>

            {/* プレビュー */}
            <div className="flex items-center gap-3 mb-5">
              <div
                className="w-14 h-14 rounded-2xl shrink-0 transition-all"
                style={{ background: previewColor, boxShadow: `0 0 0 4px ${previewColor}40` }}
              />
              <div>
                <div className="text-[#e2e8f0] font-mono text-base font-bold">
                  {useDefault ? 'デフォルト' : currentHex.toUpperCase()}
                </div>
                <div className="text-[10px] text-[#64748b] mt-0.5">選択中のカラー</div>
              </div>
            </div>

            {/* プリセット */}
            <div className="mb-5">
              <div className="text-xs font-medium text-[#64748b] mb-2">プリセット</div>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map(p => {
                  const isSelected = p.color === null ? useDefault : (!useDefault && p.color === currentHex)
                  return (
                    <button
                      key={p.label}
                      onClick={() => applyPreset(p.color)}
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-all"
                      style={{
                        borderColor: isSelected ? (p.color || '#60a5fa') : '#1e3a5f',
                        color: isSelected ? '#e2e8f0' : '#94a3b8',
                        background: isSelected ? `${p.color || '#60a5fa'}28` : 'transparent',
                      }}
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ background: p.color || '#334155' }}
                      />
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* RGBスライダー */}
            <div className="mb-5 space-y-3">
              <div className="text-xs font-medium text-[#64748b]">カスタム RGB</div>
              {(['r', 'g', 'b'] as const).map(ch => {
                const val = ch === 'r' ? r : ch === 'g' ? g : b
                const trackColor = ch === 'r' ? '#f87171' : ch === 'g' ? '#4ade80' : '#60a5fa'
                const label = ch === 'r' ? 'R' : ch === 'g' ? 'G' : 'B'
                return (
                  <div key={ch} className="flex items-center gap-3">
                    <span className="text-xs font-bold w-3 shrink-0" style={{ color: trackColor }}>{label}</span>
                    <input
                      type="range" min={0} max={255} value={val}
                      onChange={e => handleRgbChange(ch, Number(e.target.value))}
                      className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, ${trackColor} 0%, ${trackColor} ${(val / 255) * 100}%, #1e3a5f ${(val / 255) * 100}%, #1e3a5f 100%)`,
                        accentColor: trackColor,
                      }}
                    />
                    <span className="text-xs text-[#64748b] font-mono w-8 text-right shrink-0">{val}</span>
                  </div>
                )
              })}
            </div>

            {/* エラー表示 */}
            {error && (
              <div className="mb-3 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            {/* ボタン */}
            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={saving || saved}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
                style={{
                  background: previewColor,
                  opacity: saving || saved ? 0.75 : 1,
                }}
              >
                {saved ? '✓ 保存しました' : saving ? '保存中…' : '保存する'}
              </button>
              <button
                onClick={() => { setOpen(false); setError('') }}
                className="px-4 py-2.5 rounded-xl text-sm text-[#64748b] border border-[#1e3a5f] hover:text-[#94a3b8] transition-all"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
