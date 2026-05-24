import { auth } from '@/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth
  const isAdmin = req.auth?.user?.role === 'ADMIN'

  if (pathname.startsWith('/admin') && !isAdmin) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  if ((pathname.startsWith('/schedule') || pathname.startsWith('/stats')) && !isLoggedIn) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/admin/:path*', '/schedule/:path*', '/stats/:path*'],
}
