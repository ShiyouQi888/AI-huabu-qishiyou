'use client'

import { memo, useState, useEffect, useRef, useCallback } from 'react'
import { NodeProps, Node } from '@xyflow/react'
import { FileCode2, Sparkles, Loader2, Check, RotateCcw } from 'lucide-react'
import { CustomNodeData, useFlowStore } from '@/lib/store'
import { ModelSelector } from '@/components/model-selector'
import { NodeBase } from './node-base'
import { useModels } from '@/hooks/use-models'
import { cn } from '@/lib/utils'
import {
  ContentType, CONTENT_GROUPS, CONTENT_TYPE_LABELS,
  DRAMA_BATCH_SIZE, buildShortDramaPrompt, buildDramaEpisodesBatchPrompt,
  buildMoviePrompt, buildMicrofilmPrompt,
  buildShortVideoPrompt, buildVlogPrompt, buildLivestreamPrompt,
  buildAdPrompt, buildPromoPrompt, buildMVPrompt, buildMotionPosterPrompt,
  buildDocumentaryPrompt, buildTutorialPrompt, buildCommentaryPrompt,
} from './script-node-prompts'

// ─── Option arrays ────────────────────────────────────────────────────────────

const DRAMA_TEMPLATES = ['打脸逆袭', '先婚后爱', '重生复仇', '霸总甜宠', '赘婿崛起', '穿越古代', '替嫁真千金', '闪婚契约']
const DRAMA_EP_COUNTS = [20, 40, 60, 80, 100]
const DRAMA_EP_DURATIONS = [{ v: 60, label: '60s' }, { v: 90, label: '90s' }, { v: 120, label: '2min' }, { v: 180, label: '3min' }]
const DRAMA_SATISFACTION = ['打脸反杀', '逆袭财富', '甜宠爱情', '能力碾压', '复仇成功']

const MOVIE_GENRES = ['剧情', '悬疑/惊悚', '爱情', '科幻', '动作', '恐怖', '喜剧', '历史/古装', '奇幻', '犯罪']
const MOVIE_DURATIONS = [90, 100, 120, 150]

const MICROFILM_EMOTIONS = ['温馨治愈', '催泪感动', '震撼沉重', '思考回味', '轻松幽默', '孤独压抑']
const MICROFILM_POVS = ['第一人称', '第三人称', '多视角交叉']
const MICROFILM_ENDINGS = ['温馨', '催泪', '震撼', '开放留白']
const MICROFILM_DURATIONS = [5, 10, 15, 20, 30]

const SV_PLATFORMS = ['抖音', '视频号', '小红书', 'B站', 'YouTube']
const SV_HOOKS = ['反问钩子', '数字冲击', '反常识颠覆', '情感共鸣', '悬念制造']
const SV_DURATIONS = [15, 30, 60, 90]
const SV_PURPOSES = ['娱乐/搞笑', '知识科普', '情感共鸣', '产品展示', '故事叙述']

const VLOG_TYPES = ['旅行', '日常记录', '美食探店', '挑战', '纪念', '工作日常']
const VLOG_PLATFORMS = ['B站', '抖音', '视频号', 'YouTube']
const VLOG_DURATIONS = [5, 10, 15, 20]

const STREAM_TYPES = ['带货', '访谈', '教学', '才艺', '游戏', '活动发布']
const STREAM_PURPOSES = ['销售转化', '品牌曝光', '娱乐互动', '知识分享']
const STREAM_DURATIONS = [1, 2, 3, 4]

const AD_APPEALS = ['情感故事', '产品演示', '对比测试', '用户证言', '幽默创意', '名人背书']
const AD_DURATIONS = [15, 30, 45, 60]

const PROMO_SUBJECTS = ['企业/品牌', '城市/景区', '活动/赛事', '产品发布', '政务/公益', '校园/机构']
const PROMO_STYLES = ['纪实叙述', '情感故事', '大气展示', '混合风格']
const PROMO_DURATIONS = [2, 3, 5]

const MV_TYPES = ['叙事故事', '抽象概念', '歌手表演', '混合风格']
const MV_AESTHETICS = ['写实电影感', '梦幻奇幻', '街头城市', '古风国潮', '赛博朋克', '复古胶片', '极简纯粹']

const POSTER_TYPES = ['电影宣发', '活动发布', '节气创意', '品牌故事', '产品上市']
const POSTER_STYLES = ['极简高级', '科技未来', '国潮传统', '奢华精致', '活力跳跃']
const POSTER_DURATIONS = [5, 10, 15, 30]

const DOC_TYPES = ['自然生态', '人物传记', '历史文化', '社会议题', '科技探索', '美食/生活']
const DOC_STRUCTURES = ['时间线叙事', '人物追踪', '主题章节', '问题-回答式']
const DOC_DURATIONS = [20, 40, 60, 90]

