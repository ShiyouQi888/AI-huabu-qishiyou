/**
 * GET /api/auth/google
 * Redirects the browser to Google's OAuth 2.0 authorization page.
 */
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { cookies } from 'next/headers'

function getRedirectUri(req: Request): string {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI
  const origin = process.env.NEXTAUTH_URL ?? new URL(req.url).origin
  return `${origin}/api/auth/google/callback`
}

export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'Google OAuth 未配置，请设置 GOOGLE_CLIENT_ID' }, { status: 503 })
  }

  const state = randomUUID()
  const cookieStore = await cookies()
  cookieStore.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  })

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'select_account',
  })

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
