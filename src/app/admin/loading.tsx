export default function AdminLoading() {
  return (
    <div className="pt-16 max-w-7xl mx-auto px-4 py-12">
      <div className="h-9 w-64 rounded-lg bg-[#0d1b2a] animate-pulse mb-8" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-10">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="glass-card rounded-xl p-5 h-20 animate-pulse" />
        ))}
      </div>
      <div className="flex items-center justify-center gap-3 py-10 text-[#64748b]">
        <div className="w-6 h-6 rounded-full border-2 border-[#1e3a5f] border-t-[#60a5fa] animate-spin" />
        読み込み中…
      </div>
    </div>
  )
}
