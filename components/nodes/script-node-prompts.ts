export type ContentType =
  | 'shortdrama' | 'movie' | 'microfilm'
  | 'shortvideo' | 'vlog' | 'livestream'
  | 'ad' | 'promo'
  | 'mv' | 'motionposter'
  | 'documentary' | 'tutorial' | 'commentary'

export interface PromptPair { system: string; user: string }

// ─── Short Drama ──────────────────────────────────────────────────────────────

/** Max episode outlines requested per AI call — keeps each call within token limits. */
export const DRAMA_BATCH_SIZE = 12

export function buildShortDramaPrompt(p: {
  template: string
  episodeCount: number
  episodeDuration: number
  brief: string
  satisfactionType: string
}): PromptPair {
  const outputEp = Math.min(p.episodeCount, DRAMA_BATCH_SIZE)
  return {
    system: `你是中国互联网短剧专业编剧，专注创作「${p.template}」类型爆款短剧。

核心创作规则：
1. 第一集前5秒：立即制造强烈冲突或反差，决定用户是否继续看
2. 每集节奏：开场钩子 → 快速推进 → 爽点/冲突 → 悬念结尾，不能拖沓
3. 爽点密度：每集至少1个让观众"爽到"的时刻（反转/打脸/财富/能力碾压）
4. 每集结尾必须制造强悬念，让观众想刷下一集
5. 对话精炼有力，口语化，适合竖屏快消费

严格按JSON返回，不要有任何其他内容：
{
  "title": "剧名",
  "synopsis": "故事概要（包含主要矛盾和爽点方向，3-5句）",
  "firstHook": "第一集前5秒发生的事（具体描述，要足够抓人）",
  "characters": [
    {"name": "角色名", "role": "主角/CP/反派/配角", "appearance": "详细外貌", "personality": "性格与定位"}
  ],
  "episodes": [
    {
      "ep": 1,
      "title": "集标题",
      "hook": "本集开场钩子（前5秒）",
      "beats": ["剧情节点1", "剧情节点2", "剧情节点3"],
      "satisfactionPoint": "本集爽点",
      "cliffhanger": "结尾悬念"
    }
  ],
  "content": "世界观设定 + 人物关系 + 整体剧情走向（含后期高潮规划）"
}`,
    user: `【剧情模板】${p.template}
【集数规划】共${p.episodeCount}集，每集${p.episodeDuration}秒
【爽点类型】${p.satisfactionType || '综合爽点'}
【故事方向】${p.brief}

请生成第1集到第${outputEp}集的详细分集大纲（episodes数组，ep字段为真实集号）。`,
  }
}

/** Continuation batch — outlines for episodes beyond the first call, keeping continuity. */
export function buildDramaEpisodesBatchPrompt(p: {
  from: number
  to: number
  template: string
  satisfactionType: string
  episodeDuration: number
  title: string
  synopsis: string
  characters: Array<{ name: string; role?: string; appearance?: string; personality?: string }>
  content: string
  previousCliffhanger?: string
}): PromptPair {
  return {
    system: `你是中国互联网短剧专业编剧，正在续写「${p.template}」类型爆款短剧的分集大纲。
保持与已确定的世界观、人物、剧情走向一致；每集节奏：开场钩子→快速推进→爽点→悬念结尾；每集结尾制造强悬念。

严格按JSON返回，只返回episodes数组，不要有任何其他内容：
{
  "episodes": [
    {"ep": 集号, "title": "集标题", "hook": "开场钩子（前5秒）", "beats": ["剧情节点1","剧情节点2","剧情节点3"], "satisfactionPoint": "本集爽点", "cliffhanger": "结尾悬念"}
  ]
}`,
    user: `【剧名】${p.title}
【故事概要】${p.synopsis}
【世界观与走向】${p.content}
【主要角色】${p.characters.map((c) => `${c.name}（${c.role ?? ''}）`).join('、')}
【爽点类型】${p.satisfactionType || '综合爽点'}
【每集时长】${p.episodeDuration}秒
${p.previousCliffhanger ? `【上一集结尾悬念】${p.previousCliffhanger}` : ''}

请继续生成第${p.from}集到第${p.to}集的详细分集大纲，ep字段必须为真实集号（${p.from}…${p.to}），与前文剧情连贯。`,
  }
}

