/**
 * Simple in-memory rate limiter for Next.js API routes.
 * Resets on server restart — good enough for a single-process dev/prod deployment.
 *
 * Usage:
 *   const { ok, retryAfter } = rateLimit('user-id', 'image-gen', { limit: 10, windowMs: 60_000 })
 *   if (!ok) return NextResponse.json({ error: `请求过于频繁，请 ${retryAfter}s 后重试` }, { status: 429 })
 */

interface Window {
  count: number
  resetAt: number
}

// key → { count, resetAt }
const store = new Map<string, Window>()

interface RateLimitOptions {
  /** Max requests per window */
  limit: number
  /** Window duration in ms */
  windowMs: number
}

interface RateLimitResult {
  ok: boolean
  /** Seconds until the window resets (only meaningful when ok === false) */
  retryAfter: number
  remaining: number
}

export function rateLimit(
  identifier: string,
  action: string,
  { limit, windowMs }: RateLimitOptions,
): RateLimitResult {
  const key = `${action}:${identifier}`
  const now = Date.now()

  let win = store.get(key)
  if (!win || now >= win.resetAt) {
    win = { count: 0, resetAt: now + windowMs }
    store.set(key, win)
  }

  win.count++
  const remaining = Math.max(0, limit - win.count)
  const ok = win.count <= limit
  const retryAfter = ok ? 0 : Math.ceil((win.resetAt - now) / 1000)

  return { ok, retryAfter, remaining }
}

/** Periodically evict expired windows to prevent memory growth */
setInterval(() => {
  const now = Date.now()
  for (const [key, win] of store) {
    if (now >= win.resetAt) store.delete(key)
  }
}, 5 * 60_000)
