/**
 * OpenAI 兼容协议 REST 客户端
 *
 * 使用原生 fetch 调用所有兼容 OpenAI 协议的接口，
 * 覆盖：通义千问/万相、DeepSeek、Kimi、火山引擎即梦、智谱 GLM。
 *
 * 不依赖 openai SDK，避免 Turbopack 下的 Node shim 问题。
 */

import type { TextGenRequest, TextGenResponse, ImageGenRequest, ImageGenResponse, VideoGenRequest, VideoGenResponse, TaskStatus, AudioGenRequest, AudioGenResponse, SongGenRequest, SongGenResponse } from './types'
import { AIError } from './types'
import { getConfig } from './config'
import { getModelMaxTokens } from './models'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** 判断是否为可重试的网络错误 */
function isRetryable(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message + ((err as { code?: string }).code || '')
    return msg.includes('ConnectTimeout') || msg.includes('UND_ERR_CONNECT_TIMEOUT')
      || msg.includes('fetch failed') || msg.includes('ECONNRESET')
      || msg.includes('ETIMEDOUT') || msg.includes('UND_ERR_SOCKET')
  }
  return false
}

/** 请求预算不能超过模型上限，但调用方明确给出的较小预算也必须生效。 */
function resolveMaxTokens(model: string, requested?: number) {
  const modelLimit = getModelMaxTokens(model)
  if (requested && modelLimit) return Math.min(requested, modelLimit)
  return requested ?? modelLimit
}

/** 带认证 + 自动重试的 fetch 请求 */
async function apiFetch(
  providerId: string,
  endpoint: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const config = getConfig(providerId)
  if (!config?.apiKey) {
    throw new AIError(`${config?.name ?? providerId} 未配置 API Key`, 401, providerId)
  }

  const url = `${config.baseUrl.replace(/\/+$/, '')}${endpoint}`
  const maxRetries = 3

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          ...extraHeaders,
        },
        body: JSON.stringify(body),
        // Text generation now always requests the model's full maxTokens ceiling (see
        // getModelMaxTokens) rather than a small guessed number, so a complex reasoning
        // + generation pass can legitimately run long. 5 minutes was cutting those off
        // mid-response with a raw timeout error.
        signal: AbortSignal.timeout(900_000),
      })

      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new AIError(
          `${config.name} API 错误 [${resp.status}]: ${text.slice(0, 300)}`,
          resp.status,
          providerId,
        )
      }

      return resp
    } catch (err) {
      if (attempt < maxRetries && isRetryable(err)) {
        const delay = (attempt + 1) * 3000
        console.warn(`[${config.name}] 连接失败，${delay / 1000}s 后重试 (${attempt + 1}/${maxRetries})...`)
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      throw err
    }
  }

  throw new AIError(`${config.name} 连接失败，已重试 ${maxRetries} 次`, 503, providerId)
}

/** 火山方舟 Ark · Seedance 视频生成 */
interface ArkContentBlock {
  type: 'text' | 'image_url' | 'video_url' | 'audio_url'
  text?: string
  image_url?: { url: string; role?: 'first_frame' | 'last_frame' | 'reference' }
  video_url?: { url: string; role?: 'reference_video' | 'reference' }
  audio_url?: { url: string; role?: 'reference_audio' | 'reference' }
}

async function toPublicMediaUrl(mediaUrl: string): Promise<string> {
  if (mediaUrl.startsWith('data:')) return mediaUrl
  if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) return mediaUrl
  // Local path (e.g. /uploads/materials/xxx.png) → base64 data URL
  const fs = await import('fs/promises')
  const path = await import('path')
  const filePath = path.join(process.cwd(), 'public', mediaUrl)
  const buf = await fs.readFile(filePath)
  const ext = path.extname(filePath).toLowerCase()
  const mime = ext === '.png' ? 'image/png'
    : ext === '.webp' ? 'image/webp'
    : ext === '.mp4' ? 'video/mp4'
    : ext === '.mov' ? 'video/quicktime'
    : ext === '.mp3' ? 'audio/mpeg'
    : ext === '.wav' ? 'audio/wav'
    : 'image/jpeg'
  return `data:${mime};base64,${buf.toString('base64')}`
}

