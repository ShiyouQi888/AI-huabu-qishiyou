/**
 * GET  /api/config  — 获取所有 Provider 配置（API Key 脱敏）
 * PUT  /api/config  — 更新指定 Provider 的 API Key / enabled / disabledModels
 *
 * Body (PUT): { providerId: string, apiKey?: string, enabled?: boolean, disabledModels?: string[] }
 *
 * ⚠️ 运行时内存存储，重启后回退到环境变量
 */

import { NextResponse } from 'next/server'
import { getAllConfigs, setConfig } from '@/lib/services/ai/config'

function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return '****'
  return key.slice(0, 4) + '****' + key.slice(-4)
}

export async function GET() {
  const configs = getAllConfigs().map((c) => ({
    ...c,
    apiKey: maskKey(c.apiKey),
    hasKey: !!c.apiKey,
  }))
  return NextResponse.json(
    { configs },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { providerId, apiKey, enabled, disabledModels } = body

    if (!providerId) {
      return NextResponse.json(
        { error: '缺少 providerId' },
        { status: 400 },
      )
    }

    const patch: Parameters<typeof setConfig>[1] = {}
    if (typeof apiKey === 'string' && apiKey.length > 0) patch.apiKey = apiKey
    if (typeof enabled === 'boolean') patch.enabled = enabled
    if (Array.isArray(disabledModels)) patch.disabledModels = disabledModels

    setConfig(providerId, patch)

    return NextResponse.json(
      { success: true },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json(
      { error: '请求格式错误' },
      { status: 400 },
    )
  }
}
