/**
 * AI 服务通用类型定义
 */

/** 生成任务状态 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed'

/** 文本生成请求 */
export interface TextGenRequest {
  model: string
  prompt: string
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  /** 上游节点的输出文本（串联上下文） */
  contextTexts?: string[]
}

/** 文本生成响应 */
export interface TextGenResponse {
  text: string
  model: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/** 图片生成请求 */
export interface ImageGenRequest {
  model: string
  prompt: string
  negativePrompt?: string
  width?: number
  height?: number
  count?: number
  /** 参考图 URL（图生图） */
  referenceImage?: string
  /** 风格参考 */
  styleReference?: string
  referenceImages?: string[]
  interactiveEdit?: boolean
  annotations?: Array<{ type: 'point' | 'bbox'; imageIndex?: number; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number; prompt?: string }>
  layerDecomposition?: boolean
}

export interface ImageLayerResult {
  url: string
  name?: string
  description?: string
  zIndex?: number
  boundingBox?: { absolute?: number[]; normalized?: number[] }
}

export interface ImageGenResponse {
  imageUrl: string
  imageUrls?: string[]
  layers?: ImageLayerResult[]
}

/** 视频生成请求 */
export interface VideoGenRequest {
  model: string
  prompt: string
  negativePrompt?: string
  duration?: number
  resolution?: string
  ratio?: string
  /** 首帧图片 */
  firstFrameImage?: string
  /** 尾帧图片 */
  lastFrameImage?: string
  /** 参考视频 URL */
  referenceVideo?: string
  /** 全能参考模式：内联素材引用（@label 标记对应的素材 URL） */
  references?: Array<{ label: string; url: string; type?: 'image' | 'video' | 'audio' }>
}

/** 视频生成响应 */
export interface VideoGenResponse {
  taskId: string
  status: TaskStatus
  provider?: string
  /** 完成后返回的视频 URL */
  videoUrl?: string
  /** 预估等待时间（秒） */
  estimatedSeconds?: number
}

/** 音频生成请求 */
export interface AudioGenRequest {
  model: string
  text: string
  voice?: string
  speed?: number
  /** 参考音频 URL（音色克隆） */
  referenceAudio?: string
}

/** 音频生成响应 */
export interface AudioGenResponse {
  taskId: string
  status: TaskStatus
  audioUrl?: string
  duration?: number
  provider?: string
}

export interface SongGenRequest {
  model: string
  prompt: string
  lyrics?: string
  title?: string
  style?: string
  instrumental?: boolean
}

export interface SongGenResponse extends AudioGenResponse {
  songId?: string
  title?: string
  lyrics?: string
  coverUrl?: string
}

/** 模型信息 */
export interface ModelInfo {
  id: string
  name: string
  type: 'text' | 'image' | 'video' | 'audio'
  provider: string
  description?: string
  tags?: string[]
  /** 模型能力 */
  capabilities?: {
    maxTokens?: number
    maxResolution?: string
    maxDuration?: number
    supportedRatios?: string[]
  }
}

/** Provider 配置 */
export interface ProviderConfig {
  id?: string
  name: string
  apiKey: string
  baseUrl: string
  /** 当前启用的模型列表（已排除被禁用的） */
  models: string[]
  /** 全部模型列表（含被禁用的） */
  allModels?: string[]
  /** 被禁用的模型 ID 列表 */
  disabledModels?: string[]
  enabled: boolean
}

/** API 错误 */
export class AIError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public provider?: string,
  ) {
    super(message)
    this.name = 'AIError'
    Object.setPrototypeOf(this, AIError.prototype)
  }
}