/** Whole-drama asset extraction — locations + props (characters already known from script). */
export function buildDramaAssetExtractionPrompt(p: {
  title: string
  synopsis: string
  content: string
  characters: Array<{ name: string; role?: string }>
  episodes: Array<{ ep: number; title?: string; beats?: string[] }>
}): PromptPair {
  const epDigest = p.episodes.map((e) => `第${e.ep}集 ${e.title ?? ''}：${(e.beats ?? []).join('；')}`).join('\n')
  return {
    system: `你是剧本资产分析师。基于整部短剧的世界观和全部分集大纲，提取贯穿全剧的【场景】和【道具】清单（角色已单独提供，无需再提取）。

要求：
- 场景要覆盖全剧所有分集中出现的关键地点，合并重复地点，名称简洁统一
- 道具只列出对剧情重要、会被特写或反复出现的物件
- 全部用中文

严格按JSON返回，不要有任何其他内容：
{
  "locations": [
    {"name":"场景名（简洁）","description":"环境描述：地点、风格或地貌、光线时段、氛围，不含人物","atmosphere":"氛围"}
  ],
  "props": [
    {"name":"道具名","description":"材质、颜色、形状、风格，白色背景展示"}
  ]
}`,
    user: `【剧名】${p.title}
【故事概要】${p.synopsis}
【世界观与走向】${p.content}
【主要角色】${p.characters.map((c) => c.name).join('、')}
【全部分集大纲】
${epDigest}

请提取贯穿全剧的场景与道具清单。`,
  }
}

/** Per-episode storyboard — expands one episode's beats into shootable shots. */
export function buildEpisodeStoryboardPrompt(p: {
  title: string
  episode: { ep: number; title?: string; hook?: string; beats?: string[]; satisfactionPoint?: string; cliffhanger?: string }
  episodeDuration: number
  characters: Array<{ name: string; role?: string; appearance?: string }>
  locations: string[]
}): PromptPair {
  const beatList = (p.episode.beats ?? []).map((b, i) => `${i + 1}. ${b}`).join('\n')
  return {
    system: `你是专业分镜师，把一集短剧的剧情拆解成可拍摄/可生成的分镜表。

规则：
- 竖屏短剧，画幅默认9:16
- 本集总时长约${p.episodeDuration}秒，所有分镜时长之和应接近该值，每个分镜3-6秒
- 开场第一个分镜必须承接本集钩子，最后一个分镜落在结尾悬念上
- 每个分镜的locationName必须从【可用场景】中选择；characterNames必须从【可用角色】中选择，且与description中@到的角色一致
- description用于AI视频生成，需具体：镜头内容+人物动作+镜头运动(英文)+光线情绪

严格按JSON返回，不要有任何其他内容：
{
  "storyboard": [
    {
      "shot": 1,
      "duration": "4s",
      "locationName": "从可用场景中选择",
      "characterNames": ["从可用角色中选择，无则[]"],
      "propNames": [],
      "description": "[0s-4s] @场景 场景细节。@角色 动作细节。camera动作(push in/pull out/follows/static等)。光线情绪。",
      "shotType": "特写/近景/中景/中全景/全景/远景中选一个",
      "camera": "推进/拉远/跟随/固定/环绕/手持",
      "dialogue": "该镜头台词，无则空字符串",
      "negativePrompt": "画面模糊, 水印, 文字, 低画质",
      "aspectRatio": "9:16"
    }
  ]
}`,
    user: `【剧名】${p.title}
【本集】第${p.episode.ep}集 ${p.episode.title ?? ''}
【开场钩子】${p.episode.hook ?? ''}
【剧情节点】
${beatList}
【本集爽点】${p.episode.satisfactionPoint ?? ''}
【结尾悬念】${p.episode.cliffhanger ?? ''}
【可用角色】${p.characters.map((c) => c.name).join('、') || '（无固定角色）'}
【可用场景】${p.locations.join('、') || '（自行合理设定，名称需在description的@中保持一致）'}

请为本集生成完整分镜表。`,
  }
}

