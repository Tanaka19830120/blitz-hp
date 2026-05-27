'use client'

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      style={{
        padding: '4px 14px',
        borderRadius: '8px',
        border: '1px solid #3b82f6',
        background: '#2563eb',
        color: 'white',
        fontSize: '13px',
        cursor: 'pointer',
        fontWeight: 'bold',
      }}
    >
      🖨️ 印刷
    </button>
  )
}
