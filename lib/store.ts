import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Connection,
  MarkerType,
} from '@xyflow/react'
import {
  buildStoryboardVideoGroups,
  storyboardRowsToVideoPrompt,
} from './storyboard-video-groups'

export type NodeType = 'text' | 'image' | 'imageLayer' | 'video' | 'audio' | 'script' | 'scene' | 'storyboard' | 'promptAssistant' | 'screenplay' | 'graphic' | 'graphicBrief' | 'episodeList' | 'videoSynthesis' | 'group'
export type EdgeStyleType = 'curve' | 'straight'

/** video 工具节点左侧的 4 个 tab 入参点（按 TABS 顺序） */
export const VIDEO_TAB_HANDLES = [
  'tab-text2video',
  'tab-ref',
  'tab-firstlast',
  'tab-extend',
] as const
/** image 工具节点左侧的 3 个 tab 入参点（按 TABS 顺序） */
export const IMAGE_TAB_HANDLES = [
  'tab-text2img',
  'tab-img2img',
  'tab-imgref',
] as const
/** 提示词 text 节点专用的 handle id（独立于 tab handle，跨 tab 保留） */
export const PROMPT_HANDLE = 'tab-prompt' as const
export type VideoTabHandle = (typeof VIDEO_TAB_HANDLES)[number]
export type ImageTabHandle = (typeof IMAGE_TAB_HANDLES)[number]
export const DEFAULT_TARGET_HANDLE = 'input'
export const TARGET_HANDLES = new Set<string>([DEFAULT_TARGET_HANDLE, ...VIDEO_TAB_HANDLES, ...IMAGE_TAB_HANDLES, PROMPT_HANDLE])

/** 目标端口 → 允许连接的源节点类型列表 */
export const HANDLE_SOURCE_TYPES: Record<string, NodeType[]> = {
  'tab-text2video': ['text', 'promptAssistant', 'scene', 'storyboard', 'graphicBrief'],
  'tab-ref':        ['image', 'imageLayer', 'video', 'audio', 'text', 'promptAssistant', 'scene', 'storyboard', 'graphicBrief'],
  'tab-firstlast':  ['image', 'text', 'promptAssistant', 'scene', 'storyboard', 'graphicBrief'],
  'tab-extend':     ['video', 'text', 'promptAssistant'],
  'tab-text2img':   ['text', 'promptAssistant', 'scene', 'storyboard', 'graphicBrief'],
  'tab-img2img':    ['image', 'imageLayer', 'text', 'promptAssistant', 'scene', 'storyboard', 'graphicBrief'],
  'tab-imgref':     ['image', 'imageLayer', 'text', 'promptAssistant', 'scene', 'storyboard', 'graphicBrief'],
  'tab-prompt':     ['text', 'promptAssistant', 'scene', 'storyboard', 'graphicBrief'],
}

/**
 * 目标端口 → 最大连接数。
 * - undefined / 不存在 = 无限制
 * - N = 最多允许 N 条边连到该 handle
 * - 值为 1 的端口为"独占端口"：新连接会自动替换旧连接
 */
export const HANDLE_MAX_CONNECTIONS: Record<string, number> = {
  'tab-text2video': 1,
  'tab-firstlast':  3,   // 2 frames + 1 text/promptAssistant
  'tab-extend':     2,   // 1 video + 1 text/promptAssistant
  'tab-text2img':   1,
  'tab-img2img':    2,   // 1 image + 1 text/promptAssistant
  'tab-imgref':     8,   // 多张参考图 + 1 text/promptAssistant
  'tab-prompt':     1,
  // tab-ref 无上限（由 UI 侧 MAX_REF = 15 控制）
}

export interface WorkflowSnapshot {
  nodes: Node<CustomNodeData>[]
  edges: Edge[]
  nodeCount?: Record<NodeType, number>
}

export interface CustomNodeData extends Record<string, unknown> {
  label: string
  type: NodeType
  /** 'tool' = 生成工具节点（有 prompt/参数）; 'result' = 结果展示节点; 'input' = 素材输入节点 */
  mode?: 'tool' | 'result' | 'input'
  content?: string
  imageUrl?: string
  imageUrls?: string[]
  layerItems?: Array<{ url: string; name?: string; description?: string; zIndex?: number; boundingBox?: number[] }>
  videoUrl?: string
  audioUrl?: string
  status?: 'idle' | 'ready' | 'generating' | 'completed' | 'failed'
  meta?: string
  nodeWidth?: number
  nodeHeight?: number
}

interface UndoSnapshot {
  nodes: Node<CustomNodeData>[]
  edges: Edge[]
  nodeCount: Record<NodeType, number>
}

const MAX_UNDO = 50

type StoryboardAssetShot = {
  locationName?: string
  characterNames?: string[]
  propNames?: string[]
  description?: string
  blocking?: string
  action?: string
  expression?: string
  cameraAngle?: string
  composition?: string
  dialogue?: string
}

const normalizeAssetName = (value: unknown) =>
  String(value ?? '')
    .replace(/^@+/, '')
    .replace(/[：:，,。！？!?.、\s]/g, '')
    .trim()

const storyboardShotText = (shot: StoryboardAssetShot) => [
  shot.description,
  shot.blocking,
  shot.action,
  shot.expression,
  shot.cameraAngle,
  shot.composition,
  shot.dialogue,
  shot.locationName,
  ...(shot.characterNames ?? []),
  ...(shot.propNames ?? []),
].filter(Boolean).join('\n')

const resolveStoryboardAssetNames = (
  explicitNames: unknown[] | undefined,
  candidateNames: string[],
  text: string,
) => {
  const normalizedText = normalizeAssetName(text)
  const result = new Set<string>()

  for (const raw of explicitNames ?? []) {
    const normalized = normalizeAssetName(raw)
    if (!normalized) continue
    const exact = candidateNames.find((name) => normalizeAssetName(name) === normalized)
    if (exact) {
      result.add(exact)
      continue
    }
    const fuzzy = candidateNames.find((name) => {
      const n = normalizeAssetName(name)
      return n.includes(normalized) || normalized.includes(n)
    })
    if (fuzzy) result.add(fuzzy)
  }

  for (const name of candidateNames) {
    const normalized = normalizeAssetName(name)
    if (normalized && normalizedText.includes(normalized)) result.add(name)
  }

  return Array.from(result)
}

interface FlowState {
  nodes: Node<CustomNodeData>[]
  edges: Edge[]
  edgeStyleType: EdgeStyleType
  onNodesChange: OnNodesChange<Node<CustomNodeData>>
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect
  isValidConnection: (connection: Connection | Edge) => boolean
  setEdgeStyleType: (style: EdgeStyleType) => void
  addNode: (
    type: NodeType,
    position: { x: number; y: number },
    data?: Partial<CustomNodeData>
  ) => void
  addResultNode: (
    sourceNodeId: string,
    type: NodeType,
    data: Partial<CustomNodeData>
  ) => string
  addInputNode: (
    targetNodeId: string,
    type: NodeType,
    data: Partial<CustomNodeData>,
    targetHandle?: string
  ) => string
  updateNodeData: (nodeId: string, data: Partial<CustomNodeData>) => void
  deleteNode: (nodeId: string) => void
  deleteEdge: (edgeId: string) => void
  removeEdgesWhere: (predicate: (edge: Edge) => boolean) => void
  duplicateNode: (nodeId: string) => void
  /** Wrap the given nodes in a named group container (ReactFlow parent). Returns the group id. */
  groupNodes: (nodeIds: string[], name?: string) => string | undefined
  /** Dissolve a group, restoring its children to absolute positions. Nodes are kept. */
  ungroupNodes: (groupId: string) => void
  /** Delete a group container and every node inside it. */
  deleteGroupAndChildren: (groupId: string) => void
  /** Add a single node to an existing group (drag-into-container). Resizes the group to fit. */
  assignNodeToGroup: (nodeId: string, groupId: string) => void
  /** Detach a node from its group, restoring its absolute position (drag-out). */
  removeNodeFromGroup: (nodeId: string) => void
  /** Group id currently hovered while dragging a node — transient, not persisted. */
  dragOverGroupId: string | null
  setDragOverGroupId: (groupId: string | null) => void
  loadCanvas: (snapshot: WorkflowSnapshot) => void
  resetCanvas: () => void
  nodeCount: Record<NodeType, number>
  // undo/redo
  _undoStack: UndoSnapshot[]
  _redoStack: UndoSnapshot[]
  _pushUndo: () => void
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
  createScenesFromScript: (
    scriptNodeId: string,
    scenes: Array<{ description: string; dialogue: string; duration: string; camera: string; negativePrompt?: string; aspectRatio?: string; outputMode?: string }>
  ) => void
  createCharacterNodes: (
    scriptNodeId: string,
    characters: Array<{ name: string; appearance: string; role: string }>
  ) => void
  createScreenplayNode: (
    scriptNodeId: string,
    screenplay: {
      title: string
      synopsis: string
      content: string
      scriptDuration?: string
      styles?: string[]
      // Structured short-drama data — preserved for the episode-list flow
      contentType?: string
      dramaTemplate?: string
      firstHook?: string
      episodeDuration?: number
      characters?: Array<{ name: string; role?: string; appearance?: string; personality?: string }>
      episodes?: Array<{ ep: number; title?: string; hook?: string; beats?: string[]; satisfactionPoint?: string; cliffhanger?: string }>
      storyBible?: unknown
      qualityReport?: unknown
    }
  ) => void
  createEpisodeAssetsAndList: (
    screenplayNodeId: string,
    data: {
      characters: Array<{ name: string; appearance: string; role: string }>
      locations: Array<{ name: string; description: string; atmosphere?: string }>
      props?: Array<{ name: string; description: string }>
      episodes: Array<{ ep: number; title?: string; hook?: string; beats?: string[]; satisfactionPoint?: string; cliffhanger?: string }>
      episodeDuration?: number
    }
  ) => void
  createEpisodeStoryboard: (
    episodeListNodeId: string,
    episodeIndex: number,
    storyboard: Array<{
      shot: number
      duration: string
      durationReason?: string
      locationName: string
      characterNames?: string[]
      propNames?: string[]
      description: string
      blocking?: string
      action?: string
      expression?: string
      cameraAngle?: string
      composition?: string
      camera: string
      shotType?: string
      dialogue?: string
      negativePrompt?: string
      aspectRatio?: string
    }>
  ) => string | undefined
  createStoryboardVideoGroups: (
    storyboardNodeId: string,
    options: { maxDuration: 15 | 30; modelLabel?: string; modelId?: string; ratio?: string; resolution?: string }
  ) => number
  createNodesFromScreenplay: (
    screenplayNodeId: string,
    data: {
      characters: Array<{ name: string; appearance: string; role: string }>
      scenes: Array<{ description: string; dialogue: string; duration: string; camera: string; negativePrompt?: string; aspectRatio?: string; outputMode?: string; characters?: string[] }>
    }
  ) => void
  createStoryboardFromScreenplay: (
    screenplayNodeId: string,
    scenes: Array<{ description: string; dialogue: string; duration: string; camera: string; negativePrompt?: string; aspectRatio?: string; outputMode?: string; characters?: string[] }>,
    scriptDuration?: string
  ) => void
  createAssetsFromExtraction: (
    screenplayNodeId: string,
    data: {
      characters: Array<{ name: string; appearance: string; role: string }>
      locations: Array<{ name: string; description: string; atmosphere?: string }>
      props?: Array<{ name: string; description: string }>
      storyboard: Array<{
        shot: number
        duration: string
        durationReason?: string
        locationName: string
        characterNames?: string[]
        propNames?: string[]
        description: string
        blocking?: string
        action?: string
        expression?: string
        cameraAngle?: string
        composition?: string
        camera: string
        shotType?: string
        dialogue?: string
        negativePrompt?: string
        aspectRatio?: string
      }>
    }
  ) => void
  createGraphicWorkflow: (
    graphicNodeId: string,
    options: {
      designType: string
      prompt: string
      negativePrompt: string
      ratio: '1:1' | '4:3' | '16:9' | '9:16' | '3:4'
      needsProductUpload: boolean
      creativeDirection?: string
      composition?: string
      colorScheme?: string
      copywriting?: string
    }
  ) => string
  // material picker
  materialPickerTarget: string | null
  openMaterialPicker: (nodeId: string) => void
  closeMaterialPicker: () => void
}

