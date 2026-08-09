export default function RankingLoading() {
  return (
    <div className="pt-16 max-w-4xl mx-auto px-4 py-8">
      <div className="h-7 w-40 rounded bg-[#0d1b2a] animate-pulse mb-6" />
      <div className="glass-card rounded-2xl p-6">
        <div className="flex flex-col gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-10 rounded bg-[#0d1b2a] animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  )
}
