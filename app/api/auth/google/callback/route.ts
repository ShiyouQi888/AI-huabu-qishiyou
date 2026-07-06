/**
 * GET /api/auth/google/callback
 * Handles the OAuth 2.0 authorization code callback from Google.
 */
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { findOrCreateGoogleUser, createToken } from '@/lib/auth'

interface GoogleTokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

interface GoogleUserInfo {
  id: string
  email: string
  name: string
  picture?: string
  verified_email?: boolean
}

function getRedirectUri(req: NextRequest): string {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI
  const origin = process.env.NEXTAUTH_URL ?? new URL(req.url).origin
  return `${origin}/api/auth/google/callback`
}

function loginErrorRedirect(req: NextRequest, msg: string): NextResponse {
  return NextResponse.redirect(
    new URL(`/login?error=${encodeURIComponent(msg)}`, req.url),
  )
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const oauthError = searchParams.get('error')

  if (oauthError) {
    return loginErrorRedirect(req, oauthError === 'access_denied' ? '您取消了 Google 授权' : 'Google 授权失败')
  }

  if (!code) return loginErrorRedirect(req, '缺少授权码')

  // CSRF — verify state matches cookie
  const cookieStore = await cookies()
  const savedState = cookieStore.get('oauth_state')?.value
  cookieStore.delete('oauth_state')

  if (!savedState || savedState !== state) {
    return loginErrorRedirect(req, '请求验证失败，请重试')
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return loginErrorRedirect(req, 'Google OAuth 未正确配置')
  }

  try {
    // 1. Exchange authorization code for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: getRedirectUri(req),
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(15_000),
    })

    const tokens = await tokenRes.json() as GoogleTokenResponse
    if (!tokenRes.ok || !tokens.access_token) {
      console.error('Google token exchange failed:', tokens)
      return loginErrorRedirect(req, 'Token 交换失败，请重试')
    }

    // 2. Fetch user profile from Google
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(10_000),
    })

    if (!userRes.ok) return loginErrorRedirect(req, '获取 Google 用户信息失败')

    const googleUser = await userRes.json() as GoogleUserInfo

    if (!googleUser.verified_email) {
      return loginErrorRedirect(req, '该 Google 账号邮箱尚未验证')
    }

    // 3. Find or create local user
    const user = await findOrCreateGoogleUser({
      googleId: googleUser.id,
      email: googleUser.email,
      name: googleUser.name,
      avatar: googleUser.picture,
    })

    // 4. Issue JWT cookie and redirect home
    const token = createToken(user)
    const res = NextResponse.redirect(new URL('/', req.url))
    res.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    })
    return res
  } catch (err) {
    console.error('Google OAuth callback error:', err)
    return loginErrorRedirect(req, 'Google 登录失败，请重试')
  }
}