const TUT_LEVELS = ['零基础', '初级', '中级', '高级']
const TUT_STYLES = ['讲解演示', '屏幕录制', '实操教学', '动画讲解', '对话问答']
const TUT_PLATFORMS = ['B站', '抖音', '视频号', 'YouTube', '企业内训']
const TUT_DURATIONS = [5, 10, 15, 20]

const COM_TYPES = ['电影解说', '历史事件', '知识科普', '产品测评', '社会现象', '故事复盘']
const COM_STYLES = ['幽默搞笑', '严肃深度', '情感共鸣', '悬疑紧张', '平静叙述']
const COM_DURATIONS = [3, 5, 10, 15]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDur(s: number): string {
  if (s === 0) return ''
  const m = Math.floor(s / 60), r = s % 60
  if (m === 0) return `${r}秒`
  return r === 0 ? `${m}分钟` : `${m}分${r}秒`
}

function parseDurToSec(str: string): number {
  if (!str) return 0
  const mMatch = str.match(/(\d+)\s*[分m]/), sMatch = str.match(/(\d+)\s*[秒s]/)
  if (mMatch || sMatch) return (mMatch ? parseInt(mMatch[1]) : 0) * 60 + (sMatch ? parseInt(sMatch[1]) : 0)
  const n = parseInt(str); return isNaN(n) ? 0 : n
}

// ─── Small UI helpers ─────────────────────────────────────────────────────────

function PillGroup<T extends string | number>({ options, value, onChange, labelFn }: {
  options: T[], value: T, onChange: (v: T) => void, labelFn?: (v: T) => string
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(o => (
        <button key={String(o)} onPointerDown={(e) => e.stopPropagation()} onClick={() => onChange(o)}
          className={cn('rounded-md px-2 py-0.5 text-[11px] transition-colors',
            value === o ? 'bg-primary/20 text-primary ring-1 ring-primary/30' : 'bg-muted/40 text-foreground/60 hover:bg-muted/70'
          )}>
          {labelFn ? labelFn(o) : String(o)}
        </button>
      ))}
    </div>
  )
}

function ParamRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-medium text-muted-foreground/55">{label}</div>
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}
      className="nodrag nopan w-full rounded-md border border-border/40 bg-background/60 px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/40"
    />
  )
}

// ─── Type-specific param panels ───────────────────────────────────────────────

function ShortDramaParams({ state, setState }: {
  state: { template: string; epCount: number; epDur: number; satisfactionType: string }
  setState: (patch: Partial<typeof state>) => void
}) {
  return (
    <div className="space-y-2.5">
      <ParamRow label="剧情模板">
        <PillGroup options={DRAMA_TEMPLATES} value={state.template} onChange={(v) => setState({ template: v })} />
      </ParamRow>
      <div className="grid grid-cols-2 gap-2">
        <ParamRow label="集数">
          <PillGroup options={DRAMA_EP_COUNTS} value={state.epCount} onChange={(v) => setState({ epCount: v })} labelFn={(v) => `${v}集`} />
        </ParamRow>
        <ParamRow label="每集时长">
          <PillGroup options={DRAMA_EP_DURATIONS.map(d => d.v)} value={state.epDur} onChange={(v) => setState({ epDur: v })} labelFn={(v) => DRAMA_EP_DURATIONS.find(d => d.v === v)?.label ?? String(v)} />
        </ParamRow>
      </div>
      <ParamRow label="爽点类型">
        <PillGroup options={DRAMA_SATISFACTION} value={state.satisfactionType} onChange={(v) => setState({ satisfactionType: v })} />
      </ParamRow>
    </div>
  )
}

function MovieParams({ state, setState }: {
  state: { genre: string; arcStart: string; arcEnd: string; conflict: string; theme: string; ending: string; duration: number }
  setState: (patch: Partial<typeof state>) => void
}) {
  return (
    <div className="space-y-2.5">
      <ParamRow label="类型/风格">
        <PillGroup options={MOVIE_GENRES} value={state.genre} onChange={(v) => setState({ genre: v })} />
      </ParamRow>
      <div className="grid grid-cols-2 gap-2">
        <ParamRow label="主角起点">
          <TextInput value={state.arcStart} onChange={(v) => setState({ arcStart: v })} placeholder="e.g. 失意落魄的画家" />
        </ParamRow>
        <ParamRow label="主角终点">
          <TextInput value={state.arcEnd} onChange={(v) => setState({ arcEnd: v })} placeholder="e.g. 重获自我的艺术家" />
        </ParamRow>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ParamRow label="时长">
          <PillGroup options={MOVIE_DURATIONS} value={state.duration} onChange={(v) => setState({ duration: v })} labelFn={(v) => `${v}分`} />
        </ParamRow>
        <ParamRow label="结局倾向">
          <PillGroup options={['悲', '喜', '开放'] as string[]} value={state.ending} onChange={(v) => setState({ ending: v })} />
        </ParamRow>
      </div>
    </div>
  )
}

