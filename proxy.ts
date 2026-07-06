import { NextRequest, NextResponse } from 'next/server'

/**
 * Light JWT decode for request routing.
 * Checks structure + expiry only — full signature verification
 * happens in each API route via lib/auth.ts.
 */
function decodeJwtPayload(token: string): { id: string; username: string; exp?: number } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>
    if (typeof payload.id !== 'string' || typeof payload.username !== 'string') return null
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return null
    return { id: payload.id, username: payload.username, exp: payload.exp as number | undefined }
  } catch {
    return null
  }
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isAuthPage = pathname === '/login' || pathname === '/register' || pathname === '/forgot-password'
  const isAuthApi = pathname.startsWith('/api/auth/')
  const isApi = pathname.startsWith('/api/')
  const isPublicAsset = /\.(ico|png|svg|jpg|jpeg|gif|webp|woff2?)$/.test(pathname)
  const isUploads = pathname.startsWith('/uploads/')

  if (isAuthApi || isPublicAsset || isUploads) return NextResponse.next()

  const token = req.cookies.get('token')?.value

  if (!token) {
    if (isAuthPage) return NextResponse.next()
    // API routes enforce auth themselves (getAuthUser) and return JSON 401.
    // Never redirect them to /login — fetch() would follow it and POST to an
    // HTML page, producing a confusing 404.
    if (isApi) return NextResponse.next()
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const user = decodeJwtPayload(token)

  if (!user) {
    // Expired or malformed token — clear cookie and redirect
    if (isAuthPage) {
      const res = NextResponse.next()
      res.cookies.delete('token')
      return res
    }
    // Let API routes return their own 401 JSON instead of a redirect.
    if (isApi) {
      const res = NextResponse.next()
      res.cookies.delete('token')
      return res
    }
    const res = NextResponse.redirect(new URL('/login', req.url))
    res.cookies.delete('token')
    return res
  }

  // Valid authenticated user visiting auth page → redirect home
  if (isAuthPage) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  // Attach user info as headers so downstream API routes can use it cheaply
  const res = NextResponse.next()
  res.headers.set('x-user-id', user.id)
  res.headers.set('x-username', user.username)
  return res
}

export const config = {
  matcher: [
    '/((?!_next|__nextjs_font|favicon\\.ico|icon\\.svg|baise\\.svg|apple-icon\\.png|.*\\.woff2?$|uploads/).*)',
  ],
}
