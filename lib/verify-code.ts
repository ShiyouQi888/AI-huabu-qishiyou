interface Entry {
  code: string
  expiresAt: number   // TTL: 5 min
  sentAt: number      // for cooldown check
  attempts: number
}

const store = new Map<string, Entry>()

export function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

/** Store a code. Throws if within 60-second cooldown window. */
export function storeCode(email: string, code: string): void {
  const existing = store.get(email)
  if (existing && Date.now() - existing.sentAt < 60_000) {
    const wait = Math.ceil((60_000 - (Date.now() - existing.sentAt)) / 1000)
    throw new Error(`请等待 ${wait} 秒后再次发送`)
  }
  store.set(email, {
    code,
    expiresAt: Date.now() + 5 * 60_000,
    sentAt: Date.now(),
    attempts: 0,
  })
}

/** Verify a code. Returns true on match (and clears the entry). */
export function verifyCode(email: string, code: string): boolean {
  const entry = store.get(email)
  if (!entry) throw new Error('验证码不存在，请重新获取')
  if (Date.now() > entry.expiresAt) {
    store.delete(email)
    throw new Error('验证码已过期，请重新获取')
  }
  entry.attempts++
  if (entry.attempts > 5) {
    store.delete(email)
    throw new Error('验证码已失效，请重新获取')
  }
  if (entry.code !== code) return false
  store.delete(email)
  return true
}