const initialNodes: Node<CustomNodeData>[] = []

const initialEdges: Edge[] = []

const edgeStyle = { stroke: 'var(--edge-color)', strokeWidth: 3 }

const getEdgeType = (_style: EdgeStyleType) => 'default' as const

const emptyNodeCount: Record<NodeType, number> = {
  text: 0,
  image: 0,
  imageLayer: 0,
  video: 0,
  audio: 0,
  script: 0,
  scene: 0,
  storyboard: 0,
  promptAssistant: 0,
  screenplay: 0,
  graphic: 0,
  graphicBrief: 0,
  episodeList: 0,
  videoSynthesis: 0,
  group: 0,
}

const countNodesByType = (nodes: Node<CustomNodeData>[]) =>
  nodes.reduce<Record<NodeType, number>>(
    (counts, node) => {
      counts[node.data.type] += 1
      return counts
    },
    { ...emptyNodeCount }
  )

const buildEdge = (
  source: string,
  target: string,
  style: EdgeStyleType,
  overrides: Partial<Edge> = {}
): Edge => {
  const sourceHandle = overrides.sourceHandle ?? 'output'
  const targetHandle = overrides.targetHandle ?? DEFAULT_TARGET_HANDLE
  return {
    id: `e-${source}->${target}::${overrides.sourceHandle ?? 'output'}->${overrides.targetHandle ?? DEFAULT_TARGET_HANDLE}`,
    source,
    target,
    sourceHandle,
    targetHandle,
    type: getEdgeType(style),
    data: { edgeType: style },
    selectable: true,
    interactionWidth: 24,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
      color: 'var(--edge-color)',
    },
    style: edgeStyle,
    ...overrides,
  }
}

/** Build style-aware image generation keywords from user-selected style tags */
function buildStylePrompts(styles: string[]): {
  charStyle: string
  sceneStyle: string
  propStyle: string
  charNegative: string
} {
  const has = (...tags: string[]) => tags.some(t => styles.includes(t))

  // Determine primary render mode
  const isRealistic = has('写实', '胶片', '超现实')
  const isAnime     = has('二次元', '动画')
  const isCG        = has('3D渲染', 'CG')
  const isInkWash   = has('水墨')
  const isWaterclr  = has('水彩')
  const isOilPaint  = has('油画')
  const isSketch    = has('素描')
  const isPixel     = has('像素风')
  const isFlat      = has('扁平插画')

  let charBase: string, sceneBase: string, propBase: string, charNeg: string

  if (isRealistic) {
    charBase  = '写实风格，超高清质感，专业摄影，真实人像，角色参考图'
    sceneBase = '写实摄影风格，电影感构图，超精细，高清场景'
    propBase  = '产品摄影，写实风格，专业棚拍灯光，白色背景'
    charNeg   = '卡通，动漫，插画，三维渲染，CG，绘画，素描，水彩'
  } else if (isAnime) {
    charBase  = '动漫风格，漫画角色设计，二次元，干净线条感'
    sceneBase = '动漫背景艺术，动态环境，吉卜力风格'
    propBase  = '动漫道具设计，插画风格，干净线条感'
    charNeg   = '写实照片，三维渲染，模糊'
  } else if (isCG) {
    charBase  = '三维CG角色，电影级三维渲染，次表面散射，虚幻引擎风格'
    sceneBase = '三维CG环境，电影级渲染，全局光照，体积光'
    propBase  = '三维产品渲染，CG道具，基于物理的渲染'
    charNeg   = '写实照片，二维插画，动漫，扁平设计，模糊'
  } else if (isInkWash) {
    charBase  = '中国水墨画风格，毛笔笔触，水墨人物插画'
    sceneBase = '中国水墨山水，毛笔笔触，传统水墨画'
    propBase  = '中国水墨插画，毛笔技法'
    charNeg   = '写实照片，三维渲染，模糊，水印'
  } else if (isWaterclr) {
    charBase  = '水彩插画，柔和晕染，纸张纹理，手绘风格'
    sceneBase = '水彩环境，柔和晕染，印象派水彩'
    propBase  = '水彩物体插画，柔和晕染'
    charNeg   = '写实照片，三维渲染，模糊，水印'
  } else if (isOilPaint) {
    charBase  = '油画人像，古典技法，画布纹理，大师画风'
    sceneBase = '油画风景，古典技法，画布纹理'
    propBase  = '油画静物，古典技法'
    charNeg   = '写实照片，动漫，三维渲染，模糊'
  } else if (isSketch) {
    charBase  = '铅笔素描，石墨绘画，手绘角色'
    sceneBase = '铅笔素描环境，石墨绘画，建筑速写'
    propBase  = '铅笔素描物体，石墨插画'
    charNeg   = '写实照片，彩色，三维渲染，模糊，水印'
  } else if (isPixel) {
    charBase  = '像素风角色，复古像素风格，清晰像素'
    sceneBase = '像素风背景，复古游戏环境，像素风格'
    propBase  = '像素风道具，复古游戏资产，清晰像素'
    charNeg   = '写实照片，平滑，模糊，抗锯齿，三维渲染'
  } else if (isFlat) {
    charBase  = '扁平设计插画，矢量艺术，几何形状，极简阴影'
    sceneBase = '扁平设计背景，矢量插画，极简风格'
    propBase  = '扁平设计图标，矢量插画，极简风格'
    charNeg   = '写实照片，三维渲染，复杂纹理，模糊'
  } else {
    charBase  = '角色概念艺术，数字插画'
    sceneBase = '环境概念艺术，数字绘画'
    propBase  = '道具概念艺术，数字插画'
    charNeg   = '低质量，模糊，水印，文字'
  }

  // Append additional atmosphere modifiers
  const extras: string[] = []
  if (has('赛博朋克'))   extras.push('赛博朋克，霓虹灯，未来主义')
  if (has('蒸汽朋克'))   extras.push('蒸汽朋克，黄铜齿轮，维多利亚工业风')
  if (has('古风'))        extras.push('中国古典美学，传统风格')
  if (has('国潮'))        extras.push('现代中国美学，国潮时尚')
  if (has('暗黑', '哥特')) extras.push('暗黑氛围，哥特风，戏剧性光影')
  if (has('废土'))        extras.push('后启示录废土，锈迹斑斑，荒芜')
  if (has('梦幻'))        extras.push('梦幻感，魔法氛围，柔光')
  if (has('童话'))        extras.push('童话故事，绘本风格，奇幻')
  if (has('黑白'))        extras.push('黑白，单色，灰度')
  if (has('胶片'))        extras.push('胶片颗粒感，复古色调')
  if (has('日系'))        extras.push('日系美学，日本风格')
  if (has('韩系'))        extras.push('韩系美学，韩剧风格')
  if (has('欧美'))        extras.push('欧美电影风格，好莱坞美学')

  const extra = extras.length > 0 ? `, ${extras.join(', ')}` : ''

  return {
    charStyle:   `${charBase}${extra}`,
    sceneStyle:  `${sceneBase}${extra}`,
    propStyle:   `${propBase}${extra}`,
    charNegative: charNeg,
  }
}

const createsCycle = (edges: Edge[], source: string, target: string) => {
  const adjacency = new Map<string, string[]>()
  edges.forEach((edge) => {
    adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target])
  })

  const visited = new Set<string>()
  const stack = [target]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || visited.has(current)) continue
    if (current === source) return true
    visited.add(current)
    stack.push(...(adjacency.get(current) ?? []))
  }

  return false
}

