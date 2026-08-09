function SkeletonRow() {
  return <div className="h-10 rounded bg-[#0d1b2a] animate-pulse" />
}

export default function StatsLoading() {
  return (
    <div className="pt-16 max-w-6xl mx-auto px-4 py-8">
      <div className="h-7 w-32 rounded bg-[#0d1b2a] animate-pulse mb-6" />
      <div className="glass-card rounded-2xl p-6 mb-6">
        <div className="h-5 w-24 rounded bg-[#0d1b2a] animate-pulse mb-4" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      </div>
      <div className="glass-card rounded-2xl p-6">
        <div className="h-5 w-24 rounded bg-[#0d1b2a] animate-pulse mb-4" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      </div>
    </div>
  )
}
