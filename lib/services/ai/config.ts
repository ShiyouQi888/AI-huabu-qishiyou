/**
 * API 密钥与 Provider 配置管理
 *
 * 配置优先级：环境变量 > config 文件 > 默认值
 * 运行时可通过 /api/config 读写（仅影响当前进程，重启后回退到文件/环境变量）
 */

import type { ProviderConfig } from './types'

type DefaultConfig = Omit<ProviderConfig, 'id' | 'apiKey'>

const DEFAULT_CONFIGS: Record<string, DefaultConfig> = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-image-2'],
    enabled: false,
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-v4-pro', 'deepseek-flash'],
    enabled: false,
  },
  qwen: {
    name: '通义千问 / 万相',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen3.8-max', 'qwen3.8-flash', 'qwen3.7-plus', 'qwen3.7-flash', 'cosyvoice-v3.5-plus', 'cosyvoice-v3.5-flash'],
    enabled: false,
  },
  kimi: {
    name: 'Moonshot Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['kimi-k3', 'kimi-k2.7-code-highspeed', 'kimi-k2.6'],
    enabled: false,
  },
  volces: {
    name: '火山引擎（即梦）',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: [
      'doubao-seed-evolving',
      'doubao-seed-2-1-pro-260915',
      'doubao-seed-2-1-lite-260915',
      'doubao-seedream-5-0-pro-260628',
      'doubao-seedream-5-0-flash-260915',
      'doubao-seedance-2-5-260628',
      'doubao-seedance-2-0-260128',
      'doubao-seedance-2-0-fast-260128',
      'doubao-tts-2.0',
    ],
    enabled: false,
  },
  zhipu: {
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-5', 'cogview-4'],
    enabled: false,
  },
  suno: {
    name: 'Suno 音乐',
    baseUrl: process.env.SUNO_API_BASE_URL || 'https://api.sunoapi.org',
    models: ['suno-v6', 'suno-v6-wild', 'suno-v6-mini'],
    enabled: false,
  },
}

/** 环境变量 → Provider 映射 */
const ENV_KEY_MAP: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  qwen: 'DASHSCOPE_API_KEY',
  kimi: 'MOONSHOT_API_KEY',
  volces: 'ARK_API_KEY',
  zhipu: 'ZHIPU_API_KEY',
  suno: 'SUNO_API_KEY',
}

/** 运行时覆盖配置 — 优先写到磁盘 JSON，重启后自动恢复 */
interface RuntimeOverride {
  apiKey?: string
  enabled?: boolean
  disabledModels?: string[]
}

import * as fs from 'fs'
import * as path from 'path'

const CONFIG_FILE = path.join(process.cwd(), '.config', 'api-keys.json')

function loadPersistedOverrides(): Map<string, RuntimeOverride> {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8')
    const obj = JSON.parse(raw) as Record<string, RuntimeOverride>
    return new Map(Object.entries(obj))
  } catch {
    return new Map()
  }
}

function saveOverrides(map: Map<string, RuntimeOverride>) {
  try {
    const dir = path.dirname(CONFIG_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(Object.fromEntries(map), null, 2), 'utf-8')
  } catch (err) {
    console.warn('Failed to persist API config:', err)
  }
}

const runtimeOverrides = loadPersistedOverrides()

/** 读取所有 Provider 配置（合并环境变量 > 运行时覆盖 > 默认值） */
export function getAllConfigs(): ProviderConfig[] {
  return Object.entries(DEFAULT_CONFIGS).map(([id, defaults]) => {
    const envKey = process.env[ENV_KEY_MAP[id]] ?? ''
    const override = runtimeOverrides.get(id) ?? {}
    const disabledSet = new Set(override.disabledModels ?? [])
    return {
      ...defaults,
      id,
      apiKey: override.apiKey ?? envKey,
      enabled: override.enabled ?? (!!envKey || defaults.enabled),
      models: defaults.models.filter((m) => !disabledSet.has(m)),
      allModels: defaults.models,
      disabledModels: override.disabledModels ?? [],
    }
  })
}

/** 获取单个 Provider 配置 */
export function getConfig(providerId: string): ProviderConfig | undefined {
  return getAllConfigs().find((c) => c.id === providerId)
}

/** 运行时设置 API Key / enabled / disabledModels（不影响环境变量和文件） */
export function setConfig(
  providerId: string,
  patch: Partial<Pick<ProviderConfig, 'apiKey' | 'enabled'>> & { disabledModels?: string[] },
) {
  const existing = runtimeOverrides.get(providerId) ?? {}
  const next: RuntimeOverride = { ...existing }
  if (patch.apiKey !== undefined) next.apiKey = patch.apiKey
  if (patch.enabled !== undefined) next.enabled = patch.enabled
  if (patch.disabledModels !== undefined) next.disabledModels = patch.disabledModels
  runtimeOverrides.set(providerId, next)
  saveOverrides(runtimeOverrides)
}

/** 获取指定模型的 Provider 配置（modelId → provider） */
const MODEL_PROVIDER_MAP: Record<string, string> = {}
for (const [providerId, cfg] of Object.entries(DEFAULT_CONFIGS)) {
  for (const model of cfg.models) {
    MODEL_PROVIDER_MAP[model] = providerId
  }
}

export function getProviderForModel(modelId: string): string | undefined {
  return MODEL_PROVIDER_MAP[modelId]
}

export { DEFAULT_CONFIGS, ENV_KEY_MAP }
