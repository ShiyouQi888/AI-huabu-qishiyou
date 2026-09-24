/**
 * 模型注册表 — 独立于 index.ts，避免 client.ts 需要读取模型能力时形成循环依赖。
 */

import type { ModelInfo } from './types'

/** 当前可用模型列表（供前端使用） */
export const MODELS: ModelInfo[] = [
  // 文本模型
  { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', type: 'text', provider: 'openai', description: '前沿旗舰 · 长上下文 · 通用智能', tags: ['旗舰'], capabilities: { maxTokens: 131072 } },
  { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', type: 'text', provider: 'openai', description: '均衡性能 · 长上下文 · 通用任务', tags: [], capabilities: { maxTokens: 131072 } },
  { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', type: 'text', provider: 'openai', description: '轻量快速 · 日常任务', tags: ['轻量'], capabilities: { maxTokens: 131072 } },
  { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', type: 'text', provider: 'deepseek', description: '旗舰推理 · 长上下文 · 多模态', tags: ['旗舰'], capabilities: { maxTokens: 384000 } },
  { id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash', type: 'text', provider: 'deepseek', description: '极速推理 · 高性价比', tags: ['轻量'], capabilities: { maxTokens: 384000 } },
  { id: 'qwen3.8-max', name: 'Qwen3.8 Max', type: 'text', provider: 'qwen', description: '阿里旗舰 · 复杂任务 · 长上下文', tags: ['旗舰'], capabilities: { maxTokens: 131072 } },
  { id: 'qwen3.8-flash', name: 'Qwen3.8 Flash', type: 'text', provider: 'qwen', description: '快速响应 · 高性价比', tags: ['轻量'], capabilities: { maxTokens: 65536 } },
  { id: 'qwen3.7-plus', name: 'Qwen3.7 Plus', type: 'text', provider: 'qwen', description: '均衡体验 · 通用创作', tags: [], capabilities: { maxTokens: 131072 } },
  { id: 'qwen3.7-flash', name: 'Qwen3.7 Flash', type: 'text', provider: 'qwen', description: '轻量快速 · 批量任务', tags: ['轻量'], capabilities: { maxTokens: 65536 } },
  { id: 'kimi-k3', name: 'Kimi K3', type: 'text', provider: 'kimi', description: '长上下文 · 复杂创作 · 多语言', tags: ['旗舰'], capabilities: { maxTokens: 65536 } },
  { id: 'kimi-k2.7-code-highspeed', name: 'Kimi K2.7 Code Highspeed', type: 'text', provider: 'kimi', description: '高速代码与结构化创作', tags: ['代码'], capabilities: { maxTokens: 65536 } },
  { id: 'kimi-k2.6', name: 'Kimi K2.6', type: 'text', provider: 'kimi', description: '通用文本 · 长上下文', tags: [], capabilities: { maxTokens: 65536 } },
  { id: 'glm-5', name: 'GLM-5', type: 'text', provider: 'zhipu', description: '智谱旗舰 · 复杂推理 · 长上下文', tags: ['旗舰'], capabilities: { maxTokens: 131072 } },
  { id: 'doubao-seed-evolving', name: '豆包 Seed Evolving', type: 'text', provider: 'volces', description: '动态迭代 · 自动跟进最新能力', tags: ['最新'], capabilities: { maxTokens: 256000 } },
  { id: 'doubao-seed-2-1-pro-260915', name: '豆包 Seed 2.1 Pro', type: 'text', provider: 'volces', description: '旗舰推理 · 长上下文 · 多模态', tags: ['旗舰'], capabilities: { maxTokens: 256000 } },
  { id: 'doubao-seed-2-1-lite-260915', name: '豆包 Seed 2.1 Lite', type: 'text', provider: 'volces', description: '轻量快速 · 高性价比', tags: ['轻量'], capabilities: { maxTokens: 256000 } },
  // 图片模型
  { id: 'gpt-image-2', name: 'GPT Image 2', type: 'image', provider: 'openai', description: '高质量图像生成与编辑', tags: ['旗舰'], capabilities: { maxResolution: '2048x2048', supportedRatios: ['1:1', '16:9', '9:16'] } },
  { id: 'doubao-seedream-5-0-pro-260628', name: '即梦 Seedream 5.0 Pro', type: 'image', provider: 'volces', description: '旗舰生图 · 交互编辑 · 图层拆分', tags: ['旗舰', '交互编辑', '图层拆分'], capabilities: { maxResolution: '2048x2048', supportedRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'] } },
  { id: 'doubao-seedream-5-0-flash-260915', name: '即梦 Seedream 5.0 Flash', type: 'image', provider: 'volces', description: '快速出图 · 交互编辑 · 图层拆分', tags: ['快速', '交互编辑', '图层拆分'], capabilities: { maxResolution: '2048x2048', supportedRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'] } },
  { id: 'cogview-4', name: 'CogView-4', type: 'image', provider: 'zhipu', description: '中文理解 · 图像生成', tags: [], capabilities: { maxResolution: '1024x1024' } },
  // 视频模型
  { id: 'doubao-seedance-2-5-260628', name: '即梦 Seedance 2.5', type: 'video', provider: 'volces', description: '新一代视频生成 · 长叙事 · 4–30s', tags: ['最新'], capabilities: { maxDuration: 30, supportedRatios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], maxResolution: '720p' } },
  { id: 'doubao-seedance-2-0-260128', name: '即梦 Seedance 2.0', type: 'video', provider: 'volces', description: '旗舰视频生成 · 高画质 · 多模态', tags: ['旗舰'], capabilities: { maxDuration: 15 } },
  { id: 'doubao-seedance-2-0-fast-260128', name: '即梦 Seedance 2.0 Fast', type: 'video', provider: 'volces', description: '快速出片 · 标准画质 · 3–10s', tags: ['快速'], capabilities: { maxDuration: 10 } },
  // 音频模型
  { id: 'cosyvoice-v3.5-plus', name: 'CosyVoice V3.5 Plus', type: 'audio', provider: 'qwen', description: '高质量语音合成 · 音色控制', tags: ['旗舰'], capabilities: {} },
  { id: 'cosyvoice-v3.5-flash', name: 'CosyVoice V3.5 Flash', type: 'audio', provider: 'qwen', description: '快速语音合成 · 高性价比', tags: ['快速'], capabilities: {} },
  { id: 'doubao-tts-2.0', name: '豆包语音合成 2.0', type: 'audio', provider: 'volces', description: '火山引擎文生语音 · 多情感音色', tags: ['TTS'], capabilities: {} },
  { id: 'suno-v6', name: 'Suno V6', type: 'audio', provider: 'suno', description: '歌曲生成 · 人声与伴奏 · 双版本输出', tags: ['歌曲'], capabilities: {} },
  { id: 'suno-v6-wild', name: 'Suno V6 Wild', type: 'audio', provider: 'suno', description: '更强风格变化 · 实验性歌曲创作', tags: ['歌曲'], capabilities: {} },
  { id: 'suno-v6-mini', name: 'Suno V6 Mini', type: 'audio', provider: 'suno', description: '轻量歌曲生成 · 快速尝试', tags: ['快速'], capabilities: {} },
]

export function getModelsByType(type: string): ModelInfo[] {
  return MODELS.filter((m) => m.type === type)
}

export function getModelMaxTokens(modelId: string): number | undefined {
  return MODELS.find((m) => m.id === modelId)?.capabilities?.maxTokens
}