const validateConnection = (
  connection: Connection | Edge,
  nodes: Node<CustomNodeData>[],
  edges: Edge[]
) => {
  const { source, target } = connection
  if (!source || !target || source === target) return false
  // 只允许从 output / row-* handle 出线
  if (connection.sourceHandle && connection.sourceHandle !== 'output' && !connection.sourceHandle.startsWith('row-')) return false
  // 目标端口必须在白名单中，或是分镜表的动态行 handle
  const isDynamicRowHandle = connection.targetHandle
    ? connection.targetHandle.startsWith('scene-in-') ||
      connection.targetHandle.startsWith('char-in-') ||
      connection.targetHandle.startsWith('prop-in-')
    : false
  if (connection.targetHandle && !TARGET_HANDLES.has(connection.targetHandle) && !isDynamicRowHandle) return false

  const sourceNode = nodes.find((node) => node.id === source)
  const targetNode = nodes.find((node) => node.id === target)
  if (!sourceNode || !targetNode) return false

  // input / result 模式的节点不接受入边
  if (targetNode.data.mode === 'input' || targetNode.data.mode === 'result') return false

  // 源节点类型必须与目标端口兼容
  if (connection.targetHandle) {
    const allowedTypes = HANDLE_SOURCE_TYPES[connection.targetHandle]
    if (allowedTypes && !allowedTypes.includes(sourceNode.data.type)) return false

    // 检查目标端口是否已达最大连接数（仅对 max > 1 的端口做硬拦截；max = 1 的独占端口由 onConnect 自动替换）
    const maxConns = HANDLE_MAX_CONNECTIONS[connection.targetHandle]
    if (maxConns !== undefined && maxConns > 1) {
      const existingCount = edges.filter(
        (e) => e.target === target && e.targetHandle === connection.targetHandle
      ).length
      if (existingCount >= maxConns) return false
    }
  }

  // 禁止重复边 — 分镜表动态 handle 允许同一节点接到不同行，只拦截完全相同的 (source, target, targetHandle)
  const isDynamicSbHandle = /^(scene|char|prop)-in-/.test(connection.targetHandle ?? '')
  if (isDynamicSbHandle) {
    if (edges.some((e) => e.source === source && e.target === target && e.targetHandle === connection.targetHandle)) return false
  } else {
    if (edges.some((edge) => edge.source === source && edge.target === target)) return false
  }

  return !createsCycle(edges, source, target)
}

const NODE_TYPE_MAP: Record<NodeType, string> = {
  text: 'textNode',
  image: 'imageNode',
  imageLayer: 'imageLayerNode',
  video: 'videoNode',
  audio: 'audioNode',
  script: 'scriptNode',
  scene: 'sceneNode',
  storyboard: 'storyboardNode',
  promptAssistant: 'promptAssistantNode',
  screenplay: 'screenplayNode',
  graphic: 'graphicNode',
  graphicBrief: 'graphicBriefNode',
  episodeList: 'episodeListNode',
  videoSynthesis: 'videoSynthesisNode',
  group: 'groupNode',
}

const LABEL_MAP: Record<NodeType, string> = {
  text: 'AI 文本',
  image: 'AI 生图',
  imageLayer: '图片分层',
  video: 'AI 视频',
  audio: '音频节点',
  script: 'AI 编剧',
  scene: '分镜',
  storyboard: '分镜表',
  promptAssistant: '提示词助手',
  screenplay: 'AI 剧本',
  graphic: 'AI 平面',
  graphicBrief: '创意方案',
  episodeList: '剧集列表',
  videoSynthesis: 'AI 成片',
  group: '分组',
}