// ─── Movie ────────────────────────────────────────────────────────────────────

export function buildMoviePrompt(p: {
  genre: string
  arcStart: string
  arcEnd: string
  conflict: string
  theme: string
  ending: string
  duration: number
  brief: string
}): PromptPair {
  const mid = Math.round(p.duration / 2)
  const dark = Math.round(p.duration * 0.75)
  return {
    system: `你是专业电影编剧，精通三幕式剧本结构。

创作规则：
- 第一幕（前25%）：建置世界和人物，埋下激励事件
- 第二幕（中50%）：主角对抗障碍，中点翻转，黑暗时刻最低谷
- 第三幕（后25%）：高潮决战，结局完成主角弧线
- 每个转折点必须明确（激励事件/中点/黑暗时刻/高潮）
- 主题通过角色行动表达，不要说教

严格按JSON返回：
{
  "title": "剧本标题",
  "synopsis": "故事概要（3-5句）",
  "theme": "主题陈述",
  "structure": {
    "act1": {"range": "0-${Math.round(p.duration * 0.25)}分钟", "summary": "第一幕概要", "incitingIncident": "激励事件"},
    "midpoint": {"time": "约${mid}分钟", "event": "中点事件"},
    "darkMoment": {"time": "约${dark}分钟", "event": "黑暗时刻"},
    "climax": "高潮描述",
    "resolution": "结局描述"
  },
  "characters": [
    {"name": "名字", "role": "主角/对手/导师/配角", "arc": "角色弧线（起点→终点）", "appearance": "外貌描述"}
  ],
  "keyScenes": [
    {"scene": 1, "location": "场景地点", "characters": ["在场角色"], "description": "场景描述", "purpose": "叙事功能"}
  ],
  "content": "完整故事梗概（含所有关键情节转折和结局）"
}`,
    user: `【类型/风格】${p.genre}
【主角弧线起点】${p.arcStart || '由AI根据故事设计'}
【主角弧线终点】${p.arcEnd || '由AI根据故事设计'}
【核心冲突】${p.conflict || '由AI根据故事设计'}
【主题/题旨】${p.theme || '由AI根据故事提炼'}
【结局倾向】${p.ending}结局
【时长】${p.duration}分钟
【故事方向】${p.brief}

请生成包含15-20个关键场景的完整电影大纲。`,
  }
}

// ─── Micro-film ───────────────────────────────────────────────────────────────

export function buildMicrofilmPrompt(p: {
  coreEmotion: string
  pov: string
  endingMood: string
  duration: number
  brief: string
}): PromptPair {
  return {
    system: `你是微电影编剧，擅长在${p.duration}分钟内讲述一个完整的、情感饱满的故事。

创作规则：
- 聚焦单一核心情感，场景精简（5-12个），不贪多
- 情感节拍清晰：建立→变化→冲突→释放→余韵
- 视觉化表达：多用画面动作传递情感，少用直白对话
- 结尾必须有明确的情绪释放点

严格按JSON返回：
{
  "title": "微电影标题",
  "synopsis": "故事概要（2-3句）",
  "coreEmotion": "核心情感",
  "emotionBeats": [
    {"beat": "建立", "description": "如何建立初始情绪", "duration": "约Xs"},
    {"beat": "变化", "description": "触发情感变化的事件", "duration": "约Xs"},
    {"beat": "冲突", "description": "情感冲突高峰", "duration": "约Xs"},
    {"beat": "释放", "description": "情绪释放点", "duration": "约Xs"},
    {"beat": "余韵", "description": "结尾留给观众的感受", "duration": "约Xs"}
  ],
  "scenes": [
    {"scene": 1, "location": "场景", "action": "场景动作", "emotion": "传递的情感", "duration": "约Xs"}
  ],
  "characters": [{"name": "名字", "role": "角色定位", "appearance": "外貌描述"}],
  "content": "完整故事梗概 + 视觉主题建议"
}`,
    user: `【核心情感】${p.coreEmotion}
【叙事视角】${p.pov}
【结局情绪】${p.endingMood}
【时长】${p.duration}分钟
【故事方向】${p.brief}`,
  }
}

