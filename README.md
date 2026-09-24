<p align="center">
  <img src="./public/icon.svg" width="96" height="96" alt="AI 画布工作台 Logo" />
</p>

<h1 align="center">AI 画布工作台</h1>

<p align="center">
  面向短剧、影视、短视频与视觉内容创作的节点式 AI 工作流平台。
</p>

<p align="center">
  <a href="https://github.com/ShiyouQi888/AI-huabu-qishiyou"><img alt="Repository" src="https://img.shields.io/badge/GitHub-AI--huabu--qishiyou-181717?logo=github" /></a>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" />
  <img alt="React" src="https://img.shields.io/badge/React-19-149ECA?logo=react" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript" />
  <img alt="React Flow" src="https://img.shields.io/badge/React%20Flow-12-ff0072" />
</p>

<p align="center">
  <strong>个人学习项目 · 禁止未经授权的商业使用</strong>
</p>

---

## 项目简介

AI 画布工作台将剧本、资产、分镜、图像、视频、音频和设计方案统一到一张可视化画布中。用户可以通过拖拽节点、连接上下游数据、复用素材和切换模型，搭建适合自己的 AI 内容生产流程。

项目重点解决以下创作问题：

- 将一句创意扩展为长篇剧本、故事世界观、分集大纲和分镜表。
- 将角色、场景、道具等全剧资产结构化，并在后续分镜中持续复用。
- 将文本、图片、视频、音频生成能力组织成可复用的节点式工作流。
- 支持图片区域编辑、分层编辑和局部提示词创作。
- 支持个人项目与团队项目两种工作空间，并提供团队成员和项目编辑权限管理。

> 本项目当前定位为个人学习与研究用途，底层存储默认采用本地文件，适合本地开发和单机部署。生产环境部署前应替换为可靠的数据库、对象存储、密钥管理和任务队列方案。

## 功能总览

### 1. 节点式 AI 画布

- 拖拽节点、移动画布、缩放画布、适应画布。
- 节点之间通过连线传递文本、图片、视频、音频和结构化内容。
- 支持框选、多选、复制、删除、撤销、重做和节点分组。
- 节点从空画布创建时自动计算位置，避免新节点重叠，并支持画布自适应。
- 项目自动保存，保存状态会在项目侧边栏中显示。
- 支持个人作用域和团队作用域，项目列表采用轻量加载，画布快照在打开项目时按需读取。

### 2. 内容创作节点

| 节点 | 用途 |
| --- | --- |
| AI 文本 | 生成、改写、扩写、总结和结构化文本 |
| AI 编剧 | 根据内容类型生成创作方案、故事圣经、长篇剧本和分集规划 |
| AI 剧本 | 解析完整剧本，提取角色、场景、道具并规划分镜 |
| 分镜表 | 管理镜头、画面、动作、对白、时长、运镜和参考素材 |
| 剧集列表 | 管理短剧分集大纲，支持按集生成分镜，适合 20 集以上长内容 |
| 场景描述 | 将创意转化为场景、画面和视觉描述 |
| 提示词助手 | 对生成提示词进行整理、优化和扩写 |
| AI 生图 | 根据文本和参考素材生成图片 |
| 图片分层 | 对图片进行区域框选、标注、局部提示词和分层编辑 |
| AI 视频 | 支持文生视频、参考素材、首尾帧和视频延长等工作流 |
| AI 音频 | 支持文生语音、语音克隆和歌曲生成 |
| AI 平面 | 根据设计目标生成海报、电商主图、Banner 等平面方案 |
| 上传文件 | 将本地图片、视频、音频接入画布 |
| 素材库选择 | 从个人或团队素材库复用已有素材 |

### 3. AI 编剧与长剧本工作流

AI 编剧不是单次返回一段文本，而是将长内容拆为多个阶段：

1. 选择内容类型，如短剧、电影、短视频、广告、MV、纪录片或教程。
2. 生成创作方案和故事世界观。
3. 生成角色、场景、道具等贯穿全篇的资产信息。
4. 按章节或分集生成大纲，避免单次请求超过模型上下文和输出限制。
5. 生成完整剧本或分镜表。
6. 将资产、剧集和分镜自动创建为可继续编辑的节点。

