/**
 * 全ユーザーのログインIDをメールアドレスから背番号形式に移行
 * - email: `{loginId}@b`（例: 28@b, 07@b, 7@b）
 * - password: bcrypt(`{loginId}{loginId}`)（例: 2828, 0707, 77）
 * - えりか（#7）のみ loginId = '07'（KENGOと区別するため）
 */

import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import bcrypt from 'bcryptjs'
import 'dotenv/config'

const adapter = new PrismaLibSql({
  url: process.env.DATABASE_URL ?? 'file:./dev.db',
  authToken: process.env.DATABASE_AUTH_TOKEN,
})
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0])

async function main() {
  console.log('Updating login credentials...\n')

  const users = await prisma.user.findMany({
    select: { id: true, name: true, number: true, role: true },
    orderBy: { number: 'asc' },
  })

  for (const user of users) {
    if (user.number === null) {
      console.log(`SKIP  ${user.name} (背番号なし)`)
      continue
    }

    // えりか(#7) だけ '07', それ以外は数値をそのまま文字列化
    const loginId = (user.name === 'えりか' && user.number === 7) ? '07' : String(user.number)
    const email = `${loginId}@b`
    const rawPw = `${loginId}${loginId}`
    const password = await bcrypt.hash(rawPw, 10)

    await prisma.user.update({
      where: { id: user.id },
      data: { email, password },
    })

    console.log(`OK    ${user.name.padEnd(10)} #${String(user.number).padStart(2, '0')}  →  ID: ${loginId.padStart(3)}  PW: ${rawPw}`)
  }

  console.log('\nDone!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