// ─── Short Video ─────────────────────────────────────────────────────────────

export function buildShortVideoPrompt(p: {
  platform: string
  hookType: string
  duration: number
  purpose: string
  brief: string
}): PromptPair {
  return {
    system: `你是专业短视频策划，精通${p.platform}平台内容创作。

创作规则：
- 前3秒生死线：必须用「${p.hookType}」抓住观众，让用户停止划走
- 每5-8秒一个信息点或情绪变化，绝不留废话镜头
- 结尾设计情绪释放点或明确的互动引导
- 旁白/字幕口语化、有节奏感，配合画面节奏

严格按JSON返回：
{
  "title": "视频标题（符合${p.platform}风格，含关键词）",
  "synopsis": "内容概要（1-2句）",
  "hook": "前3秒钩子（精确描述：画面内容 + 台词/文字 + 情绪）",
  "beats": [
    {"timeRange": "0-3s", "visual": "画面描述", "narration": "旁白/字幕", "emotion": "情绪目标"}
  ],
  "ending": "结尾设计（情绪释放点 + 互动引导文案）",
  "fullScript": "完整旁白/字幕文案（按顺序，每行标注时间）",
  "content": "拍摄要点和制作注意事项"
}`,
    user: `【平台】${p.platform}
【时长】${p.duration}秒
【钩子类型】${p.hookType}
【内容目的】${p.purpose}
【创意方向】${p.brief}

请生成完整的短视频脚本，beats需覆盖整个时长，每个时间段都要填充。`,
  }
}

// ─── Vlog ─────────────────────────────────────────────────────────────────────

export function buildVlogPrompt(p: { vlogType: string; platform: string; duration: number; brief: string }): PromptPair {
  return {
    system: `你是Vlog内容策划，擅长设计真实感、有故事感的${p.vlogType}Vlog。

创作规则：
- 开场必须有吸引人的钩子（问题/悬念/有趣画面）
- 贯穿一条情感线索或故事线，不是流水账
- 设计3-5个情绪高点（惊喜/感动/搞笑时刻）
- 旁白自然口语化，像在跟好友分享

严格按JSON返回：
{
  "title": "Vlog标题",
  "synopsis": "内容概要",
  "hook": "开场钩子（前10秒）",
  "storyLine": "贯穿全程的故事线/情感线",
  "segments": [
    {"name": "片段名", "duration": "约Xmin", "content": "内容描述", "emotionPoint": "情绪亮点"}
  ],
  "shootingList": ["拍摄清单1", "拍摄清单2"],
  "narrationTips": ["旁白风格建议1", "旁白风格建议2"],
  "content": "完整脚本框架和拍摄注意事项"
}`,
    user: `【Vlog类型】${p.vlogType}
【目标平台】${p.platform}
【时长】${p.duration}分钟
【内容方向】${p.brief}`,
  }
}

// ─── Live Stream ──────────────────────────────────────────────────────────────

