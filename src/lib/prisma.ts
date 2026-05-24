import { PrismaClient } from '@/generated/prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

function createPrismaClient() {
  const adapter = new PrismaLibSql({
    url: process.env.DATABASE_URL ?? 'file:./dev.db',
    authToken: process.env.DATABASE_AUTH_TOKEN,
  })
  return new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0])
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