function MicrofilmParams({ state, setState }: {
  state: { emotion: string; pov: string; endingMood: string; duration: number }
  setState: (patch: Partial<typeof state>) => void
}) {
  return (
    <div className="space-y-2.5">
      <ParamRow label="核心情感"><PillGroup options={MICROFILM_EMOTIONS} value={state.emotion} onChange={(v) => setState({ emotion: v })} /></ParamRow>
      <ParamRow label="叙事视角"><PillGroup options={MICROFILM_POVS} value={state.pov} onChange={(v) => setState({ pov: v })} /></ParamRow>
      <div className="grid grid-cols-2 gap-2">
        <ParamRow label="结局情绪"><PillGroup options={MICROFILM_ENDINGS} value={state.endingMood} onChange={(v) => setState({ endingMood: v })} /></ParamRow>
        <ParamRow label="时长"><PillGroup options={MICROFILM_DURATIONS} value={state.duration} onChange={(v) => setState({ duration: v })} labelFn={(v) => `${v}分`} /></ParamRow>
      </div>
    </div>
  )
}

function ShortVideoParams({ state, setState }: {
  state: { platform: string; hookType: string; duration: number; purpose: string }
  setState: (patch: Partial<typeof state>) => void
}) {
  return (
    <div className="space-y-2.5">
      <ParamRow label="目标平台"><PillGroup options={SV_PLATFORMS} value={state.platform} onChange={(v) => setState({ platform: v })} /></ParamRow>
      <ParamRow label="钩子类型"><PillGroup options={SV_HOOKS} value={state.hookType} onChange={(v) => setState({ hookType: v })} /></ParamRow>
      <div className="grid grid-cols-2 gap-2">
        <ParamRow label="时长"><PillGroup options={SV_DURATIONS} value={state.duration} onChange={(v) => setState({ duration: v })} labelFn={(v) => `${v}s`} /></ParamRow>
        <ParamRow label="内容目的"><PillGroup options={SV_PURPOSES} value={state.purpose} onChange={(v) => setState({ purpose: v })} /></ParamRow>
      </div>
    </div>
  )
}

function VlogParams({ state, setState }: {
  state: { vlogType: string; platform: string; duration: number }
  setState: (patch: Partial<typeof state>) => void
}) {
  return (
    <div className="space-y-2.5">
      <ParamRow label="Vlog类型"><PillGroup options={VLOG_TYPES} value={state.vlogType} onChange={(v) => setState({ vlogType: v })} /></ParamRow>
      <div className="grid grid-cols-2 gap-2">
        <ParamRow label="目标平台"><PillGroup options={VLOG_PLATFORMS} value={state.platform} onChange={(v) => setState({ platform: v })} /></ParamRow>
        <ParamRow label="时长"><PillGroup options={VLOG_DURATIONS} value={state.duration} onChange={(v) => setState({ duration: v })} labelFn={(v) => `${v}分`} /></ParamRow>
      </div>
    </div>
  )
}

function LivestreamParams({ state, setState }: {
  state: { streamType: string; purpose: string; duration: number }
  setState: (patch: Partial<typeof state>) => void
}) {
  return (
    <div className="space-y-2.5">
      <ParamRow label="直播类型"><PillGroup options={STREAM_TYPES} value={state.streamType} onChange={(v) => setState({ streamType: v })} /></ParamRow>
      <div className="grid grid-cols-2 gap-2">
        <ParamRow label="核心目的"><PillGroup options={STREAM_PURPOSES} value={state.purpose} onChange={(v) => setState({ purpose: v })} /></ParamRow>
        <ParamRow label="时长"><PillGroup options={STREAM_DURATIONS} value={state.duration} onChange={(v) => setState({ duration: v })} labelFn={(v) => `${v}小时`} /></ParamRow>
      </div>
    </div>
  )
}

function AdParams({ state, setState }: {
  state: { appealType: string; audience: string; duration: number }
  setState: (patch: Partial<typeof state>) => void
}) {
  return (
    <div className="space-y-2.5">
      <ParamRow label="诉求方式"><PillGroup options={AD_APPEALS} value={state.appealType} onChange={(v) => setState({ appealType: v })} /></ParamRow>
      <div className="grid grid-cols-2 gap-2">
        <ParamRow label="目标受众">
          <TextInput value={state.audience} onChange={(v) => setState({ audience: v })} placeholder="e.g. 25-35岁都市女性" />
        </ParamRow>
        <ParamRow label="时长"><PillGroup options={AD_DURATIONS} value={state.duration} onChange={(v) => setState({ duration: v })} labelFn={(v) => `${v}s`} /></ParamRow>
      </div>
    </div>
  )
}