export function buildLivestreamPrompt(p: { streamType: string; purpose: string; duration: number; brief: string }): PromptPair {
  return {
    system: `你是直播策划专家，擅长设计「${p.streamType}」类型直播的运营脚本。

直播脚本不同于影视剧本，它是运营流程单，需要：
- 明确每个环节的时长和目的
- 设计观众互动节点（提问/投票/秒杀等）
- 关键话术要写出来，不能只写"介绍产品"
- 开场前5分钟是留住观众的关键

严格按JSON返回：
{
  "title": "直播主题",
  "synopsis": "直播概要",
  "openingScript": "开场前5分钟话术（逐句）",
  "segments": [
    {"name": "环节名", "duration": "Xmin", "purpose": "目的", "script": "关键话术", "interaction": "互动设计"}
  ],
  "interactionDesign": ["互动活动1（时间+方式+话术）", "互动活动2"],
  "closingScript": "收尾话术",
  "content": "完整直播流程单（含时间轴）"
}`,
    user: `【直播类型】${p.streamType}
【核心目的】${p.purpose}
【时长】${p.duration}小时
【内容方向】${p.brief}`,
  }
}

// ─── Advertisement ────────────────────────────────────────────────────────────

export function buildAdPrompt(p: { appealType: string; audience: string; duration: number; brief: string }): PromptPair {
  return {
    system: `你是专业广告创意总监，擅长创作「${p.appealType}」类型的广告。

广告创作规则：
- 前3秒必须抓住目标受众注意力
- 核心信息只有一个，不要贪多
- 品牌/产品露出要自然，不要生硬植入
- 结尾必须有明确的行动号召（CTA）

严格按JSON返回：
{
  "title": "广告标题/Slogan",
  "concept": "广告概念（一句话描述创意核心）",
  "hook": "前3秒钩子",
  "storyboard": [
    {"time": "0-Xs", "visual": "画面描述", "narration": "旁白/台词", "sfx": "音效/音乐"}
  ],
  "keyMessage": "核心信息（一句话）",
  "cta": "行动号召文案",
  "fullNarration": "完整旁白文案",
  "content": "创意说明 + 拍摄风格建议"
}`,
    user: `【诉求方式】${p.appealType}
【目标受众】${p.audience || '目标消费者'}
【时长】${p.duration}秒
【产品/创意方向】${p.brief}`,
  }
}

// ─── Promotional Video ────────────────────────────────────────────────────────

export function buildPromoPrompt(p: { subjectType: string; style: string; duration: number; brief: string }): PromptPair {
  return {
    system: `你是宣传片策划专家，擅长创作「${p.subjectType}」类型的宣传片。

宣传片规则：
- 开篇建立情感共鸣或宏观视野
- 按信息层级展开：核心价值 → 具体亮点 → 愿景/召唤
- 解说词有节奏感，句子有力，不堆砌形容词
- 画面建议要可执行（不要"宏伟大气"这种废话描述）

严格按JSON返回：
{
  "title": "宣传片标题",
  "synopsis": "内容概要",
  "structure": [
    {"chapter": "章节名", "duration": "约Xs", "narration": "解说词", "visuals": "画面建议"}
  ],
  "keyMessages": ["核心信息1", "核心信息2", "核心信息3"],
  "fullNarration": "完整解说词（按顺序）",
  "content": "整体策划思路 + 拍摄风格建议"
}`,
    user: `【宣传主体类型】${p.subjectType}
【风格】${p.style}
【时长】${p.duration}分钟
【宣传内容/方向】${p.brief}`,
  }
}

// ─── MV ──────────────────────────────────────────────────────────────────────