export async function videoGenSeedance(
  req: VideoGenRequest,
): Promise<VideoGenResponse> {
  const providerId = 'volces'
  const config = getConfig(providerId)
  if (!config?.apiKey) {
    throw new AIError('火山引擎即梦 未配置 API Key', 401, 'volces')
  }

  // Seedance 2.5 支持最多 50 个多模态参考素材；其他当前接入版本保持 15 个。
  const referenceLimits = req.model.includes('seedance-2-5')
    ? { image: 30, video: 10, audio: 10, total: 50 }
    : { image: 9, video: 3, audio: 3, total: 15 }
  const references = req.references?.filter((reference, index, all) => {
    const type = reference.type || 'image'
    const before = all.slice(0, index).filter((item) => (item.type || 'image') === type).length
    return before < referenceLimits[type]
  }).slice(0, referenceLimits.total)

  // 构造 content 数组（Ark 多模态 content 格式）
  const content: ArkContentBlock[] = []

  // 首帧图
  if (req.firstFrameImage) {
    const url = await toPublicMediaUrl(req.firstFrameImage)
    content.push({
      type: 'image_url',
      image_url: { url, role: 'first_frame' },
    })
  }

  // 尾帧图
  if (req.lastFrameImage) {
    const url = await toPublicMediaUrl(req.lastFrameImage)
    content.push({
      type: 'image_url',
      image_url: { url, role: 'last_frame' },
    })
  }

  // 全能参考模式：解析 @label 引用，构建交错的 text + image 内容
  if (references?.length && req.prompt.includes('@')) {
    const refMap = new Map(references.map(r => [`@${r.label}`, r]))
    const escaped = references.map(r =>
      `@${r.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
    )
    const regex = new RegExp(`(${escaped.join('|')})`)
    const parts = req.prompt.split(regex)

    for (const part of parts) {
      const ref = refMap.get(part)
      if (ref) {
        const url = await toPublicMediaUrl(ref.url)
        if (ref.type === 'video') {
          content.push({ type: 'video_url', video_url: { url, role: 'reference_video' } })
        } else if (ref.type === 'audio') {
          content.push({ type: 'audio_url', audio_url: { url, role: 'reference_audio' } })
        } else {
          content.push({ type: 'image_url', image_url: { url, role: 'reference' } })
        }
      } else if (part.trim()) {
        content.push({ type: 'text', text: part })
      }
    }
  } else {
    content.push({ type: 'text', text: req.prompt })
  }

  // 构造请求体
  const body: Record<string, unknown> = {
    model: req.model,
    content,
  }

  if (req.resolution) {
    body.resolution = req.resolution
  }
  if (req.ratio) {
    body.ratio = req.ratio
  }
  if (req.duration) {
    body.duration = req.duration
  }

  // 提交异步任务（带重试）
  const url = `${config.baseUrl.replace(/\/+$/, '')}/contents/generations/tasks`
  let resp: Response | undefined
  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      })
      break
    } catch (err) {
      if (attempt < 3 && isRetryable(err)) {
        console.warn(`[Seedance] 提交失败，${(attempt + 1) * 3}s 后重试 (${attempt + 1}/3)...`)
        await new Promise((r) => setTimeout(r, (attempt + 1) * 3000))
        continue
      }
      throw err
    }
  }

  if (!resp || !resp.ok) {
    const text = resp ? await resp.text().catch(() => '') : ''
    throw new AIError(`Seedance API 错误 [${resp?.status ?? 'N/A'}]: ${text.slice(0, 300)}`, resp?.status ?? 503, 'volces')
  }

  const data = await resp.json() as { id: string }

  if (!data.id) {
    throw new AIError('Seedance 任务创建失败，未返回 taskId', 500, 'volces')
  }

  return {
    taskId: data.id,
    status: 'pending',
    estimatedSeconds: req.duration ? req.duration * 10 : 60,
  }
}

/** 火山方舟 Ark · Seedance 任务状态查询 */
export async function videoTaskSeedance(taskId: string): Promise<VideoGenResponse> {
  const providerId = 'volces'
  const config = getConfig(providerId)
  if (!config?.apiKey) {
    throw new AIError('火山引擎即梦 未配置 API Key', 401, 'volces')
  }

  const url = `${config.baseUrl.replace(/\/+$/, '')}/contents/generations/tasks/${taskId}`

  let resp: Response | undefined
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      resp = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
        },
        signal: AbortSignal.timeout(30_000),
      })
      break
    } catch (err) {
      if (attempt < 2 && isRetryable(err)) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 2000))
        continue
      }
      throw err
    }
  }

  if (!resp || !resp.ok) {
    const text = resp ? await resp.text().catch(() => '') : ''
    throw new AIError(`Seedance 查询错误 [${resp?.status ?? 'N/A'}]: ${text.slice(0, 200)}`, resp?.status ?? 503, 'volces')
  }

  const data = await resp.json() as {
    id: string
    status: string  // queued | running | succeeded | failed
    content?: { video_url?: string }
    error?: { code: string; message: string }
  }

  const arkStatus = data.status
  // 映射 Ark 状态 → 应用状态
  const mappedStatus: TaskStatus =
    arkStatus === 'succeeded' ? 'completed' :
    arkStatus === 'failed'    ? 'failed' :
    arkStatus === 'running'   ? 'running' :
    'pending'

  return {
    taskId,
    status: mappedStatus,
    videoUrl: data.content?.video_url,
  }
}


/** 文本生成（流式 SSE） */
export async function textGenStream(
  providerId: string,
  req: TextGenRequest,
): Promise<ReadableStream<Uint8Array>> {
  const config = getConfig(providerId)
  if (!config?.apiKey) {
    throw new AIError(`${config?.name ?? providerId} 未配置 API Key`, 401, providerId)
  }

  const messages: ChatMessage[] = []

  if (req.systemPrompt) {
    messages.push({ role: 'system', content: req.systemPrompt })
  }

  let userContent = req.prompt
  if (req.contextTexts?.length) {
    userContent = [
      ...req.contextTexts.map((t, i) => `[参考上下文 ${i + 1}]\n${t}`),
      `[当前指令]\n${req.prompt}`,
    ].join('\n\n---\n\n')
  }

  messages.push({ role: 'user', content: userContent })

  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: req.model,
      messages,
      temperature: req.temperature ?? 0.7,
      max_tokens: resolveMaxTokens(req.model, req.maxTokens),
      stream: true,
    }),
    // See apiFetch above — full maxTokens ceiling means generation can legitimately run long.
    signal: AbortSignal.timeout(900_000),
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new AIError(
      `${config.name} API 错误 [${resp.status}]: ${text.slice(0, 300)}`,
      resp.status,
      providerId,
    )
  }

  if (!resp.body) {
    throw new AIError('流式响应无 body', 500, providerId)
  }

  // 转换上游 SSE → 我们的 SSE 格式
  const encoder = new TextEncoder()
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''
  let fullReasoning = ''

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            // 发送完成事件
            controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ text: fullText, reasoning: fullReasoning || null })}\n\n`))
            controller.close()
            break
          }

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith('data:')) continue

            const jsonStr = trimmed.slice(5).trim()
            if (jsonStr === '[DONE]') continue

            try {
              const chunk = JSON.parse(jsonStr)
              const delta = chunk.choices?.[0]?.delta
              if (!delta) continue

              // 思考内容 (DeepSeek R1 / 豆包 Seed 1.6 reasoning)
              if (delta.reasoning_content) {
                fullReasoning += delta.reasoning_content
                controller.enqueue(encoder.encode(
                  `event: reasoning\ndata: ${JSON.stringify({ content: delta.reasoning_content })}\n\n`
                ))
              }

              // 正文内容
              if (delta.content) {
                fullText += delta.content
                controller.enqueue(encoder.encode(
                  `event: text\ndata: ${JSON.stringify({ content: delta.content })}\n\n`
                ))
              }
            } catch {
              // 跳过无法解析的行
            }
          }
        }
      } catch (err) {
        controller.enqueue(encoder.encode(
          `event: error\ndata: ${JSON.stringify({ message: err instanceof Error ? err.message : '流式传输中断' })}\n\n`
        ))
        controller.close()
      }
    },
  })

  return stream
}

