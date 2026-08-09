import { prisma } from '@/lib/prisma'
import { unstable_noStore as noStore } from 'next/cache'

export default async function LinksPage() {
  noStore()
  const links = await prisma.link.findMany({ orderBy: { order: 'asc' } })

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-[#e2e8f0] mb-2">リンク集</h1>
        <p className="text-[#64748b]">関連サイト・SNSなどへのリンク</p>
      </div>

      {links.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center text-[#64748b]">
          まだリンクが登録されていません
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {links.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="glass-card rounded-2xl overflow-hidden flex items-stretch hover:border-[#2563eb]/40 transition-all group"
            >
              {/* バナー画像 */}
              {link.imageUrl && (
                <div className="w-28 shrink-0 bg-[#0d1f35] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={link.imageUrl}
                    alt={link.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              {/* テキスト情報 */}
              <div className="flex-1 p-5 flex flex-col justify-center gap-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#e2e8f0] group-hover:text-[#60a5fa] transition-colors truncate">
                    {link.title}
                  </span>
                  <span className="text-[#475569] shrink-0 text-sm">↗</span>
                </div>
                {link.description && (
                  <p className="text-sm text-[#64748b] line-clamp-2">{link.description}</p>
                )}
                <p className="text-xs text-[#334155] truncate mt-0.5">{link.url}</p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
