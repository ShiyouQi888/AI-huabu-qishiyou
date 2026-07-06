'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Sparkles, Layers, PenTool, ArrowRight, AlertCircle, Check, Mail, Loader2 } from 'lucide-react'
import { CaptchaDialog } from '@/components/captcha-slider'
import { initStoreForUser } from '@/lib/project-store'

const FEATURES = [
  { icon: Sparkles, title: 'AI 多模型生成', desc: '文字、图像、视频、音频全覆盖' },
  { icon: Layers,   title: '节点式工作流',  desc: '拖拽连线，可视化串联 AI 能力' },
  { icon: PenTool,  title: '平面设计规划',  desc: '电商主图、海报、Banner 一键生成' },
]

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const COOLDOWN = 60

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[14px] shrink-0" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

function BrandIcon({ onDark }: { onDark?: boolean }) {
  return (
    <div className={`flex size-[30px] items-center justify-center rounded-lg ${onDark ? 'border border-[#f5f4f0]/[0.12] bg-[#f5f4f0]/[0.08]' : 'bg-[#1a1916]'}`}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#f5f4f0" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  )
}

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null
  const checks = [
    { label: '至少 6 位', pass: password.length >= 6 },
    { label: '含字母',    pass: /[a-zA-Z]/.test(password) },
    { label: '含数字',    pass: /[0-9!@#$%^&*]/.test(password) },
  ]
  const score = checks.filter((c) => c.pass).length
  const colors = ['bg-red-400', 'bg-amber-400', 'bg-emerald-500']
  const labels = ['弱', '中', '强']
  const labelCls = ['text-red-500', 'text-amber-500', 'text-emerald-600']
  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`h-[2.5px] flex-1 rounded-full transition-all duration-300 ${i < score ? colors[score - 1] : 'bg-[#e0ddd6]'}`} />
        ))}
        {score > 0 && <span className={`ml-2 text-[10px] font-medium ${labelCls[score - 1]}`}>{labels[score - 1]}</span>}
      </div>
      <div className="flex gap-3">
        {checks.map(({ label, pass }) => (
          <span key={label} className={`flex items-center gap-0.5 text-[10px] transition-colors ${pass ? 'text-emerald-600' : 'text-[#b8b5ae]'}`}>
            <Check className={`size-2.5 ${pass ? 'opacity-100' : 'opacity-0'}`} />{label}
          </span>
        ))}
      </div>
    </div>
  )
}

