export default function MembersLoading() {
  return (
    <div className="pt-16 max-w-4xl mx-auto px-4 py-8">
      <div className="h-7 w-32 rounded bg-[#0d1b2a] animate-pulse mb-6" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="glass-card rounded-2xl h-28 animate-pulse" />
        ))}
      </div>
    </div>
  )
}
