'use client'

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AudioLines, Check, ChevronDown, FolderOpen, Loader2, Music2, Upload, Volume2, WandSparkles, X } from 'lucide-react'
import { NodeProps, Node } from '@xyflow/react'
import { CustomNodeData, useFlowStore } from '@/lib/store'
import { NodeBase } from './node-base'
import { ModelSelector } from '@/components/model-selector'
import { useModels, type ModelOption } from '@/hooks/use-models'
import { cn } from '@/lib/utils'

type AudioNodeProps = NodeProps<Node<CustomNodeData>>
type AudioMode = 'tts' | 'clone' | 'song'

const FALLBACK_MODELS: ModelOption[] = [
  { id: 'doubao-tts-2.0', name: '豆包语音合成 2.0', description: '火山引擎文生语音', configured: true },
  { id: 'cosyvoice-v3.5-plus', name: 'CosyVoice V3.5 Plus', description: '阿里音色克隆', configured: true },
  { id: 'suno-v6', name: 'Suno V6', description: '歌曲生成', configured: true },
]

const VOLC_VOICES = [
  { id: 'zh_female_vv_uranus_bigtts', label: 'VV 女声 · 自然' },
  { id: 'zh_male_dayi_uranus_bigtts', label: '大义男声 · 稳重' },
  { id: 'zh_female_sajiaoxuemei_moon_bigtts', label: '撒娇学妹 · 甜美' },
  { id: 'zh_male_aojiaobazong_moon_bigtts', label: '傲娇霸总 · 低沉' },
]

const COSYVOICE_VOICES = [
  { id: 'longxiaochun', label: '小淳 · 温和' },
  { id: 'longxiaoxia', label: '小夏 · 清晰' },
  { id: 'longwan', label: '湾湾 · 亲切' },
  { id: 'longcheng', label: '小诚 · 沉稳' },
]

interface CompactSelectOption {
  id: string
  label: string
}

