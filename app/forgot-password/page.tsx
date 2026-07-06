'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Eye, EyeOff, Check, AlertCircle } from 'lucide-react'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showPwd, setShowPwd] = useState(false)

  const [step, setStep] = useState<'email' | 'reset'>('email')
  const [cooldown, setCooldown] = useState(0)
  const [sendLoading, setSendLoading] = useState(false)
  const [sendError, setSendError] = useState('')
  const [submitLoading, setSubmitLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const startCooldown = () => {
    setCooldown(60)
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) { clearInterval(timerRef.current); return 0 }
        return c - 1
      })
    }, 1000)
  }

  const handleSendCode = useCallback(async () => {
    if (!EMAIL_RE.test(email)) { setSendError('请输入正确的邮箱地址'); return }
    setSendLoading(true); setSendError('')
    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose: 'reset-password' }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? '发送失败')
      setStep('reset'); startCooldown()
    } catch (e) {
      setSendError(e instanceof Error ? e.message : '发送失败')
    } finally {
      setSendLoading(false)
    }
  }, [email])

  const mismatch = confirmPwd.length > 0 && newPwd !== confirmPwd
  const canSubmit = code.length === 6 && newPwd.length >= 6 && !mismatch

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitLoading(true); setError('')
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, newPassword: newPwd }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error ?? '重置失败')
      setSuccess(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : '重置失败')
    } finally {
      setSubmitLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f4f0] px-4">
      <div className="w-full max-w-[296px]">
        <Link
          href="/login"
          className="mb-8 flex items-center gap-1 text-[11px] text-[#9a9690] transition-colors hover:text-[#1a1916]"
        >
          <ArrowLeft className="size-3" /> 返回登录
        </Link>

        {success ? (
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-emerald-100">
              <Check className="size-6 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-[17px] font-bold text-[#1a1916]">密码已重置</h2>
              <p className="mt-1 text-[12px] text-[#9a9690]">请使用新密码登录</p>
            </div>
            <Link
              href="/login"
              className="group flex items-center gap-1.5 rounded-xl bg-[#1a1916] px-6 py-2.5 text-[12px] font-semibold text-[#f5f4f0] transition-all hover:bg-[#2a2925]"
            >
              前往登录 <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        ) : step === 'email' ? (
          <>
            <div className="mb-6">
              <h1 className="text-[19px] font-bold tracking-tight text-[#1a1916]">重置密码</h1>
              <p className="mt-1 text-[12px] text-[#9a9690]">输入注册邮箱，获取验证码</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[10px] font-medium text-[#6e6b64]">注册邮箱</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setSendError('') }}
                  placeholder="请输入注册邮箱"
                  autoFocus
                  className="w-full rounded-xl border border-[#e0ddd6] bg-white px-3.5 py-2.5 text-[13px] text-[#1a1916] placeholder:text-[#c4c1b8] shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-all focus:border-[#1a1916] focus:shadow-[0_0_0_3px_rgba(26,25,22,0.08)]"
                />
                {sendError && (
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-red-500">
                    <AlertCircle className="size-3.5 shrink-0" />{sendError}
                  </p>
                )}
              </div>
              <button
                onClick={handleSendCode}
                disabled={sendLoading || !email}
                className="group flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#1a1916] py-2.5 text-[12px] font-semibold text-[#f5f4f0] shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-all hover:bg-[#2a2925] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-35"
              >
                {sendLoading
                  ? <div className="size-3.5 animate-spin rounded-full border-2 border-[#f5f4f0]/25 border-t-[#f5f4f0]" />
                  : <>获取验证码 <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" /></>}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-[19px] font-bold tracking-tight text-[#1a1916]">设置新密码</h1>
              <p className="mt-1 text-[12px] text-[#9a9690]">验证码已发送至 {email}</p>
            </div>
            <form onSubmit={handleReset} className="space-y-3">
              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] text-red-600">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" /><span>{error}</span>
                </div>
              )}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-[10px] font-medium text-[#6e6b64]">验证码</label>
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={sendLoading || cooldown > 0}
                    className="text-[10px] text-[#9a9690] transition-colors hover:text-[#6e6b64] disabled:opacity-50"
                  >
                    {cooldown > 0 ? `${cooldown}s 后重发` : sendLoading ? '发送中…' : '重新发送'}
                  </button>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError('') }}
                  placeholder="6 位验证码"
                  autoFocus
                  className="w-full rounded-xl border border-[#e0ddd6] bg-white px-3.5 py-2.5 text-[13px] tracking-[0.2em] text-[#1a1916] placeholder:tracking-normal placeholder:text-[#c4c1b8] shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-all focus:border-[#1a1916] focus:shadow-[0_0_0_3px_rgba(26,25,22,0.08)]"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-[#6e6b64]">新密码</label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={newPwd}
                    onChange={(e) => { setNewPwd(e.target.value); setError('') }}
                    placeholder="至少 6 个字符"
                    autoComplete="new-password"
                    className="w-full rounded-xl border border-[#e0ddd6] bg-white px-3.5 py-2.5 pr-10 text-[13px] text-[#1a1916] placeholder:text-[#c4c1b8] shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-all focus:border-[#1a1916] focus:shadow-[0_0_0_3px_rgba(26,25,22,0.08)]"
                  />
                  <button type="button" onClick={() => setShowPwd(!showPwd)} tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#b8b5ae] transition-colors hover:text-[#6e6b64]">
                    {showPwd ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-[#6e6b64]">确认新密码</label>
                <input
                  type="password"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  placeholder="再次输入新密码"
                  autoComplete="new-password"
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-[13px] text-[#1a1916] placeholder:text-[#c4c1b8] shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-all ${
                    mismatch
                      ? 'border-red-300 bg-red-50 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.08)]'
                      : 'border-[#e0ddd6] bg-white focus:border-[#1a1916] focus:shadow-[0_0_0_3px_rgba(26,25,22,0.08)]'
                  }`}
                />
                {mismatch && <p className="mt-1 text-[11px] text-red-500">两次密码不一致</p>}
              </div>
              <button
                type="submit"
                disabled={submitLoading || !canSubmit}
                className="group flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#1a1916] py-2.5 text-[12px] font-semibold text-[#f5f4f0] shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-all hover:bg-[#2a2925] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-35"
              >
                {submitLoading
                  ? <div className="size-3.5 animate-spin rounded-full border-2 border-[#f5f4f0]/25 border-t-[#f5f4f0]" />
                  : <>重置密码 <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" /></>}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
