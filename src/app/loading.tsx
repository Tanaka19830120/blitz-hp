export default function Loading() {
  return (
    <div className="pt-16 min-h-[60vh] flex flex-col items-center justify-center gap-4">
      <div className="w-10 h-10 rounded-full border-2 border-[#1e3a5f] border-t-[#60a5fa] animate-spin" />
      <p className="text-sm text-[#64748b]">読み込み中…</p>
    </div>
  )
}
