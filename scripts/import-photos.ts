/**
 * teams.one profile images → public/members/ へダウンロードし DB を更新
 */
import { createClient } from '@libsql/client'
import * as fs from 'fs'
import * as path from 'path'
import 'dotenv/config'

const CDN = 'https://d2evtrak3oey66.cloudfront.net/uploads/team_player/profile_image'

/** 選手ID → CDN パスを組み立て */
function cdnUrl(id: number, filename: string) {
  const digits = String(id).padStart(10, '0').split('').join('/')
  return `${CDN}/${digits}/${id}/${filename}`
}

/** teams.one 名前 → { teamsOneId, filename } */
const PHOTO_MAP: Record<string, { id: number; filename: string }> = {
  'SHUNTA':     { id: 319401, filename: 'profile_imagebb5ad55e-6cb7-45c0-8d34-75777d61825c.jpg' },
  'つーさん':   { id: 413895, filename: 'profile_imagec2f12ecf-5d3f-4468-b4cd-d22644b1cb42.jpg' },
  'けんと':     { id: 529165, filename: 'profile_image544d5273-0beb-4ef6-b4b3-e37e5f8e0b31.png' },
  'KENGO':      { id: 442123, filename: 'profile_image09d7ae73-36ff-4b79-af03-45c8c82c1061.JPG' },
  'えりか':     { id: 399421, filename: 'profile_imagefa6a2c96-7ba4-4b93-8a22-fe68b6a07124.JPG' },
  'ゆか':       { id: 230948, filename: 'profile_image2bc0f14b-ba6d-4d0a-b24e-12fbbd246ab2.jpg' },
  'あやか':     { id: 326885, filename: 'profile_imagef1442659-fe60-4c82-98b2-db5e8dbdb4ad.JPG' },
  'やすは':     { id: 326884, filename: 'profile_image2399c5cc-b8c5-4f08-ab5a-302203cd2723.jpg' },
  'つぼきん':   { id: 5856,   filename: 'profile_image2accd1ce-791f-469d-97c3-d88a0cbed468.jpg' },
  'MASAKI':     { id: 5624,   filename: 'profile_imageb7cbe80f-e300-4fb4-80d9-77ad4c84e762.jpg' },
  'ひかる':     { id: 381796, filename: 'profile_image10601d4d-d590-4430-a56a-416073f8232a.jpg' },
  'とら':       { id: 267386, filename: 'profile_image13c3394b-8c96-4314-b65d-23ad0b6df3d4.jpg' },
  'ゆみ':       { id: 529100, filename: 'profile_image0f22cc19-9173-40cd-80d5-ce7b027e7333.png' },
  'なかしょう': { id: 5811,   filename: 'profile_image3a673c80-bfcc-43d2-ab90-50865720d81b.jpg' },
  'Tanaka':     { id: 260401, filename: 'profile_imaged774c58f-9593-49f6-8884-232e4a5b39ea.JPG' },
  'fa-ta':      { id: 5457,   filename: 'profile_image5ab722f6-e58c-4cf3-91fc-e9b3b413ca8f.jpg' },
  'KAZUHO':     { id: 441162, filename: 'profile_imagefde31159-4ce6-46a8-a56b-3c9733a1c9a6.JPG' },
  'Giwao':      { id: 5846,   filename: 'profile_imagee72d7954-6500-4973-b957-c657e91a394d.jpg' },
  '伸吾':       { id: 543630, filename: 'profile_image65024890-87ad-429b-9dc7-59e6e3215cf1.png' },
  // しんのすけ, K.KAZU, MASA, 北條 は teams.one に写真なし
}

async function download(url: string, dest: string): Promise<boolean> {
  const res = await fetch(url)
  if (!res.ok) { console.error(`  HTTP ${res.status} ${url}`); return false }
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  return true
}

async function main() {
  const client = createClient({
    url: process.env.DATABASE_URL ?? 'file:./dev.db',
    authToken: process.env.DATABASE_AUTH_TOKEN ?? undefined,
  })

  const outDir = path.join(process.cwd(), 'public', 'members')
  fs.mkdirSync(outDir, { recursive: true })

  const { rows } = await client.execute('SELECT id, name FROM "User" ORDER BY name')

  let downloaded = 0, skipped = 0, missing = 0

  for (const row of rows) {
    const userId = String(row[0])
    const name   = String(row[1])
    const data   = PHOTO_MAP[name]

    if (!data) {
      console.log(`  ✗ ${name}: teams.one に写真なし`)
      missing++
      continue
    }

    const url  = cdnUrl(data.id, data.filename)
    const ext  = path.extname(data.filename).toLowerCase()  // .jpg / .png
    const file = `p${data.id}${ext}`                        // p319401.jpg
    const dest = path.join(outDir, file)
    const publicPath = `/members/${file}`

    process.stdout.write(`  ↓ ${name} ... `)
    const ok = await download(url, dest)
    if (!ok) { skipped++; continue }

    const size = Math.round(fs.statSync(dest).size / 1024)
    console.log(`✓  ${publicPath}  (${size} KB)`)

    await client.execute({
      sql: 'UPDATE "User" SET "photoUrl" = ? WHERE "id" = ?',
      args: [publicPath, userId],
    })
    downloaded++
  }

  await client.close()
  console.log(`\n完了: ${downloaded}件ダウンロード / ${missing}件写真なし / ${skipped}件失敗`)
}

main().catch(console.error)
