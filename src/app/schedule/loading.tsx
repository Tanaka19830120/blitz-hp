function SkeletonCard() {
  return <div className="glass-card rounded-2xl h-48 animate-pulse" />
}

export default function ScheduleLoading() {
  return (
    <div className="pt-16 max-w-4xl mx-auto px-4 py-8">
      <div className="h-7 w-40 rounded bg-[#0d1b2a] animate-pulse mb-6" />
      <div className="flex flex-col gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  )
}