/** 文本生成（非流式） */
export async function textGen(
  providerId: string,
  req: TextGenRequest,
): Promise<TextGenResponse> {
  const messages: ChatMessage[] = []

  if (req.systemPrompt) {
    messages.push({ role: 'system', content: req.systemPrompt })
  }

  let userContent = req.prompt
  if (req.contextTexts?.length) {
    userContent = [
      ...req.contextTexts.map((t, i) => `[参考上下文 ${i + 1}]\n${t}`),
      `[当前指令]\n${req.prompt}`,
    ].join('\n\n---\n\n')
  }

  messages.push({ role: 'user', content: userContent })

  // Always request the model's actual ceiling rather than a guessed fixed number —
  // reasoning models can burn a small budget entirely on thinking and never reach the
  // answer (see the AbortError-adjacent truncation guard below). Requesting more costs
  // nothing unless the model actually uses it. Falls back to whatever the caller asked
  // for if the model isn't in the registry (e.g. a custom/unlisted deployment).
  const maxTokens = resolveMaxTokens(req.model, req.maxTokens)

  const resp = await apiFetch(providerId, '/chat/completions', {
    model: req.model,
    messages,
    temperature: req.temperature ?? 0.7,
    max_tokens: maxTokens,
  })

  const data = await resp.json() as {
    choices: { message: { content?: string; reasoning_content?: string }; finish_reason?: string }[]
    model: string
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  }

  const choice = data.choices?.[0]

  // Reasoning models (DeepSeek etc.) can burn the entire maxTokens budget on
  // reasoning_content and get cut off before ever writing the real answer. That shows up
  // as content="" + finish_reason="length" — silently falling back to reasoning_content
  // here would hand the caller a chain-of-thought transcript disguised as the response,
  // which then fails obscurely downstream (e.g. "no JSON found"). Fail loudly instead,
  // with enough detail to fix it (raise maxTokens).
  if (!choice?.message?.content && choice?.finish_reason === 'length') {
    const reasoningLen = choice?.message?.reasoning_content?.length ?? 0
    const providerName = getConfig(providerId)?.name ?? providerId
    throw new AIError(
      `${providerName} 在思考阶段耗尽了 maxTokens 限制（reasoning 已生成 ${reasoningLen} 字仍未开始正式回答），未生成有效内容。请提高 maxTokens 后重试。`,
      502,
      providerId,
    )
  }

  const text = choice?.message?.content
    || choice?.message?.reasoning_content
    || ''

  if (!choice?.message?.content) {
    console.warn(
      `[${providerId}] chat/completions 未返回 content，回退 reasoning_content。`,
      `model=${req.model} finish_reason=${choice?.finish_reason} maxTokens=${req.maxTokens}`,
      `contentLen=0 reasoningLen=${choice?.message?.reasoning_content?.length ?? 0}`,
      `completionTokens=${data.usage?.completion_tokens}`,
    )
  }

  return {
    text,
    model: data.model,
    usage: data.usage ? {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
    } : undefined,
  }
}

