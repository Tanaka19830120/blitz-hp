export default function ResultsLoading() {
  return (
    <div className="pt-16 max-w-7xl mx-auto px-4 py-12">
      <div className="h-9 w-40 rounded-lg bg-[#0d1b2a] animate-pulse mb-6" />
      <div className="flex gap-2 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-16 rounded-full bg-[#0d1b2a] animate-pulse" />
        ))}
      </div>
      <div className="glass-card rounded-2xl h-24 animate-pulse mb-8" />
      <div className="flex flex-col gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="glass-card rounded-2xl h-28 animate-pulse" />
        ))}
      </div>
    </div>
  )
}
