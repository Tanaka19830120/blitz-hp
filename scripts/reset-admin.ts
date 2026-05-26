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
  const hash = await bcrypt.hash('admin123', 10)
  const user = await prisma.user.update({
    where: { email: 'admin@blitz.jp' },
    data: { password: hash },
    select: { name: true, email: true, role: true },
  })
  console.log('✅ パスワードリセット完了:', user)
  await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