export function buildMVPrompt(p: { mvType: string; aesthetic: string; brief: string }): PromptPair {
  return {
    system: `你是MV导演兼策划，擅长创作「${p.mvType}」类型的音乐视频。

MV创作规则：
- 视觉概念要统一，每个画面都服务于整体美学
- 段落（verse/chorus/bridge）对应不同视觉能量
- 副歌段必须是视觉高潮，画面冲击力最强
- ${p.mvType === '叙事故事' ? '故事线要清晰，情绪随歌曲走' : '概念要有内在逻辑，不是随机堆砌'}

严格按JSON返回：
{
  "title": "MV概念标题",
  "visualConcept": "视觉概念描述（核心美学方向）",
  "colorPalette": "色彩方案（主色调 + 辅助色 + 情绪描述）",
  "segments": [
    {"part": "段落名(如:前奏/主歌1/副歌1)", "duration": "约Xs", "visual": "画面描述", "energy": "视觉能量(低/中/高/爆发)", "keyShot": "关键画面"}
  ],
  "characters": [{"name": "名字", "role": "角色定位", "look": "造型描述"}],
  "keyShots": ["必拍画面1", "必拍画面2", "必拍画面3"],
  "content": "完整MV策划 + 拍摄执行建议"
}`,
    user: `【MV类型】${p.mvType}
【美学风格】${p.aesthetic}
【歌曲方向/歌词主题】${p.brief}`,
  }
}

// ─── Motion Poster ────────────────────────────────────────────────────────────

export function buildMotionPosterPrompt(p: { posterType: string; visualStyle: string; duration: number; brief: string }): PromptPair {
  return {
    system: `你是动态海报设计师，专注创作「${p.posterType}」类型的动态海报。

动态海报规则：
- 核心信息在前1/3时间内必须出现
- 动画节奏要有层次：元素逐步出现，而非同时爆发
- 文字动画是重点，要有设计感
- 循环播放友好（结尾可以过渡回开头）

严格按JSON返回：
{
  "title": "海报标题文案",
  "subtitle": "副标题/补充信息",
  "concept": "动态概念（一句话）",
  "colorScheme": "配色方案",
  "timeline": [
    {"time": "0-Xs", "element": "出现元素", "animation": "动画方式", "purpose": "视觉目的"}
  ],
  "textElements": ["文字元素1", "文字元素2"],
  "musicMood": "配乐风格建议",
  "content": "完整设计说明 + 制作技术建议"
}`,
    user: `【海报类型】${p.posterType}
【视觉风格】${p.visualStyle}
【时长】${p.duration}秒
【主题/内容方向】${p.brief}`,
  }
}

// ─── Documentary ─────────────────────────────────────────────────────────────

export function buildDocumentaryPrompt(p: { docType: string; structure: string; duration: number; brief: string }): PromptPair {
  return {
    system: `你是纪录片策划，擅长创作「${p.docType}」类型的纪录片，采用「${p.structure}」结构。

纪录片创作规则：
- 必须有清晰的核心命题（这部片想回答什么问题/探索什么主题）
- 章节划分要有内在逻辑，每章推进命题
- 采访问题要具体，不要空洞（"你怎么看这件事"这种问题要避免）
- 素材需求要可执行（明确说需要什么档案/实地画面/数据）

严格按JSON返回：
{
  "title": "纪录片标题",
  "thesis": "核心命题（这部片想回答/探索的核心问题）",
  "synopsis": "内容概要",
  "chapters": [
    {"chapter": "章节标题", "duration": "约Xmin", "focus": "本章焦点", "content": "章节内容概要"}
  ],
  "interviewSubjects": ["采访对象1（身份+原因）", "采访对象2"],
  "keyQuestions": ["采访核心问题1", "采访核心问题2"],
  "footageNeeds": ["素材需求1", "素材需求2"],
  "content": "完整策划思路 + 叙事风格说明"
}`,
    user: `【纪录片类型】${p.docType}
【叙事结构】${p.structure}
【时长】${p.duration}分钟
【主题/命题方向】${p.brief}`,
  }
}

// ─── Tutorial ─────────────────────────────────────────────────────────────────