function CompactSelect({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: {
  value: string
  options: CompactSelectOption[]
  onChange: (value: string) => void
  ariaLabel: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 160 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const current = options.find((option) => option.id === value) ?? options[0]

  useEffect(() => {
    if (!open) return

    const syncPosition = () => {
      const button = buttonRef.current
      if (!button) return
      const rect = button.getBoundingClientRect()
      const menuHeight = menuRef.current?.offsetHeight ?? 180
      const spaceBelow = window.innerHeight - rect.bottom - 8
      setPosition({
        top: spaceBelow >= menuHeight ? rect.bottom + 6 : rect.top - menuHeight - 6,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 160) - 8)),
        width: Math.max(rect.width, 160),
      })
    }

    const handleOutside = (event: MouseEvent) => {
      if (!buttonRef.current?.contains(event.target as globalThis.Node) && !menuRef.current?.contains(event.target as globalThis.Node)) {
        setOpen(false)
      }
    }

    syncPosition()
    window.addEventListener('resize', syncPosition)
    window.addEventListener('scroll', syncPosition, true)
    document.addEventListener('mousedown', handleOutside)
    return () => {
      window.removeEventListener('resize', syncPosition)
      window.removeEventListener('scroll', syncPosition, true)
      document.removeEventListener('mousedown', handleOutside)
    }
  }, [open])

  return (
    <div className={cn('relative min-w-0', className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
        className="flex min-w-0 items-center gap-1 rounded-lg bg-muted/40 px-2 py-1.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60"
      >
        <span className="truncate">{current?.label ?? value}</span>
        <ChevronDown className={cn('size-3 shrink-0 transition-transform duration-150', open && 'rotate-180')} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-label={ariaLabel}
          style={{ position: 'fixed', top: position.top, left: position.left, width: position.width, zIndex: 100000 }}
          className="overflow-hidden rounded-xl border border-border/60 bg-popover/98 p-1 shadow-2xl shadow-black/30 backdrop-blur-xl"
        >
          {options.map((option) => {
            const selected = option.id === value
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={selected}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => {
                  onChange(option.id)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] transition-colors',
                  selected ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                <Check className={cn('size-3 shrink-0 text-primary', selected ? 'opacity-100' : 'opacity-0')} />
                <span className="truncate">{option.label}</span>
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </div>
  )
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

function AudioUploadNode({ id, data, selected }: AudioNodeProps) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const deleteNode = useFlowStore((s) => s.deleteNode)
  const openMaterialPicker = useFlowStore((s) => s.openMaterialPicker)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    updateNodeData(id, {
      audioUrl: url,
      status: 'ready',
      meta: `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`,
    })
    event.target.value = ''
  }

  const clearAudio = () => {
    updateNodeData(id, { audioUrl: undefined, status: 'idle', meta: undefined })
  }

  return (
    <NodeBase
      nodeId={id}
      nodeType="audio"
      label={data.label}
      status={data.status}
      selected={selected}
      onDelete={() => deleteNode(id)}
      icon={(
        <span className="relative flex size-4 items-center justify-center text-emerald-400">
          <AudioLines className="size-3.5" />
          <Upload className="absolute -bottom-1 -right-1 size-2.5 rounded-sm bg-card p-px" />
        </span>
      )}
      hasInput={false}
      hasOutput
      width="w-[320px]"
    >
      <div className="nodrag space-y-2.5" onPointerDown={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/60 bg-muted/20 px-3 py-2.5">
          <Upload className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-medium text-foreground">上传参考音频</div>
            <div className="truncate text-[10px] text-muted-foreground">用于全能参考、音频分析或视频生成</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => openMaterialPicker(id)}
              className="flex items-center gap-1 rounded-lg bg-muted/60 px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <FolderOpen className="size-3" />
              素材库
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 rounded-lg bg-muted/60 px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Upload className="size-3" />
              上传
            </button>
          </div>
        </div>
        {data.audioUrl && (
          <div className="group relative rounded-xl border border-border/40 bg-muted/20 p-2.5">
            <audio src={data.audioUrl as string} controls className="h-8 w-full" />
            {data.meta && <p className="mt-1 truncate text-[10px] text-muted-foreground">{data.meta as string}</p>}
            <button
              type="button"
              onClick={clearAudio}
              aria-label="清除参考音频"
              className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-background/80 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
            >
              <X className="size-3" />
            </button>
          </div>
        )}
        <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileChange} />
      </div>
    </NodeBase>
  )
}

function AudioGenerateNode({ id, data, selected }: AudioNodeProps) {
  const deleteNode = useFlowStore((s) => s.deleteNode)
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const referenceInputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<AudioMode>((data.audioMode as AudioMode) || 'tts')
  const [text, setText] = useState(String(data.content || ''))
  const [lyrics, setLyrics] = useState(String(data.lyrics || ''))
  const [title, setTitle] = useState(String(data.songTitle || ''))
  const [style, setStyle] = useState(String(data.songStyle || ''))
  const [voice, setVoice] = useState(String(data.voice || 'zh_female_vv_uranus_bigtts'))
  const [speed, setSpeed] = useState(Number(data.speed || 1))
  const [instrumental, setInstrumental] = useState(Boolean(data.instrumental))
  const [referenceAudio, setReferenceAudio] = useState<string>(String(data.referenceAudio || ''))
  const [referenceName, setReferenceName] = useState(String(data.referenceName || ''))
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')
  const { models } = useModels({ type: 'audio' })

  const configuredModels = models.length ? models : FALLBACK_MODELS
  const modeModels = useMemo(() => {
    if (mode === 'song') return configuredModels.filter((item) => item.id.startsWith('suno-'))
    if (mode === 'clone') return configuredModels.filter((item) => item.id.startsWith('cosyvoice-'))
    return configuredModels.filter((item) => item.id.startsWith('doubao-'))
  }, [configuredModels, mode])
  const fallbackModel = mode === 'song' ? 'suno-v6' : mode === 'clone' ? 'cosyvoice-v3.5-plus' : 'doubao-tts-2.0'
  const modelOptions = modeModels.length
    ? modeModels
    : [FALLBACK_MODELS.find((item) => item.id === fallbackModel) ?? FALLBACK_MODELS[0]]
  const voiceOptions = mode === 'clone' ? COSYVOICE_VOICES : VOLC_VOICES
  const presetVoice = voiceOptions.some((item) => item.id === voice) ? voice : '__custom__'
  const selectedModel = modeModels.some((item) => item.id === data.audioModel)
    ? String(data.audioModel)
    : fallbackModel

  useEffect(() => {
    updateNodeData(id, { audioMode: mode, audioModel: selectedModel })
  }, [id, mode, selectedModel, updateNodeData])

  const updateText = (value: string) => {
    setText(value)
    updateNodeData(id, { content: value })
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    updateNodeData(id, {
      audioUrl: url,
      status: 'ready',
      meta: `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`,
    })
    e.target.value = ''
  }

  const handleReferenceChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await readFileAsDataUrl(file)
      setReferenceAudio(dataUrl)
      setReferenceName(file.name)
      updateNodeData(id, { referenceAudio: dataUrl, referenceName: file.name })
    } catch {
      setError('参考音频读取失败')
    }
    e.target.value = ''
  }

  const clearResult = (e: React.MouseEvent) => {
    e.stopPropagation()
    updateNodeData(id, { audioUrl: undefined, status: 'idle', meta: undefined })
  }

  const pollSong = async (taskId: string, model: string) => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 5000))
      const response = await fetch(`/api/generate/song?taskId=${encodeURIComponent(taskId)}&model=${encodeURIComponent(model)}`)
      const result = await response.json() as { status?: string; audioUrl?: string; title?: string; error?: string }
      if (!response.ok) throw new Error(result.error || '歌曲任务查询失败')
      if (result.status === 'failed') throw new Error('歌曲生成失败')
      if (result.status === 'completed' && result.audioUrl) {
        updateNodeData(id, { audioUrl: result.audioUrl, status: 'completed', meta: result.title || 'Suno 歌曲' })
        return
      }
    }
    throw new Error('歌曲生成超时，请稍后查看 Suno 任务')
  }

  const handleGenerate = async () => {
    const prompt = text.trim()
    if (!prompt) {
      setError(mode === 'song' ? '先描述歌曲主题或风格' : '先输入要合成的文本')
      return
    }
    setError('')
    setIsGenerating(true)
    updateNodeData(id, {
      status: 'generating',
      audioModel: selectedModel,
      audioMode: mode,
      content: prompt,
      lyrics,
      songTitle: title,
      songStyle: style,
      voice,
      speed,
      instrumental,
    })

    try {
      if (mode === 'song') {
        const response = await fetch('/api/generate/song', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: selectedModel, prompt, lyrics: lyrics || undefined, title: title || undefined, style: style || undefined, instrumental }),
        })
        const result = await response.json() as { taskId?: string; error?: string }
        if (!response.ok || !result.taskId) throw new Error(result.error || '歌曲任务创建失败')
        await pollSong(result.taskId, selectedModel)
      } else {
        const response = await fetch('/api/generate/audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: selectedModel,
            text: prompt,
            voice,
            speed,
            referenceAudio: mode === 'clone' ? referenceAudio || undefined : undefined,
          }),
        })
        const result = await response.json() as { audioUrl?: string; error?: string }
        if (!response.ok || !result.audioUrl) throw new Error(result.error || '语音生成失败')
        updateNodeData(id, { audioUrl: result.audioUrl, status: 'completed', meta: mode === 'clone' ? 'CosyVoice 音色克隆' : '豆包语音合成' })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '音频生成失败'
      setError(message)
      updateNodeData(id, { status: 'failed', meta: message })
    } finally {
      setIsGenerating(false)
    }
  }

  const handleModeChange = (nextMode: AudioMode) => {
    setMode(nextMode)
    if (nextMode === 'clone' && !COSYVOICE_VOICES.some((item) => item.id === voice)) setVoice(COSYVOICE_VOICES[0].id)
    if (nextMode === 'tts' && !VOLC_VOICES.some((item) => item.id === voice)) setVoice(VOLC_VOICES[0].id)
  }

  const tabs: Array<{ id: AudioMode; label: string; icon: typeof Volume2 }> = [
    { id: 'tts', label: '文生语音', icon: Volume2 },
    { id: 'clone', label: '语音克隆', icon: WandSparkles },
    { id: 'song', label: '歌曲', icon: Music2 },
  ]

  return (
    <NodeBase
      nodeId={id}
      nodeType="audio"
      label={data.label}
      status={data.status}
      selected={selected}
      onDelete={() => deleteNode(id)}
      icon={<AudioLines className="size-3.5" />}
      hasInput={data.mode !== 'input'}
      hasOutput
      width="w-[420px]"
    >
      <div className="nodrag space-y-3" onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1 rounded-xl bg-muted/30 p-1">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => handleModeChange(tab.id)}
                className={cn(
                  'flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] transition-colors',
                  mode === tab.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-3" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {mode === 'song' ? (
          <>
            <textarea
              value={text}
              onChange={(e) => updateText(e.target.value)}
              placeholder="描述歌曲：城市夜色、女声、梦幻电子流行…"
              rows={3}
              className="nodrag nowheel w-full resize-none rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-[12px] leading-relaxed outline-none placeholder:text-muted-foreground/40 focus:border-primary/50"
            />
            <div className="grid grid-cols-2 gap-2">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="歌曲标题（可选）" className="rounded-lg border border-border/50 bg-muted/20 px-2.5 py-1.5 text-[11px] outline-none focus:border-primary/50" />
              <input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="风格标签（可选）" className="rounded-lg border border-border/50 bg-muted/20 px-2.5 py-1.5 text-[11px] outline-none focus:border-primary/50" />
            </div>
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="歌词（留空则由 Suno 自动创作）"
              rows={2}
              className="nodrag nowheel w-full resize-none rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-[11px] outline-none placeholder:text-muted-foreground/40 focus:border-primary/50"
            />
            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={instrumental} onChange={(e) => setInstrumental(e.target.checked)} className="accent-primary" />
              纯音乐
            </label>
          </>
        ) : (
          <textarea
            value={text}
            onChange={(e) => updateText(e.target.value)}
            placeholder={mode === 'clone' ? '输入要用克隆音色说出的文本…' : '输入要合成的旁白、对白或提示音文本…'}
            rows={3}
            className="nodrag nowheel w-full resize-none rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-[12px] leading-relaxed outline-none placeholder:text-muted-foreground/40 focus:border-primary/50"
          />
        )}

        {mode === 'clone' && (
          <button onClick={() => referenceInputRef.current?.click()} className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border/60 px-3 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
            <Upload className="size-3.5" />
            <span className="min-w-0 flex-1 truncate">{referenceName || '上传 5–30 秒参考音频'}</span>
            {referenceAudio && <span className="text-emerald-400">已选</span>}
          </button>
        )}

        <div className="flex items-center justify-between gap-2">
          <ModelSelector models={modelOptions} selected={selectedModel} onSelect={(value) => updateNodeData(id, { audioModel: value })} />
          {mode !== 'song' && (
            <div className="flex min-w-0 items-center gap-1.5">
              <CompactSelect
                value={presetVoice}
                options={[...voiceOptions, { id: '__custom__', label: '自定义音色 ID' }]}
                onChange={(value) => setVoice(value === '__custom__' ? '' : value)}
                ariaLabel="选择音色"
                className="max-w-[180px]"
              />
              {presetVoice === '__custom__' && (
                <input value={voice} onChange={(e) => setVoice(e.target.value)} aria-label="自定义音色 ID" placeholder="音色 ID" className="w-[120px] rounded-lg bg-muted/40 px-2 py-1.5 text-[10px] outline-none" />
              )}
              <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span>语速</span>
                <CompactSelect
                  value={String(speed)}
                  options={[0.8, 1, 1.2].map((value) => ({ id: String(value), label: `${value}x` }))}
                  onChange={(value) => setSpeed(Number(value))}
                  ariaLabel="选择语速"
                  className="shrink-0"
                />
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 rounded-lg bg-muted/50 px-2.5 py-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground">
            <Upload className="size-3" /> 上传音频
          </button>
          <button onClick={handleGenerate} disabled={isGenerating} className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
            {isGenerating ? <Loader2 className="size-3 animate-spin" /> : mode === 'song' ? <Music2 className="size-3" /> : <WandSparkles className="size-3" />}
            {isGenerating ? '生成中…' : mode === 'song' ? '生成歌曲' : '生成语音'}
          </button>
        </div>

        {data.audioUrl && (
          <div className="group relative rounded-xl border border-border/40 bg-muted/20 p-2.5">
            <audio src={data.audioUrl as string} controls className="h-8 w-full" />
            {data.meta && <p className="mt-1 truncate text-[10px] text-muted-foreground">{data.meta as string}</p>}
            <button onClick={clearResult} aria-label="清除音频" className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-background/80 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive">
              <X className="size-3" />
            </button>
          </div>
        )}

        {error && <p className="text-[10px] leading-relaxed text-destructive">{error}</p>}
      </div>

      <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileChange} />
      <input ref={referenceInputRef} type="file" accept="audio/*" className="hidden" onChange={handleReferenceChange} />
    </NodeBase>
  )
}

function AudioNode(props: AudioNodeProps) {
  return props.data.mode === 'input'
    ? <AudioUploadNode {...props} />
    : <AudioGenerateNode {...props} />
}

export default memo(AudioNode)