/** 图片生成 - DALL·E 兼容接口 */
async function imageGenDalle(providerId: string, req: ImageGenRequest): Promise<ImageGenResponse> {
  const resp = await apiFetch(providerId, '/images/generations', {
    model: req.model,
    prompt: req.prompt,
    n: req.count ?? 1,
    size: req.width && req.height
      ? `${req.width}x${req.height}`
      : '1024x1024',
  })

  const data = await resp.json() as { data: { url?: string; b64_json?: string }[] }
  const imageUrl = data.data?.[0]?.url ?? data.data?.[0]?.b64_json
  if (!imageUrl) throw new AIError('图片生成返回空结果', 500, providerId)

  return { imageUrl }
}

/** 火山引擎即梦图片生成 */
async function imageGenVolces(providerId: string, req: ImageGenRequest): Promise<ImageGenResponse> {
  const refs = req.referenceImages?.length ? req.referenceImages : (req.referenceImage ? [req.referenceImage] : [])
  const publicRefs = await Promise.all(refs.map(toPublicMediaUrl))
  const isSeedream5 = req.model.includes('seedream-5-0')
  const coordinatePrompt = req.annotations?.map((a, i) => {
    const marker = a.type === 'point'
      ? `<point>${a.x ?? 0} ${a.y ?? 0}</point>`
      : `<bbox>${a.x1 ?? 0} ${a.y1 ?? 0} ${a.x2 ?? 999} ${a.y2 ?? 999}</bbox>`
    return `标记${i + 1}：${marker}${a.prompt?.trim() ? `，编辑要求：${a.prompt.trim()}` : ''}`
  }).join('\n')
  const body: Record<string, unknown> = {
    model: req.model,
    prompt: coordinatePrompt ? `${req.prompt}\n\n${coordinatePrompt}` : req.prompt,
    negative_prompt: req.negativePrompt,
    size: isSeedream5 ? (req.layerDecomposition ? 'auto' : '2K') : `${req.width ?? 1024}x${req.height ?? 1024}`,
    response_format: 'url',
    watermark: false,
  }
  if (isSeedream5) {
    if (publicRefs.length) body.image = publicRefs.length === 1 ? publicRefs[0] : publicRefs
    if (req.layerDecomposition) {
      body.layer_decomposition = true
      body.output_format = 'png'
      body.background = 'transparent'
    }
  } else {
    body.n = req.count ?? 1
    if (publicRefs[0]) body.reference_image = publicRefs[0]
  }
  const resp = await apiFetch(providerId, '/images/generations', body)
  const data = await resp.json() as { data: Array<{ url?: string; name?: string; description?: string; z_index?: number; bounding_box?: { absolute?: number[]; normalized?: number[] } }> }
  const items = data.data?.filter((item) => item.url) ?? []
  const imageUrl = items[0]?.url
  if (!imageUrl) throw new AIError('即梦返回空结果', 500, 'volces')

  return {
    imageUrl,
    imageUrls: items.map((item) => item.url as string),
    layers: req.layerDecomposition ? items.slice(1).map((item) => ({ url: item.url as string, name: item.name, description: item.description, zIndex: item.z_index, boundingBox: item.bounding_box })) : undefined,
  }
}