分批生成机制可以降低长文本截断风险，也便于失败重试、局部重生成和后续修改。

### 4. 图片区域与分层编辑

图片分层节点提供面向局部编辑的交互能力：

- 在原图上框选需要修改的区域。
- 为每个区域添加编号和局部提示词。
- 支持点击图片、点击节点外部或切换操作后取消当前选区。
- 选区提示词与区域保持关联，便于生成局部编辑结果。
- 可将图片、区域标注和编辑描述继续传递给下游生成节点。

### 5. 音频能力

音频节点包含三种工作模式：

- **文生语音**：输入旁白、对白或提示音文本，选择音色、语速并生成语音。
- **语音克隆**：上传声音样本或使用已配置的克隆音色，生成保持音色特征的语音。
- **歌曲**：调用 Suno API 兼容服务生成歌曲，并将结果回传到节点和素材流中。

音频参考节点同时支持上传本地音频和从素材库选择，适用于全能参考、音频分析和视频生成。

## 团队功能

团队功能用于在多个账号之间共享成员关系、素材和项目。入口位于画布右下角的「团队」按钮。

### 团队生命周期

- 创建团队并自动成为团队拥有者。
- 通过用户名邀请成员。
- 生成邀请码，其他用户可以使用邀请码加入团队。
- 查看团队成员、角色和加入时间。
- 拥有者和管理员可以邀请成员。
- 拥有者可以调整成员角色。
- 拥有者和管理员可以按权限移除成员。
- 普通成员可以主动退出团队。
- 只有拥有者可以解散团队。

### 团队角色

| 角色 | 权限 |
| --- | --- |
| 拥有者 | 管理团队全部设置、调整成员角色、删除团队、管理团队成员 |
| 管理员 | 邀请成员、管理普通成员、参与团队协作 |
| 成员 | 访问所属团队资源，按照项目编辑权限参与创作 |

成员角色和项目编辑权限是两套独立控制：成为团队成员不代表可以编辑团队中的每一个项目。

## 团队项目功能

### 个人项目与团队项目

项目侧边栏支持在以下作用域之间切换：

- **个人**：项目只属于当前用户，当前用户拥有完整编辑权限。
- **团队**：项目保存在团队作用域内，团队成员可以查看，具体编辑能力由项目编辑成员列表控制。

### 团队项目操作

- 在团队作用域下新建团队项目。
- 将个人项目转换为团队项目。
- 复制项目，保留画布节点、连线和生成配置。
- 重命名、删除和切换项目。
- 为团队项目设置多个可编辑成员。
- 将编辑权限取消、增加或转让给指定成员。
- 无编辑权限的成员以只读状态打开项目，不能覆盖团队项目内容。
- 团队项目和个人项目都支持自动保存、保存状态提示和失败重试。
- 团队素材库按团队作用域隔离，避免不同团队之间互相读取资产。

### 项目编辑权限模型

团队项目默认由创建者拥有编辑权限。项目编辑成员可以：

- 修改画布节点和连线。
- 修改项目名称。
- 触发保存和更新项目快照。
- 管理该团队项目的编辑成员。

未被授权的团队成员仍可查看项目列表和项目内容，但会显示「只读」状态，服务端也会在写入接口再次校验权限。

### 团队协作边界

当前团队项目是「共享项目 + 权限控制」模型，并不是实时多人协同编辑器：

- 支持共享项目、权限管理和自动保存。
- 暂不提供多人同时编辑时的实时光标、操作广播或 CRDT 冲突合并。
- 多人同时编辑同一项目时，建议由一个可编辑成员负责保存，或按节点/分镜阶段分工。

## 支持的模型与服务

项目通过统一 AI 适配层连接多个服务商。实际可用模型由环境变量和服务商账号权限共同决定。

