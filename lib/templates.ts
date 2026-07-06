import { Edge, MarkerType, Node } from '@xyflow/react'
import { CustomNodeData, NodeType, WorkflowSnapshot } from './store'

const nodeTypeMap: Record<NodeType, string> = {
  text: 'textNode',
  image: 'imageNode',
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
  group: 'groupNode',
}

function n(
  id: string,
  type: NodeType,
  position: { x: number; y: number },
  data: Partial<CustomNodeData>
): Node<CustomNodeData> {
  return {
    id,
    type: nodeTypeMap[type],
    position,
    data: { label: data.label ?? '节点', type, status: 'idle', ...data },
  }
}

function e(id: string, source: string, target: string, sourceHandle = 'output', targetHandle = 'input'): Edge {
  return {
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
    type: 'default',
    selectable: true,
    interactionWidth: 24,
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: 'var(--edge-color)' },
    style: { stroke: 'var(--edge-color)', strokeWidth: 2 },
  }
}

export interface TemplateItem {
  id: string
  title: string
  subtitle: string
  description: string
  tags: string[]
  icon: string
  snapshot: WorkflowSnapshot
}

export const templates: TemplateItem[] = [
  {
    id: 'image-to-video',
    title: '图片生成短视频',
    subtitle: '首帧图片 + 提示词 → 视频',
    description: '把产品图、人物图或场景图快速转成 5-10 秒动态视频。',
    tags: ['首帧', '文生视频', '快速出片'],
    icon: 'film',
    snapshot: {
      nodes: [
        n('tpl-iv-prompt', 'text', { x: 80, y: 80 }, {
          label: '视频画面描述',
          content: '镜头缓缓拉近，主体自然呼吸，光线柔和，写实风格。',
          status: 'ready',
          meta: '描述镜头运动、主体动作和整体氛围',
        }),
        n('tpl-iv-image', 'image', { x: 80, y: 330 }, {
          label: '首帧图片',
          mode: 'input',
          status: 'idle',
          meta: '上传你的图片作为视频起始帧',
        }),
        n('tpl-iv-video', 'video', { x: 560, y: 160 }, {
          label: 'AI 视频生成',
          status: 'idle',
          meta: '首帧模式 · 5–10 秒',
        }),
      ],
      edges: [
        // 文字描述 → 视频首帧/尾帧 tab（tab-firstlast 同时接受文字和图片）
        e('tpl-iv-e1', 'tpl-iv-prompt', 'tpl-iv-video', 'output', 'tab-firstlast'),
        // 首帧图片 → 视频首帧/尾帧 tab
        e('tpl-iv-e2', 'tpl-iv-image', 'tpl-iv-video', 'output', 'tab-firstlast'),
      ],
    },
  },
  {
    id: 'screenplay-workflow',
    title: 'AI 短剧制作',
    subtitle: '剧本 → 分镜表 → 逐镜生成视频',
    description: '从一句话创意开始，AI 自动编写剧本、拆分分镜、生成角色和视频。',
    tags: ['剧本', '分镜', '短剧', '全流程'],
    icon: 'clapperboard',
    snapshot: {
      nodes: [
        n('tpl-sp-screenplay', 'screenplay', { x: 80, y: 60 }, {
          label: 'AI 编剧',
          status: 'idle',
          meta: '输入故事创意，点击"确认角色"生成角色节点，再点击"生成分镜表"',
        }),
        n('tpl-sp-storyboard', 'storyboard', { x: 680, y: 60 }, {
          label: '分镜表',
          status: 'idle',
          meta: '编剧自动生成，包含场景描述、角色、时长等',
        }),
        n('tpl-sp-video', 'video', { x: 1850, y: 120 }, {
          label: '视频生成',
          status: 'idle',
          meta: '连接分镜表后逐镜生成视频',
        }),
      ],
      edges: [
        // 剧本 → 分镜表（两个基础节点，均有标准 input/output handle）
        e('tpl-sp-e1', 'tpl-sp-screenplay', 'tpl-sp-storyboard', 'output', 'input'),
        // 分镜表 row-0 → 视频 tab-ref（分镜表输出端口 row-0，视频参考 tab）
        e('tpl-sp-e2', 'tpl-sp-storyboard', 'tpl-sp-video', 'row-0', 'tab-ref'),
      ],
    },
  },
  {
    id: 'product-commercial',
    title: '产品广告工作流',
    subtitle: '商品图 → AI 场景 + 广告文案 → 视频',
    description: '电商主图、品牌短片、产品发布素材，替换商品图和文案即可出片。',
    tags: ['产品图', '广告', '电商'],
    icon: 'sparkles',
    snapshot: {
      nodes: [
        n('tpl-ad-product', 'image', { x: 80, y: 80 }, {
          label: '产品图片',
          mode: 'input',
          status: 'idle',
          meta: '上传你的产品图（透明底或场景图均可）',
        }),
        n('tpl-ad-copy', 'text', { x: 80, y: 370 }, {
          label: '广告文案',
          content: '开场吸引注意 → 产品特写展示 → 3 个核心卖点 → 使用场景 → 品牌结尾。',
          status: 'ready',
          meta: '替换品牌名和卖点描述',
        }),
        n('tpl-ad-scene', 'image', { x: 520, y: 80 }, {
          label: 'AI 场景图生成',
          status: 'idle',
          meta: '基于产品图 AI 生成广告场景',
        }),
        n('tpl-ad-video', 'video', { x: 980, y: 180 }, {
          label: '广告视频输出',
          status: 'idle',
          meta: '9:16 竖版 / 16:9 横版可调',
        }),
      ],
      edges: [
        // 产品图 → AI 场景图（图生图 tab，产品图驱动场景生成）
        e('tpl-ad-e1', 'tpl-ad-product', 'tpl-ad-scene', 'output', 'tab-img2img'),
        // 广告文案 → 视频（文生视频 tab，文案驱动视频叙事）
        e('tpl-ad-e2', 'tpl-ad-copy', 'tpl-ad-video', 'output', 'tab-text2video'),
        // AI 场景图 → 视频（参考 tab，生成的场景作为视觉参考）
        e('tpl-ad-e3', 'tpl-ad-scene', 'tpl-ad-video', 'output', 'tab-ref'),
      ],
    },
  },
  {
    id: 'character-consistency',
    title: '角色一致性视频',
    subtitle: '角色参考图 + 描述 → 分镜 → 视频',
    description: '适合虚拟人、IP 角色、剧情短片，先锁定角色再生成分镜与视频。',
    tags: ['角色参考', '一致性', '分镜'],
    icon: 'user-circle',
    snapshot: {
      nodes: [
        n('tpl-char-ref', 'image', { x: 80, y: 80 }, {
          label: '角色参考图',
          mode: 'input',
          status: 'idle',
          meta: '上传清晰的角色半身图或头像',
        }),
        n('tpl-char-text', 'text', { x: 80, y: 370 }, {
          label: '分镜描述',
          content: '角色走近镜头，面部特写，光线从侧面打来，眼神坚定，背景为城市夜景虚化。',
          status: 'ready',
          meta: '描述镜头构图、角色动作和场景',
        }),
        n('tpl-char-scene', 'image', { x: 520, y: 230 }, {
          label: 'AI 分镜图',
          status: 'idle',
          meta: '基于角色参考 + 描述生成关键分镜',
        }),
        n('tpl-char-video', 'video', { x: 980, y: 200 }, {
          label: '角色视频生成',
          status: 'idle',
          meta: '人物一致性优先',
        }),
      ],
      edges: [
        // 角色参考图 → 分镜图（imgref tab，保持角色外观一致性）
        e('tpl-char-e1', 'tpl-char-ref', 'tpl-char-scene', 'output', 'tab-imgref'),
        // 分镜描述 → 分镜图（文生图 tab，文字描述驱动分镜构图）
        e('tpl-char-e2', 'tpl-char-text', 'tpl-char-scene', 'output', 'tab-text2img'),
        // 角色参考图 → 视频（首帧/尾帧 tab，角色图作为视频起始帧）
        e('tpl-char-e3', 'tpl-char-ref', 'tpl-char-video', 'output', 'tab-firstlast'),
        // AI 分镜图 → 视频（参考 tab，生成的分镜图作为视觉参考）
        e('tpl-char-e4', 'tpl-char-scene', 'tpl-char-video', 'output', 'tab-ref'),
      ],
    },
  },
  {
    id: 'text-to-video',
    title: '纯文字生成视频',
    subtitle: '文字描述 → 提示词优化 → AI 视频',
    description: '输入文字描述，可选择用提示词助手优化，然后直接生成视频。',
    tags: ['文生视频', '零素材', '快速'],
    icon: 'type',
    snapshot: {
      nodes: [
        n('tpl-t2v-prompt', 'text', { x: 80, y: 100 }, {
          label: '视频画面描述',
          content: '详细描述你想要的视频画面：场景、主体、动作、光线、风格。',
          status: 'ready',
          meta: '写得越详细，生成效果越好',
        }),
        n('tpl-t2v-assist', 'promptAssistant', { x: 500, y: 100 }, {
          label: '提示词优化',
          status: 'idle',
          meta: '让 AI 帮你扩写和优化画面描述（可选跳过）',
        }),
        n('tpl-t2v-video', 'video', { x: 940, y: 120 }, {
          label: 'AI 视频生成',
          status: 'idle',
          meta: '文生视频模式',
        }),
      ],
      edges: [
        // 文字描述 → 提示词助手（基础节点 input handle）
        e('tpl-t2v-e1', 'tpl-t2v-prompt', 'tpl-t2v-assist', 'output', 'input'),
        // 提示词助手 → 视频（文生视频 tab，optimized prompt 驱动视频生成）
        e('tpl-t2v-e2', 'tpl-t2v-assist', 'tpl-t2v-video', 'output', 'tab-text2video'),
      ],
    },
  },
  {
    id: 'img2img-video',
    title: '图生图 + 视频',
    subtitle: '原图 + 风格描述 → AI 风格化 → 视频',
    description: '先用图生图改变风格或添加元素，再将结果转成动态视频。',
    tags: ['图生图', '风格化', '视频'],
    icon: 'image-plus',
    snapshot: {
      nodes: [
        n('tpl-i2i-src', 'image', { x: 80, y: 100 }, {
          label: '原始图片',
          mode: 'input',
          status: 'idle',
          meta: '上传任意图片作为起点',
        }),
        n('tpl-i2i-style', 'text', { x: 80, y: 370 }, {
          label: '风格描述',
          content: '赛博朋克风格，霓虹灯光，雨夜街道，高对比度，电影感。',
          status: 'ready',
          meta: '描述目标风格、色调或要添加的元素',
        }),
        n('tpl-i2i-gen', 'image', { x: 530, y: 210 }, {
          label: 'AI 图生图',
          status: 'idle',
          meta: '风格转换 / 元素添加（最多 1 图 + 1 文）',
        }),
        n('tpl-i2i-video', 'video', { x: 980, y: 230 }, {
          label: '视频动画生成',
          status: 'idle',
          meta: '将风格化图片转为动态视频',
        }),
      ],
      edges: [
        // 原始图片 → 图生图（img2img tab，作为参考图）
        e('tpl-i2i-e1', 'tpl-i2i-src', 'tpl-i2i-gen', 'output', 'tab-img2img'),
        // 风格描述 → 图生图（img2img tab 也接受文字作为风格指导）
        e('tpl-i2i-e2', 'tpl-i2i-style', 'tpl-i2i-gen', 'output', 'tab-img2img'),
        // 风格化图片 → 视频（首帧/尾帧 tab，生成图作为视频起始帧）
        e('tpl-i2i-e3', 'tpl-i2i-gen', 'tpl-i2i-video', 'output', 'tab-firstlast'),
      ],
    },
  },
]