function LeftPanel() {
  return (
    <div className="relative hidden lg:flex lg:w-[42%] lg:flex-col lg:justify-between lg:p-10 overflow-hidden shrink-0">
      <div className="absolute inset-0 bg-[#131211]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_75%_65%_at_18%_55%,rgba(255,248,220,0.05),transparent)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.009)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.009)_1px,transparent_1px)] bg-[size:56px_56px]" />
      <div className="relative z-10 flex items-center gap-2">
        <BrandIcon onDark />
        <span className="text-[11px] font-semibold tracking-wide text-[#f5f4f0]/45">AI 画布工作台</span>
      </div>
      <div className="relative z-10 space-y-5">
        <h2 className="text-[26px] font-bold leading-snug tracking-tight text-[#f5f4f0]">
          开始您的<br />AI 创作之旅
        </h2>
        <div className="space-y-2.5">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-center gap-3">
              <div className="flex size-[26px] shrink-0 items-center justify-center rounded-md border border-[#f5f4f0]/[0.07] bg-[#f5f4f0]/[0.04]">
                <Icon className="size-[11px] text-[#f5f4f0]/38" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-[#f5f4f0]/62">{title}</p>
                <p className="text-[10px] leading-tight text-[#f5f4f0]/22">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="relative z-10">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-[#f5f4f0]/[0.07] bg-[#f5f4f0]/[0.04] px-2.5 py-1">
          <div className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
          <span className="text-[10px] text-[#f5f4f0]/25">多平台 AI 模型接入中</span>
        </div>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  const router = useRouter()

  // Form fields
  const [username, setUsername]     = useState('')
  const [email, setEmail]           = useState('')
  const [code, setCode]             = useState('')
  const [password, setPassword]     = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showPwd, setShowPwd]       = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // State
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showCaptcha, setShowCaptcha] = useState(false)
  const [captchaDone, setCaptchaDone] = useState(false)

  // Email send state
  const [codeSent, setCodeSent]     = useState(false)
  const [sendLoading, setSendLoading] = useState(false)
  const [sendError, setSendError]   = useState('')
  const [cooldown, setCooldown]     = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Cleanup timer on unmount
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  const startCooldown = () => {
    setCooldown(COOLDOWN)
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) { clearInterval(timerRef.current!); timerRef.current = null; return 0 }
        return c - 1
      })
    }, 1000)
  }

  const handleSendCode = async () => {
    setSendError('')
    if (!EMAIL_RE.test(email)) { setSendError('请输入正确的邮箱地址'); return }
    setSendLoading(true)
    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? '发送失败')
      setCodeSent(true)
      startCooldown()
    } catch (e: unknown) {
      setSendError(e instanceof Error ? e.message : '发送失败')
    } finally {
      setSendLoading(false)
    }
  }

  const pwdMismatch = confirmPwd.length > 0 && password !== confirmPwd
  const canSubmit = (
    username.trim().length >= 2 &&
    EMAIL_RE.test(email) &&
    code.length === 6 &&
    password.length >= 6 &&
    confirmPwd === password
  )

  const doRegister = useCallback(async (u: string, p: string, em: string, c: string) => {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u.trim(), password: p, email: em, code: c }),
      })
      const data = await res.json() as { error?: string; user?: { id: string } }
      if (!res.ok) throw new Error(data.error ?? '注册失败')
      if (data.user?.id) initStoreForUser(data.user.id)
      router.push('/')
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '注册失败')
    } finally {
      setLoading(false)
    }
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPwd) { setError('两次输入的密码不一致'); return }
    if (!captchaDone) { setShowCaptcha(true); return }
    await doRegister(username, password, email, code)
  }

  const handleCaptchaVerified = useCallback(() => {
    setCaptchaDone(true)
    setShowCaptcha(false)
    doRegister(username, password, email, code)
  }, [doRegister, username, password, email, code])

  const handleGoogle = () => { setGoogleLoading(true); window.location.href = '/api/auth/google' }

  // Code input: only allow digits, max 6
  const handleCodeChange = (v: string) => setCode(v.replace(/\D/g, '').slice(0, 6))

  return (
    <>
      {showCaptcha && (
        <CaptchaDialog onVerified={handleCaptchaVerified} onClose={() => setShowCaptcha(false)} />
      )}
      <div className="relative flex min-h-screen items-center justify-center bg-[#f5f4f0] p-4 lg:bg-[#0d0c0a] lg:p-10">
        <div className="pointer-events-none absolute inset-0 hidden lg:block bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,rgba(255,250,230,0.03),transparent)]" />
        <div className="relative z-10 flex w-full min-h-screen flex-col overflow-hidden lg:min-h-0 lg:max-w-[900px] lg:flex-row lg:rounded-2xl lg:border lg:border-white/[0.07] lg:shadow-[0_20px_70px_rgba(0,0,0,0.6)]">
          <LeftPanel />

          {/* Right panel */}
          <div className="flex flex-1 flex-col items-center justify-center bg-[#f5f4f0] px-8 py-8 lg:px-10">
            <div className="w-full max-w-[296px]">
              <div className="mb-5 flex items-center gap-2 lg:hidden">
                <BrandIcon />
                <span className="text-[12px] font-semibold text-[#1a1916]">AI 画布工作台</span>
              </div>

              <div className="mb-4">
                <h1 className="text-[19px] font-bold tracking-tight text-[#1a1916]">创建账号</h1>
                <p className="mt-1 text-[12px] text-[#9a9690]">几秒钟即可开始使用</p>
              </div>

              {error && (
                <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] text-red-600">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" /><span>{error}</span>
                </div>
              )}

              <button type="button" onClick={handleGoogle} disabled={googleLoading || loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#e0ddd6] bg-white px-4 py-2.5 text-[12px] font-medium text-[#1a1916] shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:border-[#ccc9c0] hover:shadow-[0_2px_6px_rgba(0,0,0,0.07)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {googleLoading ? <div className="size-[14px] animate-spin rounded-full border-2 border-[#1a1916]/20 border-t-[#1a1916]/60" /> : <GoogleIcon />}
                使用 Google 账号注册
              </button>

              <div className="my-3 flex items-center gap-3">
                <div className="h-px flex-1 bg-[#e0ddd6]" />
                <span className="text-[10px] text-[#b8b5ae]">或</span>
                <div className="h-px flex-1 bg-[#e0ddd6]" />
              </div>

              <form onSubmit={handleSubmit} className="space-y-2.5">
                {/* Username */}
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[#6e6b64]">用户名</label>
                  <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                    placeholder="2–20 个字符" autoFocus autoComplete="username"
                    className="w-full rounded-xl border border-[#e0ddd6] bg-white px-3.5 py-2.5 text-[13px] text-[#1a1916] placeholder:text-[#c4c1b8] shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-all focus:border-[#1a1916] focus:shadow-[0_0_0_3px_rgba(26,25,22,0.08)]"
                  />
                </div>

                {/* Email + Send button */}
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[#6e6b64]">邮箱</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#c4c1b8]" />
                      <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setSendError('') }}
                        placeholder="your@email.com" autoComplete="email"
                        className="w-full rounded-xl border border-[#e0ddd6] bg-white pl-8 pr-3.5 py-2.5 text-[13px] text-[#1a1916] placeholder:text-[#c4c1b8] shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-all focus:border-[#1a1916] focus:shadow-[0_0_0_3px_rgba(26,25,22,0.08)]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSendCode}
                      disabled={sendLoading || cooldown > 0 || !EMAIL_RE.test(email)}
                      className="shrink-0 rounded-xl border border-[#e0ddd6] bg-white px-3 py-2.5 text-[11px] font-medium text-[#1a1916] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:border-[#ccc9c0] hover:bg-[#f8f7f4] disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap"
                    >
                      {sendLoading
                        ? <Loader2 className="size-3.5 animate-spin" />
                        : cooldown > 0
                          ? `${cooldown}s`
                          : codeSent ? '重新发送' : '发送验证码'}
                    </button>
                  </div>
                  {sendError && (
                    <p className="mt-1 flex items-center gap-1 text-[10px] text-red-500">
                      <AlertCircle className="size-3" />{sendError}
                    </p>
                  )}
                  {codeSent && !sendError && (
                    <p className="mt-1 flex items-center gap-1 text-[10px] text-emerald-600">
                      <Check className="size-3" />验证码已发送至 {email}
                    </p>
                  )}
                </div>

                {/* Code input — shown after send */}
                {codeSent && (
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-[#6e6b64]">验证码</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={code}
                      onChange={(e) => handleCodeChange(e.target.value)}
                      placeholder="请输入 6 位验证码"
                      maxLength={6}
                      autoComplete="one-time-code"
                      className="w-full rounded-xl border border-[#e0ddd6] bg-white px-3.5 py-2.5 text-[13px] tracking-widest text-[#1a1916] placeholder:text-[#c4c1b8] placeholder:tracking-normal shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-all focus:border-[#1a1916] focus:shadow-[0_0_0_3px_rgba(26,25,22,0.08)]"
                    />
                  </div>
                )}

                {/* Password */}
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[#6e6b64]">密码</label>
                  <div className="relative">
                    <input type={showPwd ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder="至少 6 个字符" autoComplete="new-password"
                      className="w-full rounded-xl border border-[#e0ddd6] bg-white px-3.5 py-2.5 pr-10 text-[13px] text-[#1a1916] placeholder:text-[#c4c1b8] shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-all focus:border-[#1a1916] focus:shadow-[0_0_0_3px_rgba(26,25,22,0.08)]"
                    />
                    <button type="button" onClick={() => setShowPwd(!showPwd)} tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#b8b5ae] transition-colors hover:text-[#6e6b64]">
                      {showPwd ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  </div>
                  <PasswordStrength password={password} />
                </div>

                {/* Confirm password */}
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-[#6e6b64]">确认密码</label>
                  <div className="relative">
                    <input type={showConfirm ? 'text' : 'password'} value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)}
                      placeholder="再次输入密码" autoComplete="new-password"
                      className={`w-full rounded-xl border bg-white px-3.5 py-2.5 pr-10 text-[13px] text-[#1a1916] placeholder:text-[#c4c1b8] shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-all ${
                        pwdMismatch
                          ? 'border-red-300 focus:border-red-400 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.1)]'
                          : 'border-[#e0ddd6] focus:border-[#1a1916] focus:shadow-[0_0_0_3px_rgba(26,25,22,0.08)]'
                      }`}
                    />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)} tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#b8b5ae] transition-colors hover:text-[#6e6b64]">
                      {showConfirm ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  </div>
                  {pwdMismatch && <p className="mt-1 text-[10px] text-red-500">两次密码不一致</p>}
                </div>

                <button type="submit" disabled={loading || !canSubmit}
                  className="group flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#1a1916] py-2.5 text-[12px] font-semibold text-[#f5f4f0] shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-all hover:bg-[#2a2925] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {loading
                    ? <div className="size-3.5 animate-spin rounded-full border-2 border-[#f5f4f0]/25 border-t-[#f5f4f0]" />
                    : <>创建账号 <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" /></>}
                </button>
              </form>

              <p className="mt-4 text-center text-[11px] text-[#9a9690]">
                已有账号？{' '}
                <Link href="/login" className="font-semibold text-[#1a1916] underline underline-offset-[3px] decoration-[#c4c1b8] transition-colors hover:decoration-[#1a1916]">
                  立即登录
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