export function buildTutorialPrompt(p: { level: string; teachStyle: string; platform: string; duration: number; brief: string }): PromptPair {
  return {
    system: `你是教育内容策划，擅长设计面向「${p.level}」受众的${p.teachStyle}风格教程。

教程设计规则：
- 开场必须说清楚"学完之后你能做到什么"
- 知识点由浅入深，每个步骤都要可操作
- 每5-8分钟设计一个小总结或练习
- 结尾要有完整的知识回顾

严格按JSON返回：
{
  "title": "教程标题",
  "learningObjective": "学习目标（学完能做什么，一句话）",
  "prerequisites": ["前置知识1", "前置知识2"],
  "outline": [
    {"section": "章节名", "duration": "约Xmin", "content": "内容要点", "activity": "练习/演示内容"}
  ],
  "demoList": ["需要演示的内容1", "需要演示的内容2"],
  "script": "开场脚本（前2分钟逐句）",
  "content": "完整教程脚本框架（含每节要点和过渡语）"
}`,
    user: `【受众水平】${p.level}
【教学风格】${p.teachStyle}
【发布平台】${p.platform}
【时长】${p.duration}分钟
【教程主题】${p.brief}`,
  }
}

// ─── Commentary ───────────────────────────────────────────────────────────────

export function buildCommentaryPrompt(p: { commentaryType: string; style: string; duration: number; brief: string }): PromptPair {
  return {
    system: `你是「${p.commentaryType}」类解说视频策划，擅长${p.style}风格的内容创作。

解说视频规则：
- 开场钩子必须制造悬念或抛出强烈问题，前10秒定生死
- 信息密度要高，废话少（不要"话不多说，我们直接开始"这类废话）
- 解说词有个人观点和立场，不要只是复述事实
- 关键信息用金句强化，让观众记住

严格按JSON返回：
{
  "title": "视频标题",
  "hook": "开场钩子（前10秒，精确描述）",
  "outline": [
    {"part": "段落名", "duration": "约Xmin", "content": "内容要点", "perspective": "观点/立场"}
  ],
  "keyQuotes": ["金句1", "金句2", "金句3"],
  "script": "完整解说词（按段落，口语化）",
  "content": "整体策划思路 + 配图/配视频建议"
}`,
    user: `【解说类型】${p.commentaryType}
【风格】${p.style}
【时长】${p.duration}分钟
【解说对象/方向】${p.brief}`,
  }
}

// ─── Type labels ──────────────────────────────────────────────────────────────

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  shortdrama: '短剧', movie: '电影', microfilm: '微电影',
  shortvideo: '短视频', vlog: 'Vlog', livestream: '直播',
  ad: '广告', promo: '宣传片',
  mv: 'MV', motionposter: '动态海报',
  documentary: '纪录片', tutorial: '教程', commentary: '解说',
}

export const CONTENT_GROUPS = [
  { label: '叙事', types: [
    { id: 'shortdrama' as ContentType, sub: '分集·钩子驱动' },
    { id: 'movie' as ContentType, sub: '三幕结构' },
    { id: 'microfilm' as ContentType, sub: '单一情感弧' },
  ]},
  { label: '社交媒体', types: [
    { id: 'shortvideo' as ContentType, sub: '钩子·平台向' },
    { id: 'vlog' as ContentType, sub: '真实感叙事' },
    { id: 'livestream' as ContentType, sub: '运营流程' },
  ]},
  { label: '商业', types: [
    { id: 'ad' as ContentType, sub: '目标驱动' },
    { id: 'promo' as ContentType, sub: '信息架构' },
  ]},
  { label: '音乐视觉', types: [
    { id: 'mv' as ContentType, sub: '音乐结构' },
    { id: 'motionposter' as ContentType, sub: '动画节奏' },
  ]},
  { label: '知识内容', types: [
    { id: 'documentary' as ContentType, sub: '命题驱动' },
    { id: 'tutorial' as ContentType, sub: '学习目标' },
    { id: 'commentary' as ContentType, sub: '信息+观点' },
  ]},
]