/** 图片生成入口 */
export async function imageGen(
  providerId: string,
  req: ImageGenRequest,
): Promise<ImageGenResponse> {
  if (providerId === 'volces') {
    return imageGenVolces(providerId, req)
  }
  return imageGenDalle(providerId, req)
}

/** 智谱 CogVideoX 视频生成（异步任务） */
export async function videoGenCogVideoX(
  req: VideoGenRequest,
): Promise<VideoGenResponse> {
  const providerId = 'zhipu'
  const config = getConfig(providerId)
  if (!config?.apiKey) {
    throw new AIError('智谱 GLM 未配置 API Key', 401, 'zhipu')
  }

  const url = `${config.baseUrl.replace(/\/+$/, '')}/videos/generations`
  const body: Record<string, unknown> = {
    model: req.model,
    prompt: req.prompt,
  }

  if (req.firstFrameImage) {
    body.image_url = req.firstFrameImage
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new AIError(`CogVideoX API 错误 [${resp.status}]: ${text.slice(0, 300)}`, resp.status, 'zhipu')
  }

  const data = await resp.json() as { id?: string; task_id?: string }
  const taskId = data.id || data.task_id

  if (!taskId) {
    throw new AIError('CogVideoX 任务创建失败，未返回 taskId', 500, 'zhipu')
  }

  return {
    taskId,
    status: 'pending',
    estimatedSeconds: 120,
  }
}

/** 智谱 CogVideoX 任务状态查询 */
export async function videoTaskCogVideoX(taskId: string): Promise<VideoGenResponse> {
  const providerId = 'zhipu'
  const config = getConfig(providerId)
  if (!config?.apiKey) {
    throw new AIError('智谱 GLM 未配置 API Key', 401, 'zhipu')
  }

  const url = `${config.baseUrl.replace(/\/+$/, '')}/async-result/${taskId}`
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
    },
    signal: AbortSignal.timeout(30_000),
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new AIError(`CogVideoX 查询错误 [${resp.status}]: ${text.slice(0, 200)}`, resp.status, 'zhipu')
  }

  const data = await resp.json() as {
    task_status: string
    video_result?: { url?: string }[]
  }

  const status = data.task_status
  const mappedStatus: TaskStatus =
    status === 'SUCCESS' ? 'completed' :
    status === 'FAIL'    ? 'failed' :
    status === 'PROCESSING' ? 'running' :
    'pending'

  return {
    taskId,
    status: mappedStatus,
    videoUrl: data.video_result?.[0]?.url,
  }
}

