export default function MemberDetailLoading() {
  return (
    <div className="pt-16 max-w-3xl mx-auto px-4 py-8">
      <div className="h-5 w-24 rounded bg-[#0d1b2a] animate-pulse mb-6" />
      <div className="glass-card rounded-2xl p-6 flex gap-6 mb-6">
        <div className="w-20 h-20 rounded-full bg-[#0d1b2a] animate-pulse shrink-0" />
        <div className="flex-1 flex flex-col gap-3">
          <div className="h-6 w-36 rounded bg-[#0d1b2a] animate-pulse" />
          <div className="h-4 w-24 rounded bg-[#0d1b2a] animate-pulse" />
          <div className="h-4 w-48 rounded bg-[#0d1b2a] animate-pulse" />
        </div>
      </div>
      <div className="glass-card rounded-2xl h-48 animate-pulse" />
    </div>
  )
}
