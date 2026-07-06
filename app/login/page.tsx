'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, Sparkles, Layers, PenTool, ArrowRight, AlertCircle } from 'lucide-react'
import { CaptchaDialog } from '@/components/captcha-slider'
import { initStoreForUser } from '@/lib/project-store'

const FEATURES = [
  { icon: Sparkles, title: 'AI 多模型生成', desc: '文字、图像、视频、音频全覆盖' },
  { icon: Layers,   title: '节点式工作流',  desc: '拖拽连线，可视化串联 AI 能力' },
  { icon: PenTool,  title: '平面设计规划',  desc: '电商主图、海报、Banner 一键生成' },
]

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
          让每一个创意<br />都能被看见
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

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showCaptcha, setShowCaptcha] = useState(false)
  const [captchaDone, setCaptchaDone] = useState(false)

  useEffect(() => {
    const err = searchParams.get('error')
    if (err) setError(decodeURIComponent(err))
  }, [searchParams])

  const doLogin = useCallback(async (u: string, p: string) => {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: u.trim(), password: p }),
      })
      const data = await res.json() as { error?: string; user?: { id: string } }
      if (!res.ok) throw new Error(data.error ?? '登录失败')
      if (data.user?.id) initStoreForUser(data.user.id)
      router.push('/')
      router.refresh()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!login.trim() || !password) return
    if (!captchaDone) { setShowCaptcha(true); return }
    await doLogin(login, password)
  }

  const handleCaptchaVerified = useCallback(() => {
    setCaptchaDone(true)
    setShowCaptcha(false)
    doLogin(login, password)
  }, [doLogin, login, password])

  const handleGoogle = () => { setGoogleLoading(true); window.location.href = '/api/auth/google' }
  const canSubmit = login.trim().length > 0 && password.length > 0

  return (
    <>
      {showCaptcha && (
        <CaptchaDialog onVerified={handleCaptchaVerified} onClose={() => setShowCaptcha(false)} />
      )}
      <div className="flex flex-1 flex-col items-center justify-center bg-[#f5f4f0] px-8 py-10 lg:px-10">
        <div className="w-full max-w-[296px]">
          <div className="mb-7 flex items-center gap-2 lg:hidden">
            <BrandIcon />
            <span className="text-[12px] font-semibold text-[#1a1916]">AI 画布工作台</span>
          </div>

          <div className="mb-5">
            <h1 className="text-[19px] font-bold tracking-tight text-[#1a1916]">欢迎回来</h1>
            <p className="mt-1 text-[12px] text-[#9a9690]">登录您的账号，继续创作</p>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] text-red-600">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" /><span>{error}</span>
            </div>
          )}

          <button
            type="button" onClick={handleGoogle} disabled={googleLoading || loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#e0ddd6] bg-white px-4 py-2.5 text-[12px] font-medium text-[#1a1916] shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all hover:border-[#ccc9c0] hover:shadow-[0_2px_6px_rgba(0,0,0,0.07)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {googleLoading ? <div className="size-[14px] animate-spin rounded-full border-2 border-[#1a1916]/20 border-t-[#1a1916]/60" /> : <GoogleIcon />}
            使用 Google 账号登录
          </button>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-[#e0ddd6]" />
            <span className="text-[10px] text-[#b8b5ae]">或</span>
            <div className="h-px flex-1 bg-[#e0ddd6]" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="mb-1 block text-[10px] font-medium text-[#6e6b64]">用户名 / 邮箱</label>
              <input type="text" value={login} onChange={(e) => setLogin(e.target.value)}
                placeholder="用户名或邮箱" autoFocus autoComplete="username email"
                className="w-full rounded-xl border border-[#e0ddd6] bg-white px-3.5 py-2.5 text-[13px] text-[#1a1916] placeholder:text-[#c4c1b8] shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-all focus:border-[#1a1916] focus:shadow-[0_0_0_3px_rgba(26,25,22,0.08)]"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-[10px] font-medium text-[#6e6b64]">密码</label>
                <Link href="/forgot-password" className="text-[10px] text-[#9a9690] transition-colors hover:text-[#6e6b64]">忘记密码？</Link>
              </div>
              <div className="relative">
                <input type={showPwd ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码" autoComplete="current-password"
                  className="w-full rounded-xl border border-[#e0ddd6] bg-white px-3.5 py-2.5 pr-10 text-[13px] text-[#1a1916] placeholder:text-[#c4c1b8] shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-all focus:border-[#1a1916] focus:shadow-[0_0_0_3px_rgba(26,25,22,0.08)]"
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)} tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#b8b5ae] transition-colors hover:text-[#6e6b64]">
                  {showPwd ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading || !canSubmit}
              className="group flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#1a1916] py-2.5 text-[12px] font-semibold text-[#f5f4f0] shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-all hover:bg-[#2a2925] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-35"
            >
              {loading
                ? <div className="size-3.5 animate-spin rounded-full border-2 border-[#f5f4f0]/25 border-t-[#f5f4f0]" />
                : <>登录 <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" /></>}
            </button>
          </form>

          <p className="mt-5 text-center text-[11px] text-[#9a9690]">
            还没有账号？{' '}
            <Link href="/register" className="font-semibold text-[#1a1916] underline underline-offset-[3px] decoration-[#c4c1b8] transition-colors hover:decoration-[#1a1916]">
              免费注册
            </Link>
          </p>
        </div>
      </div>
    </>
  )
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#f5f4f0] p-4 lg:bg-[#0d0c0a] lg:p-10">
      <div className="pointer-events-none absolute inset-0 hidden lg:block bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,rgba(255,250,230,0.03),transparent)]" />
      <div className="relative z-10 flex w-full min-h-screen flex-col overflow-hidden lg:min-h-0 lg:max-w-[900px] lg:flex-row lg:rounded-2xl lg:border lg:border-white/[0.07] lg:shadow-[0_20px_70px_rgba(0,0,0,0.6)]">
        <LeftPanel />
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