/** 通义 CosyVoice 语音合成 */
export async function audioGenCosyVoice(
  req: import('./types').AudioGenRequest,
): Promise<import('./types').AudioGenResponse> {
  const providerId = 'qwen'
  const config = getConfig(providerId)
  if (!config?.apiKey) {
    throw new AIError('通义千问 未配置 API Key', 401, 'qwen')
  }

  const body: Record<string, unknown> = {
    model: req.model,
    input: {
      text: req.text,
    },
    parameters: {
      ...(req.voice ? { voice: req.voice } : { voice: 'longxiaochun' }),
      ...(req.speed != null ? { rate: req.speed } : {}),
      format: 'mp3',
      sample_rate: 22050,
    },
  }

  if (req.referenceAudio) {
    body.input = {
      ...body.input as object,
      reference_audio: req.referenceAudio,
    }
  }

  const url = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2audio/text-synthesis'
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new AIError(`CosyVoice API 错误 [${resp.status}]: ${text.slice(0, 300)}`, resp.status, 'qwen')
  }

  const data = await resp.json() as {
    output?: { task_id?: string; task_status?: string }
    request_id?: string
  }

  const taskId = data.output?.task_id
  if (!taskId) {
    throw new AIError('CosyVoice 任务创建失败', 500, 'qwen')
  }

  return {
    taskId,
    status: 'pending',
    duration: 0,
  }
}