function PromoParams({ state, setState }: {
  state: { subjectType: string; style: string; duration: number }
  setState: (patch: Partial<typeof state>) => void
}) {
  return (
    <div className="space-y-2.5">
      <ParamRow label="宣传主体"><PillGroup options={PROMO_SUBJECTS} value={state.subjectType} onChange={(v) => setState({ subjectType: v })} /></ParamRow>
      <div className="grid grid-cols-2 gap-2">
        <ParamRow label="风格"><PillGroup options={PROMO_STYLES} value={state.style} onChange={(v) => setState({ style: v })} /></ParamRow>
        <ParamRow label="时长"><PillGroup options={PROMO_DURATIONS} value={state.duration} onChange={(v) => setState({ duration: v })} labelFn={(v) => `${v}分`} /></ParamRow>
      </div>
    </div>
  )
}

function MVParams({ state, setState }: {
  state: { mvType: string; aesthetic: string }
  setState: (patch: Partial<typeof state>) => void
}) {
  return (
    <div className="space-y-2.5">
      <ParamRow label="MV类型"><PillGroup options={MV_TYPES} value={state.mvType} onChange={(v) => setState({ mvType: v })} /></ParamRow>
      <ParamRow label="美学风格"><PillGroup options={MV_AESTHETICS} value={state.aesthetic} onChange={(v) => setState({ aesthetic: v })} /></ParamRow>
    </div>
  )
}

function MotionPosterParams({ state, setState }: {
  state: { posterType: string; visualStyle: string; duration: number }
  setState: (patch: Partial<typeof state>) => void
}) {
  return (
    <div className="space-y-2.5">
      <ParamRow label="海报类型"><PillGroup options={POSTER_TYPES} value={state.posterType} onChange={(v) => setState({ posterType: v })} /></ParamRow>
      <div className="grid grid-cols-2 gap-2">
        <ParamRow label="视觉风格"><PillGroup options={POSTER_STYLES} value={state.visualStyle} onChange={(v) => setState({ visualStyle: v })} /></ParamRow>
        <ParamRow label="时长"><PillGroup options={POSTER_DURATIONS} value={state.duration} onChange={(v) => setState({ duration: v })} labelFn={(v) => `${v}s`} /></ParamRow>
      </div>
    </div>
  )
}

function DocumentaryParams({ state, setState }: {
  state: { docType: string; structure: string; duration: number }
  setState: (patch: Partial<typeof state>) => void
}) {
  return (
    <div className="space-y-2.5">
      <ParamRow label="纪录片类型"><PillGroup options={DOC_TYPES} value={state.docType} onChange={(v) => setState({ docType: v })} /></ParamRow>
      <div className="grid grid-cols-2 gap-2">
        <ParamRow label="叙事结构"><PillGroup options={DOC_STRUCTURES} value={state.structure} onChange={(v) => setState({ structure: v })} /></ParamRow>
        <ParamRow label="时长"><PillGroup options={DOC_DURATIONS} value={state.duration} onChange={(v) => setState({ duration: v })} labelFn={(v) => `${v}分`} /></ParamRow>
      </div>
    </div>
  )
}

function TutorialParams({ state, setState }: {
  state: { level: string; teachStyle: string; platform: string; duration: number }
  setState: (patch: Partial<typeof state>) => void
}) {
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <ParamRow label="受众水平"><PillGroup options={TUT_LEVELS} value={state.level} onChange={(v) => setState({ level: v })} /></ParamRow>
        <ParamRow label="教学风格"><PillGroup options={TUT_STYLES} value={state.teachStyle} onChange={(v) => setState({ teachStyle: v })} /></ParamRow>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ParamRow label="发布平台"><PillGroup options={TUT_PLATFORMS} value={state.platform} onChange={(v) => setState({ platform: v })} /></ParamRow>
        <ParamRow label="时长"><PillGroup options={TUT_DURATIONS} value={state.duration} onChange={(v) => setState({ duration: v })} labelFn={(v) => `${v}分`} /></ParamRow>
      </div>
    </div>
  )
}

function CommentaryParams({ state, setState }: {
  state: { commentaryType: string; style: string; duration: number }
  setState: (patch: Partial<typeof state>) => void
}) {
  return (
    <div className="space-y-2.5">
      <ParamRow label="解说类型"><PillGroup options={COM_TYPES} value={state.commentaryType} onChange={(v) => setState({ commentaryType: v })} /></ParamRow>
      <div className="grid grid-cols-2 gap-2">
        <ParamRow label="风格"><PillGroup options={COM_STYLES} value={state.style} onChange={(v) => setState({ style: v })} /></ParamRow>
        <ParamRow label="时长"><PillGroup options={COM_DURATIONS} value={state.duration} onChange={(v) => setState({ duration: v })} labelFn={(v) => `${v}分`} /></ParamRow>
      </div>
    </div>
  )
}

