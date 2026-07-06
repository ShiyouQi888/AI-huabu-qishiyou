'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Eye, EyeOff, Check, AlertCircle, LogOut, ChevronRight } from 'lucide-react'
import { initStoreForUser } from '@/lib/project-store'

interface UserProfile {
  id: string
  username: string
  email?: string
  avatar?: string
  createdAt: string
  hasPassword: boolean
  hasGoogle: boolean
}

const AVATAR_COLORS = ['#e07d30', '#c9513a', '#3e8fa8', '#6ab87a', '#9b72c8', '#b8963c']

function getAvatarColor(username: string) {
  return AVATAR_COLORS[username.charCodeAt(0) % AVATAR_COLORS.length]
}

function Avatar({ username, avatar, size = 64 }: { username: string; avatar?: string; size?: number }) {
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={username}
        className="rounded-2xl object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-2xl font-bold text-white"
      style={{ width: size, height: size, backgroundColor: getAvatarColor(username), fontSize: size * 0.38 }}
    >
      {username[0]?.toUpperCase()}
    </div>
  )
}

function StatusMsg({ type, msg }: { type: 'ok' | 'err'; msg: string }) {
  if (!msg) return null
  return (
    <p className={`flex items-center gap-1.5 text-[12px] ${type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
      {type === 'ok' ? <Check className="size-3.5 shrink-0" /> : <AlertCircle className="size-3.5 shrink-0" />}
      {msg}
    </p>
  )
}

function DarkInput({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false)
  const isPassword = props.type === 'password'
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium text-[#6e6b64]">{label}</label>
      <div className="relative">
        <input
          {...props}
          type={isPassword && show ? 'text' : props.type}
          className="w-full rounded-xl border border-[#2d2b28] bg-[#111110] px-4 py-2.5 text-[13px] text-[#f5f4f0] placeholder:text-[#4a4742] outline-none transition-all focus:border-[#f5f4f0]/20 focus:ring-2 focus:ring-[#f5f4f0]/5 disabled:opacity-40"
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#4a4742] transition-colors hover:text-[#9a9690]"
            tabIndex={-1}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Email Section ──────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function EmailSection({ user, onEmailChanged }: { user: UserProfile; onEmailChanged: (email: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [sending, setSending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
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

  const handleSendCode = async () => {
    if (!EMAIL_RE.test(newEmail)) { setStatus({ type: 'err', msg: '请输入正确的邮箱地址' }); return }
    setSending(true); setStatus(null)
    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, purpose: 'change-email' }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? '发送失败')
      setCodeSent(true); startCooldown()
    } catch (e) {
      setStatus({ type: 'err', msg: e instanceof Error ? e.message : '发送失败' })
    } finally {
      setSending(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEmail || code.length !== 6) return
    setSubmitting(true); setStatus(null)
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-email', email: newEmail, code }),
      })
      const data = await res.json() as { user?: UserProfile; error?: string }
      if (!res.ok) throw new Error(data.error ?? '操作失败')
      onEmailChanged(newEmail)
      clearInterval(timerRef.current)
      setEditing(false); setNewEmail(''); setCode(''); setCodeSent(false); setCooldown(0)
    } catch (e) {
      setStatus({ type: 'err', msg: e instanceof Error ? e.message : '操作失败' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    clearInterval(timerRef.current)
    setEditing(false); setNewEmail(''); setCode(''); setCodeSent(false); setCooldown(0); setStatus(null)
  }

  return (
    <div className="rounded-2xl border border-[#2a2825] bg-[#1a1916] p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-[#f5f4f0]">绑定邮箱</h3>
        {!editing && (
          <button
            type="button"
            onClick={() => { setEditing(true); setStatus(null) }}
            className="text-[11px] text-[#6e6b64] transition-colors hover:text-[#f5f4f0]"
          >
            {user.email ? '更换邮箱' : '绑定邮箱'}
          </button>
        )}
      </div>

      {!editing ? (
        <p className="text-[13px] text-[#9a9690]">
          {user.email ?? <span className="text-[#4a4742]">未绑定</span>}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[#6e6b64]">新邮箱</label>
            <div className="flex gap-2">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => { setNewEmail(e.target.value); setStatus(null) }}
                placeholder="输入新邮箱地址"
                autoFocus
                className="flex-1 rounded-xl border border-[#2d2b28] bg-[#111110] px-4 py-2.5 text-[13px] text-[#f5f4f0] placeholder:text-[#4a4742] outline-none transition-all focus:border-[#f5f4f0]/20 focus:ring-2 focus:ring-[#f5f4f0]/5"
              />
              <button
                type="button"
                onClick={handleSendCode}
                disabled={sending || cooldown > 0 || !newEmail}
                className="shrink-0 rounded-xl border border-[#2d2b28] bg-[#111110] px-3.5 py-2.5 text-[12px] font-medium text-[#9a9690] transition-all hover:border-[#f5f4f0]/20 hover:text-[#f5f4f0] disabled:opacity-40"
              >
                {sending ? '发送中…' : cooldown > 0 ? `${cooldown}s` : '发送验证码'}
              </button>
            </div>
          </div>
          {codeSent && (
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-[#6e6b64]">验证码</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6 位验证码"
                className="w-full rounded-xl border border-[#2d2b28] bg-[#111110] px-4 py-2.5 text-[13px] text-[#f5f4f0] placeholder:text-[#4a4742] outline-none transition-all focus:border-[#f5f4f0]/20 focus:ring-2 focus:ring-[#f5f4f0]/5"
              />
            </div>
          )}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting || !codeSent || code.length !== 6}
              className="rounded-xl bg-[#f5f4f0] px-5 py-2.5 text-[12px] font-semibold text-[#1a1916] transition-all hover:bg-white disabled:opacity-35"
            >
              {submitting ? '保存中…' : '确认更换'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="text-[12px] text-[#6e6b64] transition-colors hover:text-[#f5f4f0]"
            >
              取消
            </button>
            {status && <StatusMsg type={status.type} msg={status.msg} />}
          </div>
        </form>
      )}
    </div>
  )
}

// ── Profile Tab ────────────────────────────────────────────────────────────────

function ProfileTab({ user, onChange }: { user: UserProfile; onChange: (u: UserProfile) => void }) {
  const [username, setUsername] = useState(user.username)
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (username.trim() === user.username) return
    setSaving(true)
    setStatus(null)
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-profile', username: username.trim() }),
      })
      const data = await res.json() as { user?: { username: string }; error?: string }
      if (!res.ok) throw new Error(data.error ?? '保存失败')
      onChange({ ...user, username: data.user?.username ?? username.trim() })
      setStatus({ type: 'ok', msg: '用户名已更新' })
    } catch (e) {
      setStatus({ type: 'err', msg: e instanceof Error ? e.message : '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = async () => {
    initStoreForUser(null)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const changed = username.trim() !== user.username && username.trim().length >= 2

  return (
    <div className="space-y-5">
      {/* Avatar + name card */}
      <div className="flex items-center gap-4 rounded-2xl border border-[#2a2825] bg-[#1a1916] p-5">
        <Avatar username={user.username} avatar={user.avatar} size={56} />
        <div>
          <p className="text-[15px] font-semibold text-[#f5f4f0]">{user.username}</p>
          {user.email && <p className="mt-0.5 text-[12px] text-[#6e6b64]">{user.email}</p>}
          <p className="mt-0.5 text-[11px] text-[#4a4742]">
            注册于 {new Date(user.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Edit username */}
      <div className="rounded-2xl border border-[#2a2825] bg-[#1a1916] p-5">
        <h3 className="mb-4 text-[13px] font-semibold text-[#f5f4f0]">基本信息</h3>
        <form onSubmit={handleSave} className="space-y-4">
          <DarkInput
            label="用户名"
            type="text"
            value={username}
            onChange={(e) => { setUsername(e.target.value); setStatus(null) }}
            maxLength={20}
          />
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={saving || !changed}
              className="rounded-xl bg-[#f5f4f0] px-5 py-2.5 text-[12px] font-semibold text-[#1a1916] transition-all hover:bg-white disabled:opacity-35"
            >
              {saving ? '保存中…' : '保存修改'}
            </button>
            {status && <StatusMsg type={status.type} msg={status.msg} />}
          </div>
        </form>
      </div>

      {/* Email binding */}
      <EmailSection user={user} onEmailChanged={(email) => onChange({ ...user, email })} />

      {/* Logout */}
      <div className="rounded-2xl border border-[#2a2825] bg-[#1a1916] p-5">
        <h3 className="mb-3 text-[13px] font-semibold text-[#f5f4f0]">退出登录</h3>
        <p className="mb-4 text-[12px] text-[#6e6b64]">退出后需要重新登录才能访问工作台</p>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 rounded-xl border border-[#3a3835] px-4 py-2.5 text-[12px] font-medium text-[#9a9690] transition-all hover:border-red-800/50 hover:text-red-400"
        >
          <LogOut className="size-3.5" />
          退出登录
        </button>
      </div>
    </div>
  )
}

// ── Security Tab ───────────────────────────────────────────────────────────────

function SecurityTab({ user, onChange }: { user: UserProfile; onChange: (u: UserProfile) => void }) {
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdStatus, setPwdStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [pwdSaving, setPwdSaving] = useState(false)

  const mismatch = confirmPwd.length > 0 && newPwd !== confirmPwd
  const canSavePwd = user.hasPassword
    ? currentPwd.length > 0 && newPwd.length >= 6 && !mismatch
    : newPwd.length >= 6 && !mismatch

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSavePwd) return
    setPwdSaving(true)
    setPwdStatus(null)
    try {
      const body = user.hasPassword
        ? { action: 'change-password', currentPassword: currentPwd, newPassword: newPwd }
        : { action: 'set-password', newPassword: newPwd }
      const res = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(data.error ?? '操作失败')
      setPwdStatus({ type: 'ok', msg: user.hasPassword ? '密码已修改' : '密码已设置' })
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('')
      if (!user.hasPassword) onChange({ ...user, hasPassword: true })
    } catch (e) {
      setPwdStatus({ type: 'err', msg: e instanceof Error ? e.message : '操作失败' })
    } finally {
      setPwdSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Password section */}
      <div className="rounded-2xl border border-[#2a2825] bg-[#1a1916] p-5">
        <h3 className="mb-1 text-[13px] font-semibold text-[#f5f4f0]">
          {user.hasPassword ? '修改密码' : '设置密码'}
        </h3>
        <p className="mb-4 text-[12px] text-[#6e6b64]">
          {user.hasPassword
            ? '定期更换密码有助于保护账号安全'
            : '为账号设置密码，支持用户名 + 密码方式登录'}
        </p>
        <form onSubmit={handlePasswordSubmit} className="space-y-3.5">
          {user.hasPassword && (
            <DarkInput
              label="当前密码"
              type="password"
              value={currentPwd}
              onChange={(e) => { setCurrentPwd(e.target.value); setPwdStatus(null) }}
              placeholder="输入当前密码"
              autoComplete="current-password"
            />
          )}
          <DarkInput
            label="新密码"
            type="password"
            value={newPwd}
            onChange={(e) => { setNewPwd(e.target.value); setPwdStatus(null) }}
            placeholder="至少 6 个字符"
            autoComplete="new-password"
          />
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[#6e6b64]">确认新密码</label>
            <div className="relative">
              <input
                type="password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                placeholder="再次输入新密码"
                autoComplete="new-password"
                className={`w-full rounded-xl border px-4 py-2.5 pr-11 text-[13px] text-[#f5f4f0] placeholder:text-[#4a4742] outline-none transition-all ${
                  mismatch
                    ? 'border-red-800/60 bg-red-950/20 focus:ring-2 focus:ring-red-800/20'
                    : 'border-[#2d2b28] bg-[#111110] focus:border-[#f5f4f0]/20 focus:ring-2 focus:ring-[#f5f4f0]/5'
                }`}
              />
            </div>
            {mismatch && <p className="mt-1 text-[11px] text-red-400">两次密码不一致</p>}
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={pwdSaving || !canSavePwd}
              className="rounded-xl bg-[#f5f4f0] px-5 py-2.5 text-[12px] font-semibold text-[#1a1916] transition-all hover:bg-white disabled:opacity-35"
            >
              {pwdSaving ? '保存中…' : user.hasPassword ? '修改密码' : '设置密码'}
            </button>
            {pwdStatus && <StatusMsg type={pwdStatus.type} msg={pwdStatus.msg} />}
          </div>
        </form>
      </div>

      {/* Connected accounts */}
      <div className="rounded-2xl border border-[#2a2825] bg-[#1a1916] p-5">
        <h3 className="mb-4 text-[13px] font-semibold text-[#f5f4f0]">关联账号</h3>
        <div className="flex items-center justify-between rounded-xl border border-[#2a2825] bg-[#111110] px-4 py-3">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            <div>
              <p className="text-[13px] font-medium text-[#f5f4f0]">Google 账号</p>
              {user.hasGoogle && user.email
                ? <p className="text-[11px] text-[#6e6b64]">{user.email}</p>
                : <p className="text-[11px] text-[#4a4742]">未连接</p>}
            </div>
          </div>
          {user.hasGoogle ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-900/30 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
              <Check className="size-3" /> 已连接
            </span>
          ) : (
            <a
              href="/api/auth/google"
              className="flex items-center gap-1 rounded-lg border border-[#3a3835] px-3 py-1.5 text-[11px] font-medium text-[#9a9690] transition-colors hover:border-[#f5f4f0]/20 hover:text-[#f5f4f0]"
            >
              连接 <ChevronRight className="size-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

type Tab = 'profile' | 'security'

export default function SettingsPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [tab, setTab] = useState<Tab>('profile')

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { user: UserProfile; hasPassword: boolean; hasGoogle: boolean }) => {
        setUser({ ...data.user, hasPassword: data.hasPassword, hasGoogle: data.hasGoogle })
      })
      .catch(() => router.push('/login'))
  }, [router])

  const updateUser = useCallback((u: UserProfile) => setUser(u), [])

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f0e0c]">
        <div className="size-5 animate-spin rounded-full border-2 border-[#f5f4f0]/15 border-t-[#f5f4f0]/50" />
      </div>
    )
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'profile', label: '个人资料' },
    { key: 'security', label: '账号安全' },
  ]

  return (
    <div className="min-h-screen bg-[#0f0e0c]">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-[#2a2825] bg-[#0f0e0c]/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-[12px] text-[#6e6b64] transition-colors hover:text-[#f5f4f0]"
          >
            <ArrowLeft className="size-3.5" />
            返回工作台
          </Link>
          <p className="text-[13px] font-semibold text-[#f5f4f0]">账号设置</p>
          <Avatar username={user.username} avatar={user.avatar} size={28} />
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-[#2a2825]">
        <div className="mx-auto flex max-w-2xl px-4">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`-mb-px border-b-2 px-4 py-3 text-[13px] font-medium transition-colors ${
                tab === key
                  ? 'border-[#f5f4f0] text-[#f5f4f0]'
                  : 'border-transparent text-[#6e6b64] hover:text-[#f5f4f0]/60'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-2xl px-4 py-8">
        {tab === 'profile' && <ProfileTab user={user} onChange={updateUser} />}
        {tab === 'security' && <SecurityTab user={user} onChange={updateUser} />}
      </main>
    </div>
  )
}
