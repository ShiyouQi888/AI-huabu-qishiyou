/**
 * AI 服务统一入口
 *
 * 根据 modelId → Provider 分发到对应的客户端
 */

import type {
  TextGenRequest,
  TextGenResponse,
  ImageGenRequest,
  ImageGenResponse,
  VideoGenRequest,
  VideoGenResponse,
  AudioGenRequest,
  AudioGenResponse,
  SongGenRequest,
  SongGenResponse,
} from './types'
import { AIError } from './types'
import { getProviderForModel } from './config'
import {
  textGen, textGenStream, imageGen,
  videoGenSeedance, videoTaskSeedance,
  videoGenCogVideoX, videoTaskCogVideoX,
  audioGenCosyVoice, audioTaskCosyVoice, audioGenVolces,
  songGenSuno, songTaskSuno,
} from './client'

// Model registry lives in its own module (see models.ts) so client.ts can read
// capabilities like maxTokens without an index.ts ↔ client.ts import cycle.
export { MODELS, getModelsByType, getModelMaxTokens } from './models'

/** 文本生成 */
export async function generateText(req: TextGenRequest): Promise<TextGenResponse> {
  const provider = getProviderForModel(req.model)
  if (!provider) throw new AIError(`不支持的模型: ${req.model}`, 400)
  return textGen(provider, req)
}

/** 文本生成（流式 SSE） */
export async function generateTextStream(req: TextGenRequest): Promise<ReadableStream<Uint8Array>> {
  const provider = getProviderForModel(req.model)
  if (!provider) throw new AIError(`不支持的模型: ${req.model}`, 400)
  return textGenStream(provider, req)
}

/** 图片生成 */
export async function generateImage(req: ImageGenRequest): Promise<ImageGenResponse> {
  const provider = getProviderForModel(req.model)
  if (!provider) throw new AIError(`不支持的模型: ${req.model}`, 400)
  return imageGen(provider, req)
}

/** 视频生成（异步任务） */
export async function generateVideo(req: VideoGenRequest): Promise<VideoGenResponse> {
  const provider = getProviderForModel(req.model)
  if (!provider) throw new AIError(`不支持的模型: ${req.model}`, 400)

  if (provider === 'volces') {
    const result = await videoGenSeedance(req)
    return { ...result, provider }
  }
  if (provider === 'zhipu') {
    const result = await videoGenCogVideoX(req)
    return { ...result, provider }
  }

  throw new AIError(`视频生成暂不支持 ${provider}`, 400, provider)
}

/** 视频任务状态查询 */
export async function queryVideoTask(taskId: string, provider?: string): Promise<VideoGenResponse> {
  if (provider === 'zhipu') {
    return videoTaskCogVideoX(taskId)
  }
  return videoTaskSeedance(taskId)
}

/** 音频生成（CosyVoice TTS） */
export async function generateAudio(req: AudioGenRequest): Promise<AudioGenResponse> {
  const provider = getProviderForModel(req.model)
  if (!provider) throw new AIError(`不支持的模型: ${req.model}`, 400)

  if (provider === 'qwen') {
    return audioGenCosyVoice(req)
  }
  if (provider === 'volces') {
    return audioGenVolces(req)
  }

  throw new AIError(`音频生成暂不支持 ${provider}`, 400, provider)
}

/** 音频任务状态查询 */
export async function queryAudioTask(taskId: string): Promise<AudioGenResponse> {
  return audioTaskCosyVoice(taskId)
}

export async function generateSong(req: SongGenRequest): Promise<SongGenResponse> {
  const provider = getProviderForModel(req.model)
  if (provider !== 'suno') throw new AIError(`歌曲生成暂不支持 ${provider ?? req.model}`, 400, provider)
  return songGenSuno(req)
}

export async function querySongTask(taskId: string, model = 'suno-v6'): Promise<SongGenResponse> {
  return songTaskSuno(taskId, model)
}