/** 通义 CosyVoice 任务状态查询 */
export async function audioTaskCosyVoice(taskId: string): Promise<import('./types').AudioGenResponse> {
  const providerId = 'qwen'
  const config = getConfig(providerId)
  if (!config?.apiKey) {
    throw new AIError('通义千问 未配置 API Key', 401, 'qwen')
  }

  const url = `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
    },
    signal: AbortSignal.timeout(30_000),
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new AIError(`CosyVoice 查询错误 [${resp.status}]: ${text.slice(0, 200)}`, resp.status, 'qwen')
  }

  const data = await resp.json() as {
    output?: {
      task_status?: string
      results?: { url?: string }[]
    }
  }

  const status = data.output?.task_status
  const mappedStatus: TaskStatus =
    status === 'SUCCEEDED' ? 'completed' :
    status === 'FAILED'    ? 'failed' :
    status === 'RUNNING'   ? 'running' :
    'pending'

  return {
    taskId,
    status: mappedStatus,
    audioUrl: data.output?.results?.[0]?.url,
    duration: 0,
  }
}

/** 火山引擎 Seed Speech v3 文生语音。HTTP 接口返回 base64 音频分片。 */
export async function audioGenVolces(req: AudioGenRequest): Promise<AudioGenResponse> {
  const apiKey = process.env.VOLCENGINE_TTS_API_KEY || process.env.ARK_API_KEY
  if (!apiKey) throw new AIError('火山引擎语音未配置 API Key', 401, 'volces')

  const resourceId = req.referenceAudio
    ? (process.env.VOLCENGINE_TTS_CLONE_RESOURCE_ID || 'seed-icl-2.0')
    : (process.env.VOLCENGINE_TTS_RESOURCE_ID || 'seed-tts-2.0')
  const response = await fetch(
    process.env.VOLCENGINE_TTS_BASE_URL || 'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
        'X-Api-Resource-Id': resourceId,
        'X-Api-Request-Id': crypto.randomUUID(),
      },
      body: JSON.stringify({
        user: { uid: 'ai-canvas' },
        req_params: {
          text: req.text,
          speaker: req.voice || 'zh_female_vv_uranus_bigtts',
          audio_params: {
            format: 'mp3',
            sample_rate: 24000,
            ...(req.speed != null ? { speech_rate: Math.round((req.speed - 1) * 100) } : {}),
          },
        },
      }),
      signal: AbortSignal.timeout(300_000),
    },
  )

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new AIError(`火山引擎语音 API 错误 [${response.status}]: ${message.slice(0, 300)}`, response.status, 'volces')
  }

  const raw = await response.text()
  const chunks: string[] = []
  let apiError = ''
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const frame = JSON.parse(line) as { code?: number; message?: string; data?: string }
      if (frame.code === 0 && frame.data) chunks.push(frame.data)
      if (frame.code && frame.code !== 0 && frame.code !== 20000000) apiError = frame.message || `code ${frame.code}`
    } catch { /* ignore keep-alive lines */ }
  }
  if (apiError) throw new AIError(`火山引擎语音生成失败: ${apiError}`, 502, 'volces')
  if (chunks.length === 0) throw new AIError('火山引擎语音未返回音频数据', 502, 'volces')

  return {
    taskId: crypto.randomUUID(),
    status: 'completed',
    audioUrl: `data:audio/mpeg;base64,${chunks.join('')}`,
    provider: 'volces',
  }
}

function toSunoApiModel(model: string): 'V6' | 'V6_WILD' | 'V6_MINI' {
  if (model === 'suno-v6-wild') return 'V6_WILD'
  if (model === 'suno-v6-mini') return 'V6_MINI'
  return 'V6'
}

interface SunoData {
  taskId?: string
  status?: string
  errorMessage?: string | null
  response?: {
    taskId?: string
    sunoData?: Array<{
      audio_url?: string
      stream_audio_url?: string
      image_url?: string
      title?: string
      prompt?: string
      duration?: number
    }>
  }
}

/** Suno API（docs.sunoapi.org）歌曲生成。 */
export async function songGenSuno(req: SongGenRequest): Promise<SongGenResponse> {
  const config = getConfig('suno')
  if (!config?.apiKey) throw new AIError('Suno 未配置 API Key', 401, 'suno')
  const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/api/v1/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      customMode: Boolean(req.lyrics || req.title || req.style),
      instrumental: Boolean(req.instrumental),
      model: toSunoApiModel(req.model),
      ...(req.prompt ? { prompt: req.prompt } : {}),
      ...(req.lyrics ? { lyrics: req.lyrics } : {}),
      ...(req.title ? { title: req.title } : {}),
      ...(req.style ? { style: req.style } : {}),
    }),
    signal: AbortSignal.timeout(300_000),
  })
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new AIError(`Suno API 错误 [${response.status}]: ${message.slice(0, 300)}`, response.status, 'suno')
  }
  const payload = await response.json() as { code?: number; msg?: string; data?: { taskId?: string } }
  if (payload.code !== 200 || !payload.data?.taskId) {
    throw new AIError(`Suno 任务创建失败: ${payload.msg || '未返回 taskId'}`, 502, 'suno')
  }
  return {
    taskId: payload.data.taskId,
    songId: payload.data.taskId,
    status: 'pending',
    provider: 'suno',
    title: req.title,
  }
}

export async function songTaskSuno(taskId: string, model = 'suno-v6'): Promise<SongGenResponse> {
  const config = getConfig('suno')
  if (!config?.apiKey) throw new AIError('Suno 未配置 API Key', 401, 'suno')
  const url = new URL(`${config.baseUrl.replace(/\/+$/, '')}/api/v1/generate/record-info`)
  url.searchParams.set('taskId', taskId)
  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${config.apiKey}` },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new AIError(`Suno 查询错误 [${response.status}]: ${message.slice(0, 300)}`, response.status, 'suno')
  }
  const payload = await response.json() as { code?: number; msg?: string; data?: SunoData }
  const data = payload.data
  if (payload.code !== 200 || !data) {
    throw new AIError(`Suno 查询失败: ${payload.msg || '返回数据为空'}`, 502, 'suno')
  }
  const song = data.response?.sunoData?.[0]
  const apiStatus = String(data.status || 'PENDING').toUpperCase()
  const status: TaskStatus =
    apiStatus === 'SUCCESS' ? 'completed' :
    ['CREATE_TASK_FAILED', 'GENERATE_AUDIO_FAILED', 'CALLBACK_EXCEPTION', 'SENSITIVE_WORD_ERROR'].includes(apiStatus)
      ? 'failed' :
    apiStatus === 'FIRST_SUCCESS' ? 'running' :
    'pending'
  return {
    taskId,
    songId: taskId,
    status,
    audioUrl: song?.audio_url || song?.stream_audio_url,
    coverUrl: song?.image_url,
    title: song?.title,
    lyrics: song?.prompt,
    duration: song?.duration,
    provider: 'suno',
  }
}