// ─── Main Node ────────────────────────────────────────────────────────────────

type ScriptNodeProps = NodeProps<Node<CustomNodeData>>

function ScriptNode({ id, data, selected }: ScriptNodeProps) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const deleteNode = useFlowStore((s) => s.deleteNode)
  const createScreenplayNode = useFlowStore((s) => s.createScreenplayNode)

  const readMeta = useCallback(() => {
    try { return data.meta ? JSON.parse(data.meta as string) : {} } catch { return {} }
  }, [data.meta])

  const writeMeta = useCallback((patch: Record<string, unknown>) => {
    try {
      const current = data.meta ? JSON.parse(data.meta as string) : {}
      updateNodeData(id, { meta: JSON.stringify({ ...current, ...patch }) })
    } catch {
      updateNodeData(id, { meta: JSON.stringify(patch) })
    }
  }, [id, updateNodeData, data.meta])

  // ── Type ──────────────────────────────────────────────────────────────────
  const [contentType, setContentType] = useState<ContentType>(() => readMeta().contentType ?? 'shortdrama')

  // ── Brief ──────────────────────────────────────────────────────────────────
  const [brief, setBrief] = useState(data.content || '')

  // ── Short drama ────────────────────────────────────────────────────────────
  const [drama, setDramaRaw] = useState({
    template: readMeta().dramaTemplate ?? DRAMA_TEMPLATES[0],
    epCount: readMeta().epCount ?? 40,
    epDur: readMeta().epDur ?? 90,
    satisfactionType: readMeta().satisfactionType ?? DRAMA_SATISFACTION[0],
  })
  const setDrama = (patch: Partial<typeof drama>) => {
    const next = { ...drama, ...patch }
    setDramaRaw(next)
    writeMeta({ dramaTemplate: next.template, epCount: next.epCount, epDur: next.epDur, satisfactionType: next.satisfactionType })
  }

  // ── Movie ──────────────────────────────────────────────────────────────────
  const [movie, setMovieRaw] = useState({
    genre: readMeta().movieGenre ?? '剧情',
    arcStart: '', arcEnd: '', conflict: '', theme: '',
    ending: '喜', duration: 120,
  })
  const setMovie = (patch: Partial<typeof movie>) => {
    const next = { ...movie, ...patch }
    setMovieRaw(next)
    writeMeta({ movieGenre: next.genre })
  }

  // ── Microfilm ──────────────────────────────────────────────────────────────
  const [microfilm, setMicrofilmRaw] = useState({ emotion: MICROFILM_EMOTIONS[0], pov: MICROFILM_POVS[1], endingMood: MICROFILM_ENDINGS[0], duration: 10 })
  const setMicrofilm = (patch: Partial<typeof microfilm>) => setMicrofilmRaw(p => ({ ...p, ...patch }))

  // ── Short video ────────────────────────────────────────────────────────────
  const [sv, setSvRaw] = useState({ platform: '抖音', hookType: SV_HOOKS[0], duration: 60, purpose: SV_PURPOSES[0] })
  const setSv = (patch: Partial<typeof sv>) => setSvRaw(p => ({ ...p, ...patch }))

  // ── Vlog ───────────────────────────────────────────────────────────────────
  const [vlog, setVlogRaw] = useState({ vlogType: VLOG_TYPES[0], platform: 'B站', duration: 10 })
  const setVlog = (patch: Partial<typeof vlog>) => setVlogRaw(p => ({ ...p, ...patch }))

  // ── Livestream ─────────────────────────────────────────────────────────────
  const [stream, setStreamRaw] = useState({ streamType: '带货', purpose: '销售转化', duration: 2 })
  const setStream = (patch: Partial<typeof stream>) => setStreamRaw(p => ({ ...p, ...patch }))

  // ── Ad ─────────────────────────────────────────────────────────────────────
  const [ad, setAdRaw] = useState({ appealType: AD_APPEALS[0], audience: '', duration: 30 })
  const setAd = (patch: Partial<typeof ad>) => setAdRaw(p => ({ ...p, ...patch }))

  // ── Promo ──────────────────────────────────────────────────────────────────
  const [promo, setPromoRaw] = useState({ subjectType: PROMO_SUBJECTS[0], style: PROMO_STYLES[0], duration: 3 })
  const setPromo = (patch: Partial<typeof promo>) => setPromoRaw(p => ({ ...p, ...patch }))

  // ── MV ─────────────────────────────────────────────────────────────────────
  const [mv, setMvRaw] = useState({ mvType: MV_TYPES[0], aesthetic: MV_AESTHETICS[0] })
  const setMv = (patch: Partial<typeof mv>) => setMvRaw(p => ({ ...p, ...patch }))

  // ── Motion poster ──────────────────────────────────────────────────────────
  const [poster, setPosterRaw] = useState({ posterType: POSTER_TYPES[0], visualStyle: POSTER_STYLES[0], duration: 15 })
  const setPoster = (patch: Partial<typeof poster>) => setPosterRaw(p => ({ ...p, ...patch }))

  // ── Documentary ────────────────────────────────────────────────────────────
  const [doc, setDocRaw] = useState({ docType: DOC_TYPES[0], structure: DOC_STRUCTURES[0], duration: 40 })
  const setDoc = (patch: Partial<typeof doc>) => setDocRaw(p => ({ ...p, ...patch }))

  // ── Tutorial ───────────────────────────────────────────────────────────────
  const [tut, setTutRaw] = useState({ level: TUT_LEVELS[1], teachStyle: TUT_STYLES[0], platform: 'B站', duration: 10 })
  const setTut = (patch: Partial<typeof tut>) => setTutRaw(p => ({ ...p, ...patch }))

  // ── Commentary ─────────────────────────────────────────────────────────────
  const [com, setComRaw] = useState({ commentaryType: COM_TYPES[0], style: COM_STYLES[0], duration: 5 })
  const setCom = (patch: Partial<typeof com>) => setComRaw(p => ({ ...p, ...patch }))

  // ── Generation ─────────────────────────────────────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false)
  const [charCount, setCharCount] = useState(0)
  const [generated, setGenerated] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const { models: textModels } = useModels({ type: 'text' })
  const [selectedModel, setSelectedModel] = useState('')
  useEffect(() => {
    if (textModels.length > 0 && !selectedModel) setSelectedModel(textModels[0].id)
  }, [textModels, selectedModel])

  const handleTypeChange = (type: ContentType) => {
    setContentType(type)
    writeMeta({ contentType: type })
  }

  const handleBriefChange = (value: string) => {
    setBrief(value)
    updateNodeData(id, { content: value, status: value.trim() ? 'ready' : 'idle' })
  }

  // ── Build prompt ───────────────────────────────────────────────────────────
  const buildPrompt = useCallback(() => {
    switch (contentType) {
      case 'shortdrama': return buildShortDramaPrompt({ template: drama.template, episodeCount: drama.epCount, episodeDuration: drama.epDur, brief, satisfactionType: drama.satisfactionType })
      case 'movie':      return buildMoviePrompt({ ...movie, brief })
      case 'microfilm':  return buildMicrofilmPrompt({ coreEmotion: microfilm.emotion, pov: microfilm.pov, endingMood: microfilm.endingMood, duration: microfilm.duration, brief })
      case 'shortvideo': return buildShortVideoPrompt({ ...sv, brief })
      case 'vlog':       return buildVlogPrompt({ ...vlog, brief })
      case 'livestream': return buildLivestreamPrompt({ ...stream, brief })
      case 'ad':         return buildAdPrompt({ ...ad, brief })
      case 'promo':      return buildPromoPrompt({ ...promo, brief })
      case 'mv':         return buildMVPrompt({ ...mv, brief })
      case 'motionposter': return buildMotionPosterPrompt({ ...poster, brief })
      case 'documentary':  return buildDocumentaryPrompt({ ...doc, brief })
      case 'tutorial':     return buildTutorialPrompt({ ...tut, brief })
      case 'commentary':   return buildCommentaryPrompt({ ...com, brief })
    }
  }, [contentType, drama, movie, microfilm, sv, vlog, stream, ad, promo, mv, poster, doc, tut, com, brief])

  // ── Generate ───────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!brief.trim() || isGenerating || !selectedModel) return
    setIsGenerating(true)
    setGenerated(false)
    setCharCount(0)
    setGenError(null)
    updateNodeData(id, { status: 'generating' })

    const controller = new AbortController()
    abortRef.current = controller
    const { system, user } = buildPrompt()

    // One text-generation call
    const callText = async (sys: string, usr: string) => {
      const res = await fetch('/api/generate/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel, prompt: usr, systemPrompt: sys, temperature: 0.8, maxTokens: 8000 }),
        signal: controller.signal,
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({} as Record<string, string>))
        throw new Error(errBody.error || `HTTP ${res.status}`)
      }
      const result = await res.json() as { text: string }
      const t = result.text?.trim()
      if (!t) throw new Error('生成结果为空')
      return t
    }
    const parseJson = (raw: string) => {
      const m = raw.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('无法解析生成内容，请重试')
      const s = m[0].replace(/,\s*\]/g, ']').replace(/,\s*\}/g, '}').replace(/:\s*undefined/g, ': null')
      return JSON.parse(s)
    }

    try {
      const fullText = await callText(system, user)
      setCharCount(fullText.length)
      const parsed = parseJson(fullText)
      if (!parsed.title) throw new Error('格式错误：缺少标题字段')

      // Short drama: the first call yields up to DRAMA_BATCH_SIZE episode outlines.
      // Fill the rest in continuation batches until we reach the chosen episode count.
      if (contentType === 'shortdrama' && Array.isArray(parsed.episodes)) {
        const target = drama.epCount
        let episodes = [...parsed.episodes]
        let guard = 0
        while (episodes.length < target && guard < 20) {
          guard++
          const from = episodes.length + 1
          const to = Math.min(target, episodes.length + DRAMA_BATCH_SIZE)
          const prev = episodes[episodes.length - 1]
          const { system: bs, user: bu } = buildDramaEpisodesBatchPrompt({
            from, to,
            template: drama.template,
            satisfactionType: drama.satisfactionType,
            episodeDuration: drama.epDur,
            title: parsed.title,
            synopsis: parsed.synopsis || '',
            characters: parsed.characters ?? [],
            content: typeof parsed.content === 'string' ? parsed.content : '',
            previousCliffhanger: prev?.cliffhanger,
          })
          const batchText = await callText(bs, bu)
          setCharCount((c) => c + batchText.length)
          const batchEps = (() => { try { return parseJson(batchText).episodes } catch { return [] } })()
          if (!Array.isArray(batchEps) || batchEps.length === 0) break
          episodes = [...episodes, ...batchEps]
        }
        parsed.episodes = episodes.slice(0, target).map((e, i) => ({ ...e, ep: e.ep ?? i + 1 }))
      }

      const contentStr = typeof parsed.content === 'string'
        ? parsed.content
        : JSON.stringify(parsed, null, 2)

      const isDrama = contentType === 'shortdrama'
      createScreenplayNode(id, {
        title: parsed.title,
        synopsis: parsed.synopsis || '',
        content: contentStr,
        scriptDuration: isDrama ? `${drama.epCount}集 × ${drama.epDur}秒` : '',
        styles: [CONTENT_TYPE_LABELS[contentType]],
        contentType,
        firstHook: parsed.firstHook,
        episodeDuration: isDrama ? drama.epDur : undefined,
        characters: isDrama ? (parsed.characters ?? []) : undefined,
        episodes: isDrama ? (parsed.episodes ?? []) : undefined,
      })

      setGenerated(true)
      updateNodeData(id, { status: 'completed' })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        updateNodeData(id, { status: brief.trim() ? 'ready' : 'idle' })
        return
      }
      setGenError(err instanceof Error ? err.message : '未知错误')
      updateNodeData(id, { status: 'failed' })
    } finally {
      setIsGenerating(false)
      abortRef.current = null
    }
  }

  const handleReset = () => {
    setGenerated(false)
    setGenError(null)
    setCharCount(0)
    updateNodeData(id, { status: brief.trim() ? 'ready' : 'idle' })
  }

  // ── Placeholder per type ───────────────────────────────────────────────────
  const briefPlaceholder: Partial<Record<ContentType, string>> = {
    shortdrama: '描述故事方向：主角处境、初始冲突、你想要的爽点...',
    movie: '描述故事世界和主角的处境，核心矛盾是什么...',
    microfilm: '描述你想表达的情感或故事，一个场景或一段关系...',
    shortvideo: '描述你要说什么、传递什么情绪或信息...',
    vlog: '描述这次vlog的核心事件或你想记录什么...',
    livestream: '描述直播主题，要卖什么/聊什么/做什么...',
    ad: '描述产品/服务特点，最想打动用户的点是什么...',
    promo: '描述宣传主体的核心价值和最想传达的信息...',
    mv: '描述歌曲情感、歌词主题，或你想呈现的视觉故事...',
    motionposter: '描述海报要传递的核心信息和视觉感受...',
    documentary: '描述你的命题：想探索什么问题或记录什么...',
    tutorial: '描述要教什么技能，学完之后用户能做到什么...',
    commentary: '描述解说对象，你的核心观点或想挖掘的角度...',
  }

  return (
    <NodeBase
      nodeId={id}
      nodeType="script"
      label={data.label}
      status={data.status}
      selected={selected}
      onDelete={() => deleteNode(id)}
      icon={<FileCode2 className="size-3.5" />}
      width="w-[440px]"
    >
      {/* ── Type selector ── */}
      <div className="nodrag nopan space-y-1.5" onPointerDown={(e) => e.stopPropagation()}>
        {CONTENT_GROUPS.map(({ label, types }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="w-14 shrink-0 text-[10px] text-muted-foreground/50">{label}</span>
            <div className="flex flex-wrap gap-1">
              {types.map(t => (
                <button key={t.id} onClick={() => handleTypeChange(t.id)}
                  className={cn(
                    'rounded-md px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                    contentType === t.id
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/40 text-foreground/60 hover:bg-muted/70 hover:text-foreground/80'
                  )}>
                  {CONTENT_TYPE_LABELS[t.id]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Type-specific params ── */}
      <div className="nodrag nopan mt-3 rounded-xl border border-border/30 bg-muted/10 p-3"
        onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        {contentType === 'shortdrama'   && <ShortDramaParams state={drama} setState={setDrama} />}
        {contentType === 'movie'        && <MovieParams state={movie} setState={setMovie} />}
        {contentType === 'microfilm'    && <MicrofilmParams state={microfilm} setState={setMicrofilm} />}
        {contentType === 'shortvideo'   && <ShortVideoParams state={sv} setState={setSv} />}
        {contentType === 'vlog'         && <VlogParams state={vlog} setState={setVlog} />}
        {contentType === 'livestream'   && <LivestreamParams state={stream} setState={setStream} />}
        {contentType === 'ad'           && <AdParams state={ad} setState={setAd} />}
        {contentType === 'promo'        && <PromoParams state={promo} setState={setPromo} />}
        {contentType === 'mv'           && <MVParams state={mv} setState={setMv} />}
        {contentType === 'motionposter' && <MotionPosterParams state={poster} setState={setPoster} />}
        {contentType === 'documentary'  && <DocumentaryParams state={doc} setState={setDoc} />}
        {contentType === 'tutorial'     && <TutorialParams state={tut} setState={setTut} />}
        {contentType === 'commentary'   && <CommentaryParams state={com} setState={setCom} />}
      </div>

      {/* ── Brief input ── */}
      <div className="nodrag nopan mt-2.5 rounded-xl border border-border/50 bg-muted/20 transition-colors focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/20"
        onPointerDown={(e) => e.stopPropagation()}>
        <textarea
          value={brief}
          onChange={(e) => handleBriefChange(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder={briefPlaceholder[contentType] ?? '输入你的创意方向...'}
          rows={3}
          className="nodrag nopan block w-full resize-none bg-transparent px-3.5 py-3 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
        />
      </div>

      {/* ── Generation status ── */}
      {isGenerating && (
        <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-3">
          <Loader2 className="size-4 animate-spin text-primary" />
          <span className="text-[12px] text-primary">AI 正在创作...</span>
          {charCount > 0 && <span className="ml-auto text-[10px] text-primary/50">{charCount.toLocaleString()} 字</span>}
        </div>
      )}

      {genError && !isGenerating && (
        <div className="mt-2.5 rounded-xl border border-red-500/20 bg-red-500/5 px-3.5 py-2.5 text-[12px] text-red-400">
          生成失败：{genError}
        </div>
      )}

      {generated && !isGenerating && (
        <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-2.5">
          <Check className="size-3.5 text-emerald-500" />
          <span className="text-[12px] text-emerald-400">已生成，脚本节点已创建在画布上</span>
        </div>
      )}

      {/* ── Bottom bar ── */}
      <div className="-mx-3.5 mt-3 flex items-center gap-1.5 border-t border-border/40 px-3.5 pt-2.5">
        <ModelSelector models={textModels} selected={selectedModel} onSelect={setSelectedModel} />
        <div className="flex-1" />
        {isGenerating ? (
          <button onPointerDown={(e) => e.stopPropagation()} onClick={() => abortRef.current?.abort()}
            className="flex size-7 items-center justify-center rounded-full bg-red-500 shadow-md shadow-red-500/20 transition-all hover:bg-red-600"
            title="中止生成">
            <div className="size-2.5 rounded-sm bg-white" />
          </button>
        ) : generated ? (
          <button onPointerDown={(e) => e.stopPropagation()} onClick={handleReset}
            className="flex items-center gap-1.5 rounded-full border border-border/40 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/30">
            <RotateCcw className="size-3" />
            重新生成
          </button>
        ) : (
          <button onPointerDown={(e) => e.stopPropagation()} onClick={handleGenerate}
            disabled={!brief.trim() || !selectedModel || isGenerating}
            className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-[11px] font-medium text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-40">
            <Sparkles className="size-3" />
            生成{CONTENT_TYPE_LABELS[contentType]}脚本
          </button>
        )}
      </div>
    </NodeBase>
  )
}

export default memo(ScriptNode)