export const useFlowStore = create<FlowState>()(
  persist(
    (set, get) => ({
      nodes: initialNodes,
      edges: initialEdges,
      edgeStyleType: 'straight',
      nodeCount: countNodesByType(initialNodes),
      dragOverGroupId: null,

      // ── undo / redo ──
      _undoStack: [],
      _redoStack: [],
      _pushUndo: () => {
        const { nodes, edges, nodeCount, _undoStack } = get()
        const snapshot: UndoSnapshot = { nodes, edges, nodeCount }
        set({ _undoStack: [..._undoStack.slice(-MAX_UNDO + 1), snapshot], _redoStack: [] })
      },
      undo: () => {
        const { _undoStack, nodes, edges, nodeCount } = get()
        if (_undoStack.length === 0) return
        const prev = _undoStack[_undoStack.length - 1]
        const current: UndoSnapshot = { nodes, edges, nodeCount }
        set({
          nodes: prev.nodes,
          edges: prev.edges,
          nodeCount: prev.nodeCount,
          _undoStack: _undoStack.slice(0, -1),
          _redoStack: [...get()._redoStack, current],
        })
      },
      redo: () => {
        const { _redoStack, nodes, edges, nodeCount } = get()
        if (_redoStack.length === 0) return
        const next = _redoStack[_redoStack.length - 1]
        const current: UndoSnapshot = { nodes, edges, nodeCount }
        set({
          nodes: next.nodes,
          edges: next.edges,
          nodeCount: next.nodeCount,
          _redoStack: _redoStack.slice(0, -1),
          _undoStack: [...get()._undoStack, current],
        })
      },
      canUndo: () => get()._undoStack.length > 0,
      canRedo: () => get()._redoStack.length > 0,

      // ── material picker ──
      materialPickerTarget: null,
      openMaterialPicker: (nodeId) => set({ materialPickerTarget: nodeId }),
      closeMaterialPicker: () => set({ materialPickerTarget: null }),

      createGraphicWorkflow: (graphicNodeId, {
        designType, prompt, negativePrompt, ratio, needsProductUpload,
        creativeDirection, composition, colorScheme, copywriting,
      }) => {
        get()._pushUndo()
        const graphicNode = get().nodes.find((n) => n.id === graphicNodeId)
        if (!graphicNode) return ''

        const { x, y } = graphicNode.position
        const edgeStyle = get().edgeStyleType
        const nodeCount = get().nodeCount
        const now = Date.now()

        // ── 创意方案展示节点 ──
        const briefCount = (nodeCount.graphicBrief ?? 0) + 1
        const briefNodeId = `graphicBrief-${now}`
        const briefNode: Node<CustomNodeData> = {
          id: briefNodeId,
          type: NODE_TYPE_MAP.graphicBrief,
          position: { x: x + 500, y },
          data: {
            label: `创意方案 ${briefCount}`,
            type: 'graphicBrief',
            status: 'completed',
            content: prompt,
            meta: JSON.stringify({ designType, ratio, creativeDirection, composition, colorScheme, copywriting, negativePrompt }),
          },
        }

        // ── AI 生图 tool node ──
        const imgCount = (nodeCount.image ?? 0) + 1
        const imgNodeId = `image-${now + 1}`
        const imgNode: Node<CustomNodeData> = {
          id: imgNodeId,
          type: NODE_TYPE_MAP.image,
          position: { x: x + 500 + 520, y },
          data: {
            label: `AI 生图 ${imgCount}`,
            type: 'image',
            status: 'ready',
            content: prompt,
            meta: JSON.stringify({ ratio }),
          },
        }

        const newNodes: Node<CustomNodeData>[] = [briefNode, imgNode]
        const newEdges: Edge[] = [
          // AI平面 → 创意方案
          buildEdge(graphicNodeId, briefNodeId, edgeStyle),
          // 创意方案 → AI生图（提示词通道）
          buildEdge(briefNodeId, imgNodeId, edgeStyle, { targetHandle: 'tab-prompt' }),
        ]
        let imgFinalCount = imgCount
        let briefFinalCount = briefCount

        // ── 产品上传节点（需要产品图的设计类型）──
        if (needsProductUpload) {
          const uploadCount = imgCount + 1
          imgFinalCount = uploadCount
          const uploadNodeId = `image-${now + 2}`
          const uploadNode: Node<CustomNodeData> = {
            id: uploadNodeId,
            type: NODE_TYPE_MAP.image,
            position: { x: x + 500 + 520 - 360, y: y - 160 },
            data: {
              label: '产品图',
              type: 'image',
              status: 'idle',
              mode: 'input',
            },
          }
          newNodes.push(uploadNode)
          // 产品图 → AI生图（参考图通道）
          newEdges.push(buildEdge(uploadNodeId, imgNodeId, edgeStyle, { targetHandle: 'tab-imgref' }))
        }

        set({
          nodes: [...get().nodes, ...newNodes],
          edges: [...get().edges, ...newEdges],
          nodeCount: { ...nodeCount, image: imgFinalCount, graphicBrief: briefFinalCount },
        })
        return imgNodeId
      },

      // ── react flow callbacks ──
      onNodesChange: (changes) => {
        set({ nodes: applyNodeChanges(changes, get().nodes) })
      },
      onEdgesChange: (changes) => {
        set({ edges: applyEdgeChanges(changes, get().edges) })
      },
      onConnect: (connection: Connection) => {
        if (!validateConnection(connection, get().nodes, get().edges)) return
        get()._pushUndo()

        let edges = get().edges
        const targetHandle = connection.targetHandle ?? DEFAULT_TARGET_HANDLE

        // 独占端口（max = 1）：自动移除旧连接，再添加新连接
        const maxConns = HANDLE_MAX_CONNECTIONS[targetHandle]
        if (maxConns === 1) {
          edges = edges.filter(
            (e) => !(e.target === connection.target && e.targetHandle === targetHandle)
          )
        }

        set({
          edges: addEdge(
            buildEdge(connection.source!, connection.target!, get().edgeStyleType, connection),
            edges
          ),
        })
      },
      isValidConnection: (connection: Connection | Edge) => {
        return validateConnection(connection, get().nodes, get().edges)
      },
      setEdgeStyleType: (style: EdgeStyleType) => {
        set({
          edgeStyleType: style,
          edges: get().edges.map((edge) => ({
            ...edge,
            type: getEdgeType(style),
            data: { ...(edge.data as Record<string, unknown>), edgeType: style },
            style: edgeStyle,
          })),
        })
      },

      // ── node CRUD ──
      addNode: (type, position, data = {}) => {
        get()._pushUndo()
        const nodeCount = get().nodeCount
        const newCount = (nodeCount[type] ?? 0) + 1
        const newNode: Node<CustomNodeData> = {
          id: `${type}-${Date.now()}`,
          type: NODE_TYPE_MAP[type],
          position,
          data: {
            label: `${LABEL_MAP[type]} ${newCount}`,
            type,
            status: 'idle',
            ...data,
          },
        }
        set({
          nodes: [...get().nodes, newNode],
          nodeCount: { ...nodeCount, [type]: newCount },
        })
      },

      addResultNode: (sourceNodeId, type, data = {}) => {
        get()._pushUndo()
        const sourceNode = get().nodes.find((n) => n.id === sourceNodeId)
        const nodeCount = get().nodeCount
        const newCount = nodeCount[type] + 1
        const newId = `${type}-result-${Date.now()}`
        const position = sourceNode
          ? { x: sourceNode.position.x + 420, y: sourceNode.position.y }
          : { x: 600, y: 300 }
        const newNode: Node<CustomNodeData> = {
          id: newId,
          type: NODE_TYPE_MAP[type],
          position,
          data: { label: `${LABEL_MAP[type]} ${newCount}`, type, status: 'completed', ...data },
        }
        const newEdge = buildEdge(sourceNodeId, newId, get().edgeStyleType)
        set({
          nodes: [...get().nodes, newNode],
          edges: [...get().edges, newEdge],
          nodeCount: { ...nodeCount, [type]: newCount },
        })
        return newId
      },

      addInputNode: (targetNodeId, type, data = {}, targetHandle) => {
        get()._pushUndo()
        const targetNode = get().nodes.find((n) => n.id === targetNodeId)
        const nodeCount = get().nodeCount
        const newCount = nodeCount[type] + 1
        const newId = `${type}-input-${Date.now()}-${newCount}`
        const position = targetNode
          ? { x: targetNode.position.x - 420, y: targetNode.position.y + newCount * 20 }
          : { x: 200, y: 300 }
        const newNode: Node<CustomNodeData> = {
          id: newId,
          type: NODE_TYPE_MAP[type],
          position,
          data: { label: data.label ?? `素材 ${newCount}`, type, mode: 'input', status: 'ready', ...data },
        }
        const newEdge = buildEdge(newId, targetNodeId, get().edgeStyleType, {
          ...(targetHandle ? { targetHandle } : {}),
        })
        set({
          nodes: [...get().nodes, newNode],
          edges: [...get().edges, newEdge],
          nodeCount: { ...nodeCount, [type]: newCount },
        })
        return newId
      },

      updateNodeData: (nodeId, data) => {
        const oldNode = get().nodes.find((n) => n.id === nodeId)
        if (oldNode) {
          if (data.imageUrl && oldNode.data.imageUrl?.startsWith('blob:') && oldNode.data.imageUrl !== data.imageUrl)
            URL.revokeObjectURL(oldNode.data.imageUrl)
          if (data.videoUrl && oldNode.data.videoUrl?.startsWith('blob:') && oldNode.data.videoUrl !== data.videoUrl)
            URL.revokeObjectURL(oldNode.data.videoUrl)
          if (data.audioUrl && oldNode.data.audioUrl?.startsWith('blob:') && oldNode.data.audioUrl !== data.audioUrl)
            URL.revokeObjectURL(oldNode.data.audioUrl)
        }
        set({
          nodes: get().nodes.map((node) =>
            node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node
          ),
        })
      },

      deleteNode: (nodeId) => {
        get()._pushUndo()
        const node = get().nodes.find((n) => n.id === nodeId)
        if (node) {
          if (node.data.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(node.data.imageUrl)
          if (node.data.videoUrl?.startsWith('blob:')) URL.revokeObjectURL(node.data.videoUrl)
          if (node.data.audioUrl?.startsWith('blob:')) URL.revokeObjectURL(node.data.audioUrl)
        }
        set({
          nodes: get().nodes.filter((n) => n.id !== nodeId),
          edges: get().edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
        })
      },

      deleteEdge: (edgeId) => {
        get()._pushUndo()
        set({ edges: get().edges.filter((e) => e.id !== edgeId) })
      },

      removeEdgesWhere: (predicate) => {
        set({ edges: get().edges.filter((e) => !predicate(e)) })
      },

      duplicateNode: (nodeId) => {
        get()._pushUndo()
        const node = get().nodes.find((item) => item.id === nodeId)
        if (!node) return
        set({
          nodes: [...get().nodes, {
            ...node,
            id: `${node.data.type}-${Date.now()}`,
            selected: false,
            position: { x: node.position.x + 48, y: node.position.y + 48 },
            data: { ...node.data, label: `${node.data.label} 副本` },
          }],
        })
      },

      groupNodes: (nodeIds, name) => {
        const all = get().nodes
        // Only top-level, non-group nodes can be grouped
        const members = all.filter(
          (n) => nodeIds.includes(n.id) && n.type !== NODE_TYPE_MAP.group && !n.parentId,
        )
        if (members.length < 2) return undefined
        get()._pushUndo()

        const PAD = 44
        const HEADER = 48
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        members.forEach((n) => {
          const w = n.measured?.width ?? n.width ?? (n.data.nodeWidth as number | undefined) ?? 320
          const h = n.measured?.height ?? n.height ?? (n.data.nodeHeight as number | undefined) ?? 220
          minX = Math.min(minX, n.position.x)
          minY = Math.min(minY, n.position.y)
          maxX = Math.max(maxX, n.position.x + w)
          maxY = Math.max(maxY, n.position.y + h)
        })

        const groupPos = { x: minX - PAD, y: minY - PAD - HEADER }
        const groupW = (maxX - minX) + PAD * 2
        const groupH = (maxY - minY) + PAD * 2 + HEADER

        const nodeCount = { ...get().nodeCount }
        const gCount = (nodeCount.group ?? 0) + 1
        const groupId = `group-${Date.now()}`
        const groupNode: Node<CustomNodeData> = {
          id: groupId,
          type: NODE_TYPE_MAP.group,
          position: groupPos,
          width: groupW,
          height: groupH,
          data: { label: name?.trim() || `分组 ${gCount}`, type: 'group', status: 'ready' },
        }
        nodeCount.group = gCount

        const memberIds = new Set(members.map((m) => m.id))
        const reparented = members.map((n) => ({
          ...n,
          parentId: groupId,
          selected: false,
          position: { x: n.position.x - groupPos.x, y: n.position.y - groupPos.y },
        }))
        const others = all.filter((n) => !memberIds.has(n.id))

        // Parent must precede its children; place the container first so it paints behind.
        set({ nodes: [groupNode, ...others, ...reparented], nodeCount })
        return groupId
      },

      ungroupNodes: (groupId) => {
        const all = get().nodes
        const group = all.find((n) => n.id === groupId)
        if (!group) return
        get()._pushUndo()
        const restored = all
          .filter((n) => n.parentId === groupId)
          .map((c) => ({
            ...c,
            parentId: undefined,
            extent: undefined,
            position: { x: c.position.x + group.position.x, y: c.position.y + group.position.y },
          }))
        const restoredIds = new Set(restored.map((r) => r.id))
        const others = all.filter((n) => n.id !== groupId && !restoredIds.has(n.id))
        set({ nodes: [...others, ...restored] })
      },

      deleteGroupAndChildren: (groupId) => {
        get()._pushUndo()
        const all = get().nodes
        const removeIds = new Set<string>([groupId])
        all.forEach((n) => { if (n.parentId === groupId) removeIds.add(n.id) })
        all.forEach((n) => {
          if (!removeIds.has(n.id)) return
          if (n.data.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(n.data.imageUrl)
          if (n.data.videoUrl?.startsWith('blob:')) URL.revokeObjectURL(n.data.videoUrl)
          if (n.data.audioUrl?.startsWith('blob:')) URL.revokeObjectURL(n.data.audioUrl)
        })
        set({
          nodes: all.filter((n) => !removeIds.has(n.id)),
          edges: get().edges.filter((e) => !removeIds.has(e.source) && !removeIds.has(e.target)),
        })
      },

      assignNodeToGroup: (nodeId, groupId) => {
        const all = get().nodes
        const node = all.find((n) => n.id === nodeId)
        const group = all.find((n) => n.id === groupId)
        if (!node || !group || nodeId === groupId) return
        if (node.type === NODE_TYPE_MAP.group) return   // never nest groups
        if (node.parentId === groupId) return           // already a member
        get()._pushUndo()

        const PAD = 44
        const HEADER = 48
        const sizeOf = (n: Node<CustomNodeData>) => ({
          w: n.measured?.width ?? n.width ?? (n.data.nodeWidth as number | undefined) ?? 320,
          h: n.measured?.height ?? n.height ?? (n.data.nodeHeight as number | undefined) ?? 220,
        })

        // Absolute position of the incoming node (top-level or coming from another group)
        const oldParent = node.parentId ? all.find((n) => n.id === node.parentId) : undefined
        const nodeAbs = oldParent
          ? { x: oldParent.position.x + node.position.x, y: oldParent.position.y + node.position.y }
          : { x: node.position.x, y: node.position.y }

        // Absolute boxes of every member (existing children + newcomer) → new wrapping box
        const memberAbs = new Map<string, { x: number; y: number; w: number; h: number }>()
        all.forEach((n) => {
          if (n.parentId === groupId) {
            const s = sizeOf(n)
            memberAbs.set(n.id, { x: group.position.x + n.position.x, y: group.position.y + n.position.y, w: s.w, h: s.h })
          }
        })
        const ns = sizeOf(node)
        memberAbs.set(nodeId, { x: nodeAbs.x, y: nodeAbs.y, w: ns.w, h: ns.h })

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        memberAbs.forEach((m) => {
          minX = Math.min(minX, m.x); minY = Math.min(minY, m.y)
          maxX = Math.max(maxX, m.x + m.w); maxY = Math.max(maxY, m.y + m.h)
        })
        const newPos = { x: minX - PAD, y: minY - PAD - HEADER }
        const newW = (maxX - minX) + PAD * 2
        const newH = (maxY - minY) + PAD * 2 + HEADER

        // Resize the group, re-offset existing children, then insert the newcomer after the group
        const rebuilt = all
          .filter((n) => n.id !== nodeId)
          .map((n) => {
            if (n.id === groupId) return { ...n, position: newPos, width: newW, height: newH }
            if (n.parentId === groupId) {
              const abs = memberAbs.get(n.id)!
              return { ...n, position: { x: abs.x - newPos.x, y: abs.y - newPos.y } }
            }
            return n
          })
        const newChild = {
          ...node,
          parentId: groupId,
          extent: undefined,
          selected: false,
          position: { x: nodeAbs.x - newPos.x, y: nodeAbs.y - newPos.y },
        }
        const gi = rebuilt.findIndex((n) => n.id === groupId)
        rebuilt.splice(gi + 1, 0, newChild)
        set({ nodes: rebuilt, dragOverGroupId: null })
      },

      removeNodeFromGroup: (nodeId) => {
        const all = get().nodes
        const node = all.find((n) => n.id === nodeId)
        if (!node || !node.parentId) return
        const parent = all.find((n) => n.id === node.parentId)
        const abs = parent
          ? { x: parent.position.x + node.position.x, y: parent.position.y + node.position.y }
          : { x: node.position.x, y: node.position.y }
        get()._pushUndo()
        set({
          nodes: all.map((n) => (n.id === nodeId ? { ...n, parentId: undefined, extent: undefined, position: abs } : n)),
          dragOverGroupId: null,
        })
      },

      setDragOverGroupId: (groupId) => set({ dragOverGroupId: groupId }),

      createScenesFromScript: (scriptNodeId, scenes) => {
        get()._pushUndo()
        const scriptNode = get().nodes.find((n) => n.id === scriptNodeId)
        if (!scriptNode) return
        const baseX = scriptNode.position.x + 480
        const baseY = scriptNode.position.y - ((scenes.length - 1) * 95)
        const nodeCount = { ...get().nodeCount }
        const newNodes: Node<CustomNodeData>[] = []
        const newEdges: Edge[] = []
        const ts = Date.now()
        scenes.forEach((scene, i) => {
          const count = (nodeCount.scene ?? 0) + i + 1
          const nodeId = `scene-${ts}-${i}`
          newNodes.push({
            id: nodeId,
            type: NODE_TYPE_MAP.scene,
            position: { x: baseX, y: baseY + i * 190 },
            data: {
              label: `分镜 ${count}`,
              type: 'scene',
              status: 'ready',
              content: JSON.stringify({ ...scene, sceneIndex: i + 1 }),
              meta: scene.duration,
            },
          })
          newEdges.push(buildEdge(scriptNodeId, nodeId, get().edgeStyleType))
        })
        nodeCount.scene = (nodeCount.scene ?? 0) + scenes.length
        set({
          nodes: [...get().nodes, ...newNodes],
          edges: [...get().edges, ...newEdges],
          nodeCount,
        })
      },

      createCharacterNodes: (scriptNodeId, characters) => {
        get()._pushUndo()
        const scriptNode = get().nodes.find((n) => n.id === scriptNodeId)
        if (!scriptNode) return
        const nodeCount = { ...get().nodeCount }
        const newNodes: Node<CustomNodeData>[] = []
        const newEdges: Edge[] = []
        const ts = Date.now()
        const spacing = 320
        const baseX = scriptNode.position.x - ((characters.length - 1) * spacing) / 2
        const baseY = scriptNode.position.y - 340

        characters.forEach((char, i) => {
          const nodeId = `image-char-${ts}-${i}`
          const threeViewPrompt = `角色设计参考图：${char.name}\n${char.appearance}\n三视图，白色背景，全身，正面+侧面+背面，设计统一，角色概念艺术，高质量\n中性表情，闭嘴，放松站姿，标准角色设计参考图，双手无道具，平光照明\n避免：微笑，大笑，哭泣，愤怒表情，张嘴，情绪化面部，动作姿势，战斗，跑步，跳跃，手势，手持武器，复杂背景，水印，文字`
          newNodes.push({
            id: nodeId,
            type: NODE_TYPE_MAP.image,
            position: { x: baseX + i * spacing, y: baseY },
            data: {
              label: `角色：${char.name}`,
              type: 'image',
              status: 'idle',
              content: threeViewPrompt,
              meta: char.role,
            },
          })
          newEdges.push(buildEdge(scriptNodeId, nodeId, get().edgeStyleType))
        })
        nodeCount.image = (nodeCount.image ?? 0) + characters.length
        set({
          nodes: [...get().nodes, ...newNodes],
          edges: [...get().edges, ...newEdges],
          nodeCount,
        })
      },

      createScreenplayNode: (scriptNodeId, screenplay: any) => {
        get()._pushUndo()
        const scriptNode = get().nodes.find((n) => n.id === scriptNodeId)
        if (!scriptNode) return
        const nodeCount = { ...get().nodeCount }
        const ts = Date.now()
        const nodeId = `screenplay-${ts}`
        const count = (nodeCount.screenplay ?? 0) + 1

        const newNode: Node<CustomNodeData> = {
          id: nodeId,
          type: NODE_TYPE_MAP.screenplay,
          position: { x: scriptNode.position.x + 420, y: scriptNode.position.y },
          data: {
            label: `剧本：${screenplay.title}`,
            type: 'screenplay',
            status: 'ready',
            content: JSON.stringify({
              title: screenplay.title,
              synopsis: screenplay.synopsis,
              content: screenplay.content,
              scriptDuration: screenplay.scriptDuration,
              styles: screenplay.styles ?? [],
              // Preserve structured short-drama data so the screenplay node can
              // drive the whole-drama asset extraction + per-episode storyboard flow.
              contentType: screenplay.contentType,
              dramaTemplate: screenplay.dramaTemplate,
              firstHook: screenplay.firstHook,
              episodeDuration: screenplay.episodeDuration,
              characters: screenplay.characters ?? [],
              episodes: screenplay.episodes ?? [],
              storyBible: screenplay.storyBible,
              qualityReport: screenplay.qualityReport,
            }),
          },
        }
        const newEdge = buildEdge(scriptNodeId, nodeId, get().edgeStyleType)
        nodeCount.screenplay = count
        set({
          nodes: [...get().nodes, newNode],
          edges: [...get().edges, newEdge],
          nodeCount,
        })
      },

      createNodesFromScreenplay: (screenplayNodeId, data) => {
        get()._pushUndo()
        const spNode = get().nodes.find((n) => n.id === screenplayNodeId)
        if (!spNode) return
        const nodeCount = { ...get().nodeCount }
        const newNodes: Node<CustomNodeData>[] = []
        const newEdges: Edge[] = []
        const ts = Date.now()
        const sx = spNode.position.x
        const sy = spNode.position.y

        const spContent2 = (() => { try { return JSON.parse(spNode.data.content as string ?? '{}') } catch { return {} } })()
        const styles2: string[] = spContent2.styles ?? []
        const { charStyle: cs2, sceneStyle: ss2, propStyle: ps2, charNegative: cn2 } = buildStylePrompts(styles2)

        // Character image nodes — above the screenplay node
        const charSpacing = 320
        const charBaseX = sx - ((data.characters.length - 1) * charSpacing) / 2
        const charBaseY = sy - 380
        data.characters.forEach((char, i) => {
          const nodeId = `image-char-${ts}-${i}`
          const threeViewPrompt = `角色设计参考图：${char.name}\n${char.appearance}\n三视图，白色背景，全身，正面+侧面+背面，设计统一，${cs2}，高质量\n中性表情，闭嘴，放松站姿，标准角色设计参考图，双手无道具，平光照明\n避免：${cn2}，微笑，大笑，哭泣，愤怒表情，张嘴，情绪化面部，动作姿势，战斗，跑步，跳跃，手势，手持武器，复杂背景，水印，文字`
          newNodes.push({
            id: nodeId,
            type: NODE_TYPE_MAP.image,
            position: { x: charBaseX + i * charSpacing, y: charBaseY },
            data: {
              label: `角色：${char.name}`,
              type: 'image',
              status: 'idle',
              content: threeViewPrompt,
              meta: char.role,
            },
          })
          newEdges.push(buildEdge(screenplayNodeId, nodeId, get().edgeStyleType))
        })
        nodeCount.image = (nodeCount.image ?? 0) + data.characters.length

        // Scene prompt nodes — below the screenplay node (environment/background references)
        const sceneSpacing = 320
        const sceneBaseX = sx - ((data.scenes.length - 1) * sceneSpacing) / 2
        const sceneBaseY = sy + 380
        const sceneNodeIds: string[] = []
        data.scenes.forEach((scene, i) => {
          const nodeId = `image-scene-${ts}-${i}`
          sceneNodeIds.push(nodeId)
          // Extract scene description (remove time markers and character references)
          const cleanDescription = scene.description
            .split(/\[\d+s-\d+s\]/)
            .filter(s => s.trim() && !s.includes('@'))
            .map(s => s.trim().replace(/^[，。！？]/, ''))
            .filter(s => s.length > 0)
            .slice(0, 2)
            .join(' ')
          const scenePrompt = `场景背景参考：${cleanDescription || '未描述'}\n环境氛围：${scene.camera}\n画幅：${scene.aspectRatio || '16:9'}\n${ss2}，无人物，高质量，超高清\n避免：${scene.negativePrompt || '模糊，水印，文字'}`
          newNodes.push({
            id: nodeId,
            type: NODE_TYPE_MAP.image,
            position: { x: sceneBaseX + i * sceneSpacing, y: sceneBaseY },
            data: {
              label: `场景：${i + 1}`,
              type: 'image',
              status: 'idle',
              content: scenePrompt,
              meta: scene.duration,
            },
          })
          newEdges.push(buildEdge(screenplayNodeId, nodeId, get().edgeStyleType))
        })
        nodeCount.image = (nodeCount.image ?? 0) + data.scenes.length

        // Props prompt nodes — below scene nodes (extract props from scene descriptions)
        const propSpacing = 320
        const propBaseX = sx - ((data.scenes.length - 1) * propSpacing) / 2
        const propBaseY = sy + 680
        const propNodeIds: string[] = []
        data.scenes.forEach((scene, i) => {
          const nodeId = `image-prop-${ts}-${i}`
          propNodeIds.push(nodeId)
          // Extract props/objects from description (common keywords)
          const propKeywords = ['刀', '剑', '弓', '枪', '锤', '斧', '盾', '盔甲', '衣服', '帽子', '靴子', '手套', '项链', '戒指', '手镯', '剑鞘', '弓箭', '箭袋', '箭', '刀柄', '剑柄', '斗篷', '披风', '长袍', '法杖', '魔法石', '珠子', '珠宝', '宝石', '金币', '银币', '铜币', '钥匙', '锁', '门', '窗', '椅子', '桌子', '床', '柜子', '盒子', '瓶子', '杯子', '碗', '盘子', '勺子', '叉子', '刀叉', '灯', '烛台', '火把', '绳子', '绳索', '链条', '锁链', '镣铐']
          const foundProps = propKeywords.filter(kw => scene.description.includes(kw))
          const propList = foundProps.length > 0 ? foundProps.join('、') : '场景中的道具'
          const propPrompt = `道具设计参考：${propList}\n出现场景：${i + 1}\n${ps2}，白色背景，高清，细节清晰\n避免：${scene.negativePrompt || '模糊，水印，文字'}`
          newNodes.push({
            id: nodeId,
            type: NODE_TYPE_MAP.image,
            position: { x: propBaseX + i * propSpacing, y: propBaseY },
            data: {
              label: `道具：${i + 1}`,
              type: 'image',
              status: 'idle',
              content: propPrompt,
              meta: scene.duration,
            },
          })
          newEdges.push(buildEdge(screenplayNodeId, nodeId, get().edgeStyleType))
        })
        nodeCount.image = (nodeCount.image ?? 0) + data.scenes.length

        // Storyboard table node — to the right of screenplay
        // Store references to associated asset nodes (scenes, characters, props)
        const sbId = `storyboard-${ts}`
        const sbCount = (nodeCount.storyboard ?? 0) + 1
        const rows = data.scenes.map((scene, i) => ({
          ...scene,
          sceneIndex: i + 1,
          // Associate with corresponding asset nodes
          sceneNodeId: sceneNodeIds[i],
          propNodeId: propNodeIds[i],
          characterNodeIds: data.characters.map((_, ci) => `image-char-${ts}-${ci}`),
        }))
        newNodes.push({
          id: sbId,
          type: NODE_TYPE_MAP.storyboard,
          position: { x: sx + 480, y: sy },
          data: {
            label: `分镜表 ${sbCount}`,
            type: 'storyboard' as NodeType,
            status: 'ready',
            content: JSON.stringify(rows),
          },
        })
        newEdges.push(buildEdge(screenplayNodeId, sbId, get().edgeStyleType))

        nodeCount.storyboard = sbCount

        set({
          nodes: [...get().nodes, ...newNodes],
          edges: [...get().edges, ...newEdges],
          nodeCount,
        })
      },

      createStoryboardFromScreenplay: (screenplayNodeId, scenes, scriptDuration) => {
        get()._pushUndo()
        const spNode = get().nodes.find((n) => n.id === screenplayNodeId)
        if (!spNode) return
        const nodeCount = { ...get().nodeCount }
        const ts = Date.now()
        const sbId = `storyboard-${ts}`
        const sbCount = (nodeCount.storyboard ?? 0) + 1
        const rows = scenes.map((scene, i) => ({ ...scene, sceneIndex: i + 1 }))
        const newNode: Node<CustomNodeData> = {
          id: sbId,
          type: NODE_TYPE_MAP.storyboard,
          position: { x: spNode.position.x + 480, y: spNode.position.y },
          data: {
            label: `分镜表 ${sbCount}`,
            type: 'storyboard' as NodeType,
            status: 'ready',
            content: JSON.stringify(rows),
            meta: scriptDuration ? JSON.stringify({ scriptDuration }) : undefined,
          },
        }
        const newEdge = buildEdge(screenplayNodeId, sbId, get().edgeStyleType)
        nodeCount.storyboard = sbCount
        set({
          nodes: [...get().nodes, newNode],
          edges: [...get().edges, newEdge],
          nodeCount,
        })
      },

      createAssetsFromExtraction: (screenplayNodeId, data) => {
        get()._pushUndo()
        const spNode = get().nodes.find((n) => n.id === screenplayNodeId)
        if (!spNode) return

        const nodeCount = { ...get().nodeCount }
        const newNodes: Node<CustomNodeData>[] = []
        const newEdges: Edge[] = []
        const ts = Date.now()
        const sx = spNode.position.x
        const sy = spNode.position.y

        // Read style tags stored by createScreenplayNode
        const spContent = (() => { try { return JSON.parse(spNode.data.content as string ?? '{}') } catch { return {} } })()
        const styles: string[] = spContent.styles ?? []
        const { charStyle, sceneStyle, propStyle, charNegative } = buildStylePrompts(styles)

        const characters = data.characters ?? []
        const locations = data.locations ?? []
        const props = data.props ?? []
        const storyboard = data.storyboard ?? []

        // ── Column-based auto-layout: all assets stack vertically in two columns ──
        // screenplay(500px) → 100px gap → prompt(560px) → 60px gap → result(280px) → 80px gap → storyboard
        const COL_PROMPT  = sx + 600   // 100px right of screenplay right edge (sx+500)
        const COL_RESULT  = sx + 1220  // 60px right of prompt right edge (sx+600+560=1160)
        const COL_SB      = sx + 1580  // 80px right of result right edge (sx+1220+280=1500)
        const ROW_STEP    = 400        // prompt/result node max height ~340px + 60px gap
        // One blank row as visual separator between char / loc / prop groups
        const locGapRows  = characters.length > 0 && locations.length > 0 ? 1 : 0
        const propGapRows = locations.length > 0 && props.length > 0 ? 1 : 0
        const totalRows   = characters.length + locations.length + props.length + locGapRows + propGapRows
        const startY      = sy - (totalRows * ROW_STEP) / 2 + ROW_STEP / 2
        const rowY        = (row: number) => startY + row * ROW_STEP

        const locationNodeMap = new Map<string, string>()
        const propNodeMap     = new Map<string, string>()

        // 1. Character image nodes
        characters.forEach((char, i) => {
          const promptId = `image-char-${ts}-${i}`
          const resultId = `image-char-result-${ts}-${i}`
          const y = rowY(i)
          const prompt = `角色设计参考图：${char.name}\n${char.appearance}\n三视图，白色背景，全身，正面+侧面+背面，设计统一，${charStyle}，高质量\n中性表情，闭嘴，放松站姿，标准角色设计参考图，双手无道具，平光照明\n避免：${charNegative}，微笑，大笑，哭泣，愤怒表情，张嘴，情绪化面部，动作姿势，战斗，跑步，跳跃，手势，手持武器，复杂背景，水印，文字`
          newNodes.push({
            id: promptId,
            type: NODE_TYPE_MAP.image,
            position: { x: COL_PROMPT, y },
            data: { label: `角色：${char.name}`, type: 'image', status: 'idle', content: prompt, meta: char.role },
          })
          newEdges.push(buildEdge(screenplayNodeId, promptId, get().edgeStyleType))
          newNodes.push({
            id: resultId,
            type: NODE_TYPE_MAP.image,
            position: { x: COL_RESULT, y },
            data: { label: `角色：${char.name}`, type: 'image', status: 'idle', mode: 'result' },
          })
          newEdges.push(buildEdge(promptId, resultId, get().edgeStyleType))
        })
        nodeCount.image = (nodeCount.image ?? 0) + characters.length * 2

        // 2. Location/scene image nodes
        const locStartRow = characters.length + locGapRows
        locations.forEach((loc, i) => {
          const promptId = `image-loc-${ts}-${i}`
          const resultId = `image-loc-result-${ts}-${i}`
          locationNodeMap.set(loc.name, resultId)
          const y = rowY(locStartRow + i)
          const prompt = `场景背景：${loc.name}\n${loc.description}\n${loc.atmosphere ?? ''}\n${sceneStyle}，无人物，仅环境，高质量，超高清`
          newNodes.push({
            id: promptId,
            type: NODE_TYPE_MAP.image,
            position: { x: COL_PROMPT, y },
            data: { label: `场景：${loc.name}`, type: 'image', status: 'idle', content: prompt },
          })
          newEdges.push(buildEdge(screenplayNodeId, promptId, get().edgeStyleType))
          newNodes.push({
            id: resultId,
            type: NODE_TYPE_MAP.image,
            position: { x: COL_RESULT, y },
            data: { label: `场景：${loc.name}`, type: 'image', status: 'idle', mode: 'result' },
          })
          newEdges.push(buildEdge(promptId, resultId, get().edgeStyleType))
        })
        nodeCount.image = (nodeCount.image ?? 0) + locations.length * 2

        // 3. Prop image nodes
        const propStartRow = locStartRow + locations.length + propGapRows
        if (props.length > 0) {
          props.forEach((prop, i) => {
            const promptId = `image-prop-${ts}-${i}`
            const resultId = `image-prop-result-${ts}-${i}`
            propNodeMap.set(prop.name, resultId)
            const y = rowY(propStartRow + i)
            const prompt = `道具设计：${prop.name}\n${prop.description}\n${propStyle}，白色背景，精细，专业`
            newNodes.push({
              id: promptId,
              type: NODE_TYPE_MAP.image,
              position: { x: COL_PROMPT, y },
              data: { label: `道具：${prop.name}`, type: 'image', status: 'idle', content: prompt },
            })
            newEdges.push(buildEdge(screenplayNodeId, promptId, get().edgeStyleType))
            newNodes.push({
              id: resultId,
              type: NODE_TYPE_MAP.image,
              position: { x: COL_RESULT, y },
              data: { label: `道具：${prop.name}`, type: 'image', status: 'idle', mode: 'result' },
            })
            newEdges.push(buildEdge(promptId, resultId, get().edgeStyleType))
          })
          nodeCount.image = (nodeCount.image ?? 0) + props.length * 2
        }

        // 4. Storyboard table node — to the right of screenplay node
        const sbId = `storyboard-${ts}`
        const sbCount = (nodeCount.storyboard ?? 0) + 1

        // Build rows AND collect per-row node references for auto-wiring
        const rowSceneNodeIds: (string | undefined)[] = []
        const rowCharNodeIds: string[][] = []
        const rowPropNodeIds: string[][] = []

        const rows = storyboard.map((shot, i) => {
          const shotText = storyboardShotText(shot)

          // Scene: direct/fuzzy lookup + any location name found across all structured shot fields
          const locationNames = Array.from(locationNodeMap.keys())
          const resolvedLocations = resolveStoryboardAssetNames(
            shot.locationName ? [shot.locationName] : [],
            locationNames,
            shotText,
          )
          const resolvedLocationName = resolvedLocations[0] ?? shot.locationName
          const sceneNId = resolvedLocations.map((name) => locationNodeMap.get(name)).find(Boolean)

          // Characters: merge explicit list + any character name found across all shot fields
          const allCharNames = resolveStoryboardAssetNames(
            shot.characterNames,
            characters.map((c) => c.name),
            shotText,
          )
          const charNIds = allCharNames
            .map((name) => {
              const idx = characters.findIndex((c) => c.name === name)
              return idx >= 0 ? `image-char-result-${ts}-${idx}` : null
            })
            .filter((id): id is string => id !== null)

          // Props: merge explicit list + any prop name found across all shot fields
          const allPropNames = resolveStoryboardAssetNames(
            shot.propNames,
            props.map((p) => p.name),
            shotText,
          )
          const propNIds = allPropNames
            .map((name) => propNodeMap.get(name))
            .filter((id): id is string => !!id)

          rowSceneNodeIds.push(sceneNId)
          rowCharNodeIds.push(charNIds)
          rowPropNodeIds.push(propNIds)

          return {
            description: shot.description,
            blocking: shot.blocking ?? '',
            action: shot.action ?? '',
            expression: shot.expression ?? '',
            cameraAngle: shot.cameraAngle ?? '',
            composition: shot.composition ?? '',
            dialogue: shot.dialogue ?? '',
            duration: shot.duration,
            durationReason: shot.durationReason ?? '',
            camera: shot.camera,
            shotType: shot.shotType ?? '',
            negativePrompt: shot.negativePrompt ?? '低质量，模糊，水印',
            aspectRatio: shot.aspectRatio ?? '16:9',
            characters: allCharNames,
            locationName: resolvedLocationName,
            propNames: allPropNames,
            sceneIndex: shot.shot ?? i + 1,
            sceneNodeId: sceneNId,
            characterNodeIds: charNIds,
            propNodeIds: propNIds,
          }
        })

        newNodes.push({
          id: sbId,
          type: NODE_TYPE_MAP.storyboard,
          position: { x: COL_SB, y: sy },
          data: { label: `分镜表 ${sbCount}`, type: 'storyboard' as NodeType, status: 'ready', content: JSON.stringify(rows) },
        })
        // Screenplay → storyboard main edge
        newEdges.push(buildEdge(screenplayNodeId, sbId, get().edgeStyleType))

        // Auto-wire scene/char/prop result nodes → storyboard per-row handles
        rows.forEach((_, i) => {
          const sceneNId = rowSceneNodeIds[i]
          if (sceneNId) {
            newEdges.push(buildEdge(sceneNId, sbId, get().edgeStyleType, { targetHandle: `scene-in-${i}` }))
          }
          rowCharNodeIds[i].forEach((charNId, j) => {
            newEdges.push(buildEdge(charNId, sbId, get().edgeStyleType, { targetHandle: `char-in-${i}-${j}` }))
          })
          rowPropNodeIds[i].forEach((propNId, j) => {
            newEdges.push(buildEdge(propNId, sbId, get().edgeStyleType, { targetHandle: `prop-in-${i}-${j}` }))
          })
        })

        nodeCount.storyboard = sbCount

        set({
          nodes: [...get().nodes, ...newNodes],
          edges: [...get().edges, ...newEdges],
          nodeCount,
        })
      },

      // ── Short-drama: whole-drama asset extraction + episode-list node ──────────
      createEpisodeAssetsAndList: (screenplayNodeId, data) => {
        get()._pushUndo()
        const spNode = get().nodes.find((n) => n.id === screenplayNodeId)
        if (!spNode) return

        const nodeCount = { ...get().nodeCount }
        const newNodes: Node<CustomNodeData>[] = []
        const newEdges: Edge[] = []
        const ts = Date.now()
        const sx = spNode.position.x
        const sy = spNode.position.y

        const spContent = (() => { try { return JSON.parse(spNode.data.content as string ?? '{}') } catch { return {} } })()
        const styles: string[] = spContent.styles ?? []
        const { charStyle, sceneStyle, propStyle, charNegative } = buildStylePrompts(styles)

        const characters = data.characters ?? []
        const locations = data.locations ?? []
        const props = data.props ?? []
        const episodes = data.episodes ?? []

        // Two asset columns to the right of the screenplay; episode list further right.
        const COL_PROMPT = sx + 600
        const COL_RESULT = sx + 1220
        const COL_LIST   = sx + 1580
        const ROW_STEP   = 400
        const locGapRows  = characters.length > 0 && locations.length > 0 ? 1 : 0
        const propGapRows = locations.length > 0 && props.length > 0 ? 1 : 0
        const totalRows   = characters.length + locations.length + props.length + locGapRows + propGapRows
        const startY      = sy - (totalRows * ROW_STEP) / 2 + ROW_STEP / 2
        const rowY        = (row: number) => startY + row * ROW_STEP

        const charRefs: Record<string, string> = {}
        const locRefs: Record<string, string> = {}
        const propRefs: Record<string, string> = {}

        // 1. Character image nodes (prompt → result)
        characters.forEach((char, i) => {
          const promptId = `image-char-${ts}-${i}`
          const resultId = `image-char-result-${ts}-${i}`
          charRefs[char.name] = resultId
          const y = rowY(i)
          const prompt = `角色设计参考图：${char.name}\n${char.appearance}\n三视图，白色背景，全身，正面+侧面+背面，设计统一，${charStyle}，高质量\n中性表情，闭嘴，放松站姿，标准角色设计参考图，双手无道具，平光照明\n避免：${charNegative}，微笑，大笑，哭泣，愤怒表情，张嘴，情绪化面部，动作姿势，战斗，跑步，跳跃，手势，手持武器，复杂背景，水印，文字`
          newNodes.push({ id: promptId, type: NODE_TYPE_MAP.image, position: { x: COL_PROMPT, y }, data: { label: `角色：${char.name}`, type: 'image', status: 'idle', content: prompt, meta: char.role } })
          newEdges.push(buildEdge(screenplayNodeId, promptId, get().edgeStyleType))
          newNodes.push({ id: resultId, type: NODE_TYPE_MAP.image, position: { x: COL_RESULT, y }, data: { label: `角色：${char.name}`, type: 'image', status: 'idle', mode: 'result' } })
          newEdges.push(buildEdge(promptId, resultId, get().edgeStyleType))
        })
        nodeCount.image = (nodeCount.image ?? 0) + characters.length * 2

        // 2. Location/scene image nodes
        const locStartRow = characters.length + locGapRows
        locations.forEach((loc, i) => {
          const promptId = `image-loc-${ts}-${i}`
          const resultId = `image-loc-result-${ts}-${i}`
          locRefs[loc.name] = resultId
          const y = rowY(locStartRow + i)
          const prompt = `场景背景：${loc.name}\n${loc.description}\n${loc.atmosphere ?? ''}\n${sceneStyle}，无人物，仅环境，高质量，超高清`
          newNodes.push({ id: promptId, type: NODE_TYPE_MAP.image, position: { x: COL_PROMPT, y }, data: { label: `场景：${loc.name}`, type: 'image', status: 'idle', content: prompt } })
          newEdges.push(buildEdge(screenplayNodeId, promptId, get().edgeStyleType))
          newNodes.push({ id: resultId, type: NODE_TYPE_MAP.image, position: { x: COL_RESULT, y }, data: { label: `场景：${loc.name}`, type: 'image', status: 'idle', mode: 'result' } })
          newEdges.push(buildEdge(promptId, resultId, get().edgeStyleType))
        })
        nodeCount.image = (nodeCount.image ?? 0) + locations.length * 2

        // 3. Prop image nodes
        const propStartRow = locStartRow + locations.length + propGapRows
        props.forEach((prop, i) => {
          const promptId = `image-prop-${ts}-${i}`
          const resultId = `image-prop-result-${ts}-${i}`
          propRefs[prop.name] = resultId
          const y = rowY(propStartRow + i)
          const prompt = `道具设计：${prop.name}\n${prop.description}\n${propStyle}，白色背景，精细，专业`
          newNodes.push({ id: promptId, type: NODE_TYPE_MAP.image, position: { x: COL_PROMPT, y }, data: { label: `道具：${prop.name}`, type: 'image', status: 'idle', content: prompt } })
          newEdges.push(buildEdge(screenplayNodeId, promptId, get().edgeStyleType))
          newNodes.push({ id: resultId, type: NODE_TYPE_MAP.image, position: { x: COL_RESULT, y }, data: { label: `道具：${prop.name}`, type: 'image', status: 'idle', mode: 'result' } })
          newEdges.push(buildEdge(promptId, resultId, get().edgeStyleType))
        })
        nodeCount.image = (nodeCount.image ?? 0) + props.length * 2

        // 4. Episode-list node — holds every episode + name→assetNode maps for wiring
        const elId = `episodeList-${ts}`
        const elCount = (nodeCount.episodeList ?? 0) + 1
        const listEpisodes = episodes.map((e) => ({
          ep: e.ep,
          title: e.title ?? '',
          hook: e.hook ?? '',
          beats: e.beats ?? [],
          satisfactionPoint: e.satisfactionPoint ?? '',
          cliffhanger: e.cliffhanger ?? '',
          status: 'idle',
          storyboardNodeId: null,
        }))
        newNodes.push({
          id: elId,
          type: NODE_TYPE_MAP.episodeList,
          position: { x: COL_LIST, y: sy },
          data: {
            label: `剧集列表：${spContent.title ?? ''}`,
            type: 'episodeList' as NodeType,
            status: 'ready',
            content: JSON.stringify({
              title: spContent.title ?? '',
              episodeDuration: data.episodeDuration ?? spContent.episodeDuration ?? 90,
              styles,
              template: spContent.dramaTemplate,
              characters,
              locations: locations.map((l) => l.name),
              assetRefs: { chars: charRefs, locs: locRefs, props: propRefs },
              episodes: listEpisodes,
              // Carried forward from the story bible so per-episode generation can stay
              // consistent with hard constraints across dozens of episodes.
              mustKeep: spContent.storyBible?.mustKeep,
              taboo: spContent.storyBible?.taboo,
              coreConflict: spContent.storyBible?.coreConflict,
            }),
          },
        })
        newEdges.push(buildEdge(screenplayNodeId, elId, get().edgeStyleType))
        nodeCount.episodeList = elCount

        set({
          nodes: [...get().nodes, ...newNodes],
          edges: [...get().edges, ...newEdges],
          nodeCount,
        })
      },

      // ── Short-drama: generate one episode's storyboard on demand ──────────────
      createEpisodeStoryboard: (episodeListNodeId, episodeIndex, storyboard) => {
        get()._pushUndo()
        const elNode = get().nodes.find((n) => n.id === episodeListNodeId)
        if (!elNode) return undefined

        const elContent = (() => { try { return JSON.parse(elNode.data.content as string ?? '{}') } catch { return {} } })()
        const assetRefs = elContent.assetRefs ?? { chars: {}, locs: {}, props: {} }
        const charRefs: Record<string, string> = assetRefs.chars ?? {}
        const locRefs: Record<string, string> = assetRefs.locs ?? {}
        const propRefs: Record<string, string> = assetRefs.props ?? {}
        const characterNames = Object.keys(charRefs)
        const propNamesAll = Object.keys(propRefs)

        const nodeCount = { ...get().nodeCount }
        const ts = Date.now()
        const sbId = `storyboard-${ts}`
        const sbCount = (nodeCount.storyboard ?? 0) + 1
        const ex = elNode.position.x
        const ey = elNode.position.y

        const rowSceneNodeIds: (string | undefined)[] = []
        const rowCharNodeIds: string[][] = []
        const rowPropNodeIds: string[][] = []

        const rows = storyboard.map((shot, i) => {
          const shotText = storyboardShotText(shot)
          // Scene: direct/fuzzy lookup + any location name found across all structured shot fields
          const locationNames = Object.keys(locRefs)
          const resolvedLocations = resolveStoryboardAssetNames(
            shot.locationName ? [shot.locationName] : [],
            locationNames,
            shotText,
          )
          const resolvedLocationName = resolvedLocations[0] ?? shot.locationName
          const sceneNId = resolvedLocations.map((name) => locRefs[name]).find(Boolean)

          const allCharNames = resolveStoryboardAssetNames(shot.characterNames, characterNames, shotText)
          const charNIds = allCharNames.map((n) => charRefs[n]).filter((x): x is string => !!x)

          const allPropNames = resolveStoryboardAssetNames(shot.propNames, propNamesAll, shotText)
          const propNIds = allPropNames.map((n) => propRefs[n]).filter((x): x is string => !!x)

          rowSceneNodeIds.push(sceneNId)
          rowCharNodeIds.push(charNIds)
          rowPropNodeIds.push(propNIds)

          return {
            description: shot.description,
            blocking: shot.blocking ?? '',
            action: shot.action ?? '',
            expression: shot.expression ?? '',
            cameraAngle: shot.cameraAngle ?? '',
            composition: shot.composition ?? '',
            dialogue: shot.dialogue ?? '',
            duration: shot.duration,
            durationReason: shot.durationReason ?? '',
            camera: shot.camera,
            shotType: shot.shotType ?? '',
            negativePrompt: shot.negativePrompt ?? '低质量，模糊，水印',
            aspectRatio: shot.aspectRatio ?? '16:9',
            characters: allCharNames,
            locationName: resolvedLocationName,
            propNames: allPropNames,
            sceneIndex: shot.shot ?? i + 1,
            sceneNodeId: sceneNId,
            characterNodeIds: charNIds,
            propNodeIds: propNIds,
          }
        })

        const epNum = elContent.episodes?.[episodeIndex]?.ep ?? episodeIndex + 1
        const newNodes: Node<CustomNodeData>[] = [{
          id: sbId,
          type: NODE_TYPE_MAP.storyboard,
          position: { x: ex + 480, y: ey + episodeIndex * 220 },
          data: { label: `第${epNum}集 分镜表`, type: 'storyboard' as NodeType, status: 'ready', content: JSON.stringify(rows) },
        }]
        const newEdges: Edge[] = [buildEdge(episodeListNodeId, sbId, get().edgeStyleType)]

        rows.forEach((_, i) => {
          const sceneNId = rowSceneNodeIds[i]
          if (sceneNId) newEdges.push(buildEdge(sceneNId, sbId, get().edgeStyleType, { targetHandle: `scene-in-${i}` }))
          rowCharNodeIds[i].forEach((charNId, j) => newEdges.push(buildEdge(charNId, sbId, get().edgeStyleType, { targetHandle: `char-in-${i}-${j}` })))
          rowPropNodeIds[i].forEach((propNId, j) => newEdges.push(buildEdge(propNId, sbId, get().edgeStyleType, { targetHandle: `prop-in-${i}-${j}` })))
        })
        nodeCount.storyboard = sbCount

        // Mark this episode generated + record its storyboard node id on the list node
        const updatedNodes = get().nodes.map((n) => {
          if (n.id !== episodeListNodeId) return n
          const c = (() => { try { return JSON.parse(n.data.content as string ?? '{}') } catch { return {} } })()
          if (Array.isArray(c.episodes) && c.episodes[episodeIndex]) {
            c.episodes[episodeIndex] = { ...c.episodes[episodeIndex], status: 'done', storyboardNodeId: sbId }
          }
          return { ...n, data: { ...n.data, content: JSON.stringify(c) } }
        })

        set({
          nodes: [...updatedNodes, ...newNodes],
          edges: [...get().edges, ...newEdges],
          nodeCount,
        })

        return sbId
      },

      createStoryboardVideoGroups: (storyboardNodeId, options) => {
        const sbNode = get().nodes.find((n) => n.id === storyboardNodeId)
        if (!sbNode) return 0
        const rows = (() => {
          try {
            const parsed = JSON.parse((sbNode.data.content as string) || '[]')
            return Array.isArray(parsed) ? parsed as Array<Record<string, unknown>> : []
          } catch {
            return []
          }
        })()
        const maxDuration = options.maxDuration
        const groups = buildStoryboardVideoGroups(rows, maxDuration)
        if (groups.length === 0) return 0

        get()._pushUndo()
        const nodeCount = { ...get().nodeCount }
        const edgeStyle = get().edgeStyleType
        const now = Date.now()
        const baseX = sbNode.position.x + 1460
        const baseY = sbNode.position.y
        const newNodes: Node<CustomNodeData>[] = []
        const newEdges: Edge[] = []
        let videoCount = nodeCount.video ?? 0

        groups.forEach((group, groupIndex) => {
          videoCount += 1
          const firstShot = group.start + 1
          const lastShot = group.start + group.rows.length
          const videoId = `video-${now}-${groupIndex}`
          const prompt = storyboardRowsToVideoPrompt(group.rows, group.start, group.seconds, maxDuration)
          const meta = JSON.stringify({
            duration: Math.min(maxDuration, Math.round(group.seconds)),
            ratio: options.ratio ?? '16:9',
            resolution: options.resolution ?? '720p',
            modelId: options.modelId,
            storyboardGroup: {
              firstShot,
              lastShot,
              maxDuration,
              modelLabel: options.modelLabel ?? `Seedance ${maxDuration}s`,
            },
          })

          newNodes.push({
            id: videoId,
            type: NODE_TYPE_MAP.video,
            position: { x: baseX, y: baseY + groupIndex * 260 },
            data: {
              label: `视频段 ${firstShot}-${lastShot}`,
              type: 'video',
              status: 'ready',
              content: prompt,
              meta,
            },
          })

          group.rows.forEach((_, rowOffset) => {
            newEdges.push(buildEdge(storyboardNodeId, videoId, edgeStyle, {
              sourceHandle: `row-${group.start + rowOffset}`,
              targetHandle: 'tab-ref',
            }))
          })

          const refIds = new Set<string>()
          const imageResultNodes = get().nodes.filter((n) => n.data.type === 'image' && n.data.mode === 'result')
          const imageResultByLabelName = (prefix: string, name: unknown) => {
            const targetName = normalizeAssetName(name)
            if (!targetName) return undefined
            return imageResultNodes.find((node) => {
              const label = String(node.data.label ?? '')
              if (!label.startsWith(prefix)) return false
              const labelName = normalizeAssetName(label.slice(prefix.length))
              return labelName === targetName || labelName.includes(targetName) || targetName.includes(labelName)
            })?.id
          }
          group.rows.forEach((row) => {
            const rowText = storyboardShotText({
              description: String(row.description ?? ''),
              blocking: String(row.blocking ?? ''),
              action: String(row.action ?? ''),
              expression: String(row.expression ?? ''),
              cameraAngle: String(row.cameraAngle ?? ''),
              composition: String(row.composition ?? ''),
              dialogue: String(row.dialogue ?? ''),
              locationName: String(row.locationName ?? ''),
              characterNames: row.characters as string[] | undefined,
              propNames: row.propNames as string[] | undefined,
            })

            if (typeof row.sceneNodeId === 'string') refIds.add(row.sceneNodeId)
            const inferredSceneId = imageResultByLabelName('场景：', row.locationName)
            if (inferredSceneId) refIds.add(inferredSceneId)

            for (const refId of (row.characterNodeIds as string[] | undefined) ?? []) refIds.add(refId)
            for (const name of (row.characters as string[] | undefined) ?? []) {
              const inferredCharId = imageResultByLabelName('角色：', name)
              if (inferredCharId) refIds.add(inferredCharId)
            }

            for (const refId of (row.propNodeIds as string[] | undefined) ?? []) refIds.add(refId)
            for (const name of (row.propNames as string[] | undefined) ?? []) {
              const inferredPropId = imageResultByLabelName('道具：', name)
              if (inferredPropId) refIds.add(inferredPropId)
            }

            imageResultNodes.forEach((node) => {
              const label = String(node.data.label ?? '')
              const assetName = label.includes('：') ? label.split('：').slice(1).join('：') : label
              if (assetName && rowText.includes(assetName)) refIds.add(node.id)
            })
          })
          refIds.forEach((refId) => {
            newEdges.push(buildEdge(refId, videoId, edgeStyle, { targetHandle: 'tab-ref' }))
          })
        })

        set({
          nodes: [...get().nodes, ...newNodes],
          edges: [...get().edges, ...newEdges],
          nodeCount: { ...nodeCount, video: videoCount },
        })
        return groups.length
      },

      loadCanvas: ({ nodes, edges, nodeCount }) => {
        get()._pushUndo()
        const edgeStyleType = get().edgeStyleType
        set({
          nodes: nodes.map((node) => ({ ...node, selected: false })),
          edges: edges.map((edge) => ({
            ...edge, selected: false, type: getEdgeType(edgeStyleType), style: edgeStyle,
          })),
          nodeCount: nodeCount ?? countNodesByType(nodes),
        })
      },

      resetCanvas: () => {
        get()._pushUndo()
        const edgeStyleType = get().edgeStyleType
        set({
          nodes: initialNodes,
          edges: initialEdges.map((edge) => buildEdge(edge.source, edge.target, edgeStyleType)),
          nodeCount: countNodesByType(initialNodes),
        })
      },
    }),
    {
      name: 'ai-canvas-store',
      version: 3,
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
        edgeStyleType: state.edgeStyleType,
        nodeCount: state.nodeCount,
      }),
    }
  )
)