| 服务商 | 能力 | 配置变量 |
| --- | --- | --- |
| OpenAI | 文本、图像 | `OPENAI_API_KEY` |
| DeepSeek | 文本、长内容策划 | `DEEPSEEK_API_KEY` |
| 阿里 DashScope | 通义千问、通义万相、语音 | `DASHSCOPE_API_KEY` |
| Moonshot / Kimi | 文本、代码和长上下文任务 | `MOONSHOT_API_KEY` |
| 火山引擎 / 字节方舟 | Seedance、Seedream 等图像和视频能力 | `ARK_API_KEY` |
| 火山引擎语音 | 文生语音、语音克隆 | `VOLCENGINE_TTS_API_KEY` |
| 智谱 | GLM、CogView、CogVideo | `ZHIPU_API_KEY` |
| Suno API 兼容服务 | 歌曲生成 | `SUNO_API_KEY` |

> Suno 歌曲能力使用 [docs.sunoapi.org](https://docs.sunoapi.org/) 对应的 API 服务，不等同于 Suno.com 官方一方 API。请根据服务商协议、地区政策和账户权限使用。

## 快速开始

### 环境要求

- Node.js `>= 20.9.0`
- pnpm `8+` 或兼容的 npm / yarn
- 至少一个可用的 AI 服务商 API Key
- 如果启用注册验证或找回密码，需要可用的 SMTP 服务

### 安装

```bash
git clone https://github.com/ShiyouQi888/AI-huabu-qishiyou.git
cd AI-huabu-qishiyou
pnpm install
```

### 配置环境变量

复制环境变量模板：

```bash
cp .env.example .env.local
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env.local
```

然后编辑 `.env.local`，至少配置一个文本模型 Key，以及生产环境必须修改的 `JWT_SECRET`。

### 启动开发服务

```bash
pnpm dev
```

打开 <http://localhost:3000>，注册或登录后进入画布。

### 生产构建

```bash
pnpm build
pnpm start
```

## 环境变量

完整模板见 [`.env.example`](./.env.example)。

### AI 服务

| 变量 | 说明 | 要求 |
| --- | --- | :---: |
| `OPENAI_API_KEY` | OpenAI 文本与图像能力 | 可选 |
| `DEEPSEEK_API_KEY` | DeepSeek 文本能力 | 可选 |
| `DASHSCOPE_API_KEY` | 阿里 DashScope 能力 | 可选 |
| `MOONSHOT_API_KEY` | Moonshot / Kimi 能力 | 可选 |
| `ARK_API_KEY` | 火山引擎方舟图像和视频能力 | 可选 |
| `VOLCENGINE_TTS_API_KEY` | 火山引擎语音 API Key | 使用语音时需要 |
| `VOLCENGINE_TTS_RESOURCE_ID` | 文生语音资源，默认 `seed-tts-2.0` | 可选 |
| `VOLCENGINE_TTS_CLONE_RESOURCE_ID` | 语音克隆资源，默认 `seed-icl-2.0` | 使用克隆时需要 |
| `ZHIPU_API_KEY` | 智谱模型能力 | 可选 |
| `SUNO_API_KEY` | Suno API 兼容服务 Key | 使用歌曲节点时需要 |
| `SUNO_API_BASE_URL` | Suno API 服务地址，默认 `https://api.sunoapi.org` | 可选 |

至少配置一个文本模型 Key 才能运行主要 AI 创作流程。

### 账户与邮件

| 变量 | 说明 |
| --- | --- |
| `JWT_SECRET` | JWT 签名密钥，生产环境必须修改为随机长字符串 |
| `SMTP_HOST` | SMTP 服务器地址 |
| `SMTP_PORT` | SMTP 端口，常用 `587` 或 `465` |
| `SMTP_SECURE` | 是否使用 TLS，按邮件服务商要求配置 |
| `SMTP_USER` | SMTP 登录账号 |
| `SMTP_PASS` | SMTP 密码或应用专用密码 |
| `SMTP_FROM` | 发件人地址，留空时使用 `SMTP_USER` |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |
| `NEXTAUTH_URL` | OAuth 回调使用的站点地址 |

未配置 `SMTP_USER` 和 `SMTP_PASS` 时，注册流程不会强制邮件验证，但找回密码功能不可用。

### 上传与运行参数

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `NEXT_PUBLIC_MAX_UPLOAD_SIZE` | 单文件上传上限，单位为字节 | `104857600`（100 MB） |

## 常用快捷键

| 操作 | 快捷键 |
| --- | --- |
| 框选节点 | `Ctrl/⌘` + 拖拽 |
| 加选或多选 | `Ctrl/⌘` + 点击 |
| 节点打组 | `Ctrl/⌘` + `G` |
| 复制选中节点 | `Ctrl/⌘` + `D` |
| 删除选中节点或连线 | `Delete` |
| 撤销 | `Ctrl/⌘` + `Z` |
| 重做 | `Ctrl/⌘` + `Shift` + `Z` |
| 适应画布 | `Ctrl/⌘` + `0` |
| 打开帮助 | `?` 或 `F1` |

## API 概览

API 使用当前登录用户的 JWT Cookie 进行鉴权。主要接口如下：

### 账户

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/auth/register` | 注册账号 |
| `POST` | `/api/auth/login` | 用户名或邮箱登录 |
| `POST` | `/api/auth/logout` | 注销登录 |
| `GET` | `/api/auth/me` | 获取当前用户 |
| `POST` | `/api/auth/send-code` | 发送邮箱验证码 |
| `POST` | `/api/auth/reset-password` | 找回并重置密码 |
| `GET` | `/api/auth/google` | 发起 Google OAuth 登录 |

### 团队

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/teams` | 获取当前用户所属团队 |
| `POST` | `/api/teams` | 创建团队 |
| `POST` | `/api/teams/join` | 使用邀请码加入团队 |
| `GET` | `/api/teams/:id` | 获取团队详情 |
| `PATCH` | `/api/teams/:id` | 重命名团队 |
| `DELETE` | `/api/teams/:id` | 解散团队，仅拥有者可用 |
| `POST` | `/api/teams/:id/members` | 邀请成员 |
| `PATCH` | `/api/teams/:id/members` | 调整成员角色 |
| `DELETE` | `/api/teams/:id/members` | 移除成员或退出团队 |

### 项目与资产

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/projects?scope=personal` | 获取个人项目列表 |
| `GET` | `/api/projects?scope=team-xxx` | 获取团队项目列表 |
| `POST` | `/api/projects` | 创建或保存项目快照 |
| `GET` | `/api/projects/:id` | 加载项目完整快照 |
| `PATCH` | `/api/projects/:id` | 修改项目名称或快照 |
| `DELETE` | `/api/projects/:id` | 删除项目 |
| `PATCH` | `/api/projects/:id/editors` | 管理团队项目编辑成员 |
| `GET/POST/DELETE` | `/api/materials` | 访问当前作用域素材库 |

团队作用域由服务端校验成员身份，项目写入接口会额外校验 `editors` 编辑成员列表，不能只依赖前端的只读状态。

## 技术架构

### 技术栈

- **Web 框架**：Next.js 16 App Router + Turbopack
- **UI**：React 19、Tailwind CSS 4、Radix UI、Lucide React
- **画布**：`@xyflow/react` 12
- **状态管理**：Zustand 5，包含持久化、撤销/重做和项目快照同步
- **语言**：TypeScript 5
- **鉴权**：JWT、`jsonwebtoken`、`bcryptjs`、HTTP-only Cookie
- **邮件**：Nodemailer
- **AI 服务**：统一服务适配层，按 provider 选择模型和能力
- **校验**：Zod

### 目录结构

```text
app/
  api/                         # 鉴权、团队、项目、素材与生成接口
  login/ register/ settings/   # 账户与设置页面
components/
  ai-canvas.tsx                # React Flow 画布入口
  project-sidebar.tsx          # 个人/团队项目侧边栏
  team-dialog.tsx              # 团队管理弹窗
  nodes/                       # 文本、剧本、分镜、图像、视频、音频等节点
  custom-cursor.tsx            # 全局品牌鼠标指针
lib/
  store.ts                     # 画布状态、节点和连线
  project-store.ts             # 项目列表、作用域和自动保存
  project-access.ts            # 项目快照与编辑权限
  teams.ts                     # 团队、成员和角色数据层
  services/ai/                 # AI 服务商适配与模型配置
proxy.ts                       # 登录路由守卫
public/
  icon.svg                     # 项目 Logo
data/                          # 本地运行时数据，生产环境请使用安全存储
```

### 数据存储说明

默认实现使用项目目录下的文件进行本地持久化：

- `data/users.json`：用户信息。
- `data/teams.json`：团队、成员、角色和邀请码。
- `data/projects/{scope}.json`：个人或团队项目及画布快照。
- `data/materials/{scope}.json`：个人或团队素材索引。
- `public/uploads/`：本地上传文件。

这些文件适合个人学习和本地演示，不适合多实例部署、强一致协作或高并发生产服务。正式部署时建议迁移到数据库和对象存储，并增加备份、审计、访问控制和密钥轮换。

## 开发脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动 Next.js 开发服务器 |
| `pnpm build` | 执行生产构建 |
| `pnpm start` | 启动生产服务器 |
| `pnpm lint` | 执行 ESLint 检查 |
| `pnpm exec tsc --noEmit` | 执行 TypeScript 类型检查 |

## 安全与部署建议

- 不要提交 `.env`、`.env.local` 或任何真实 API Key。
- 生产环境必须将 `JWT_SECRET` 替换为高强度随机字符串。
- OAuth 回调地址、Cookie 安全属性和站点域名必须按生产域名配置。
- API Key 应只在服务端使用，不能暴露到客户端组件或 `NEXT_PUBLIC_*` 变量中。
- 邮箱服务请使用应用专用密码，不要使用个人邮箱登录密码。
- 上传文件需要配置大小、类型、文件名和访问权限校验。
- 生产环境不要直接使用本地 JSON 文件作为多用户数据源。
- 对团队成员管理、项目写入和素材访问保留服务端鉴权，不能只依赖前端 UI 隐藏按钮。

## 许可与版权声明

### 个人学习非商业许可

Copyright © 2026 AI 画布工作台作者。保留所有权利。

本仓库及其中的源代码、界面设计、Logo、文案、节点交互和相关资源，采用**个人学习非商业许可**，而不是 MIT、Apache-2.0 或其他开放源代码许可证。

在遵守以下条款的前提下，允许个人：

- 克隆、阅读和运行本项目。
- 为个人学习、研究、技术验证和非商业实验修改代码。
- 在不公开分发完整源代码的前提下，在个人本地环境中使用修改后的版本。

未经书面授权，禁止：

- 任何直接或间接的商业使用，包括收费软件、SaaS、代运营、商业项目、企业内部商业生产和付费服务。
- 将本项目或其衍生版本作为产品、模板、课程、插件、服务或商业解决方案发布、销售、出租或提供给第三方。
- 复制、转载、镜像、再分发本仓库或其中的大部分源代码。
- 移除、替换或伪造项目 Logo、版权声明、作者信息和许可说明。
- 将本项目包装成其他品牌、产品或服务，对外宣称拥有本项目的完整版权。

### 商业授权

如需商业使用、企业部署、二次开发交付、SaaS 集成、品牌定制、代码再分发或其他超出个人学习范围的用途，请先取得书面授权。

商业授权咨询：**shijuebaba@qq.com**

授权范围、期限、地域、部署方式、源码权限和费用，以双方书面协议为准。未收到明确书面授权前，不得推定获得任何商业使用权。

本项目依赖的第三方库、模型服务和 API 仍分别受其原始许可证、服务条款和计费政策约束；本声明不授予任何第三方服务的额外权利。

## 致谢

- [Next.js](https://nextjs.org/)
- [React](https://react.dev/)
- [React Flow](https://reactflow.dev/)
- [Zustand](https://zustand.docs.pmnd.rs/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Lucide](https://lucide.dev/)

如发现安全问题或授权问题，请通过上面的邮箱联系项目作者，不要在公开 Issue 中披露敏感信息。
