# 🎨 AI 画布工作台 · qishiyou-huabu

> 节点式 AI 创作工作流平台 — 把**剧本、分镜、图像、视频、音频**串成一张可视化画布，一站式完成短剧 / 影视 / 短视频的 AI 创作。

<p>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" />
  <img alt="React" src="https://img.shields.io/badge/React-19-149ECA?logo=react" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript" />
  <img alt="ReactFlow" src="https://img.shields.io/badge/@xyflow/react-12-ff0072" />
</p>

---

## ✨ 功能特性

### 🧭 节点式画布
- 拖拽 / 连线 组织创作流程，上游节点的输出自动作为下游节点的上下文
- 平移、缩放、框选、撤销 / 重做、快捷键
- **节点打组**：框选后右键「打组」，或直接把节点拖入分组容器；容器可命名、缩放、解组，随画布保存

### ✍️ AI 编剧（13 种内容类型）
针对不同内容类型提供**专业化的策划逻辑**，而非千篇一律：

| 分类 | 类型 |
| --- | --- |
| 叙事 | 短剧 · 电影 · 微电影 |
| 社交媒体 | 短视频 · Vlog · 直播 |
| 商业 | 广告 · 宣传片 |
| 音乐视觉 | MV · 动态海报 |
| 知识内容 | 纪录片 · 教程 · 解说 |

### 🎬 短剧分集分镜工作流
**剧本 → 提取全剧资产 + 生成剧集列表 → 逐集生成分镜**

- 角色 / 场景 / 道具 自动创建为节点并在各集之间复用
- 剧集列表按需生成：点击某一集才生成该集的完整分镜，节省时间与算力
- 每集分镜自动关联到所用的角色与场景节点
- 分集大纲**分批生成**，支持 20+ 集

### 🖼️ AI 生成
- 文本 / 图像 / 视频 / 音频 生成节点
- AI 平面设计（创意方案 → 成图）
- 提示词助手

### 👤 账户与项目
- 多用户账户：用户名密码 / 邮箱验证码 / Google 登录
- 项目管理、素材库

---

## 🧩 支持的模型服务商

| 服务商 | 能力示例 |
| --- | --- |
| **OpenAI** | GPT-4o · DALL·E 3 · o4-mini |
| **DeepSeek** | DeepSeek V4 Pro / Flash |
| **通义千问 / 万相**（阿里 DashScope） | Qwen3 · 通义万相 2.1 · CosyVoice 2 |
| **Kimi**（Moonshot） | moonshot-v1 系列 |
| **火山引擎 · 即梦**（字节 Ark） | Seedance 2.0 · Seedream 4.5 |
| **智谱 GLM** | GLM-4 · CogView-4 · CogVideoX |

> 只需配置**至少一个**服务商的 API Key 即可开始使用。

---

## 🚀 快速开始

### 环境要求
- Node.js **18.18+**（推荐 20+）
- npm / pnpm / yarn

### 1. 克隆与安装
```bash
git clone https://github.com/Shiyou-Qi/qishiyou-huabu-2026.git
cd qishiyou-huabu-2026
npm install
```

### 2. 配置环境变量
复制模板为本地文件并填入你自己的 Key（`.env.local` 已被 `.gitignore` 忽略，不会提交）：
```bash
cp .env.example .env.local
```
至少填写一个文本模型的 Key（例如 `DEEPSEEK_API_KEY`）即可跑通主流程。完整变量与申请地址见 [`.env.example`](./.env.example)。

### 3. 启动开发服务器
```bash
npm run dev
```
打开 **http://localhost:3000**，注册账户后即可进入画布。

---

## ⚙️ 环境变量

| 变量 | 说明 | 必填 |
| --- | --- | :---: |
| `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` / `DASHSCOPE_API_KEY` / `MOONSHOT_API_KEY` / `ARK_API_KEY` / `ZHIPU_API_KEY` | 各服务商 API Key | 至少一个 |
| `JWT_SECRET` | 登录令牌签名密钥（**生产环境务必修改为随机长字符串**） | ✅ |
| `NEXT_PUBLIC_MAX_UPLOAD_SIZE` | 上传大小上限（字节，默认 100MB） | — |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | 注册邮箱验证码（不配置则注册免验证码） | — |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `NEXTAUTH_URL` | Google OAuth 登录 | — |

---

## ⌨️ 快捷键

| 操作 | 快捷键 |
| --- | --- |
| 框选节点 | `Ctrl/⌘` + 拖拽 |
| 加选 / 多选 | `Ctrl/⌘` + 点击 |
| 打组 | `Ctrl/⌘` + `G` |
| 复制选中节点 | `Ctrl/⌘` + `D` |
| 删除选中节点 / 连线 | `Delete` |
| 撤销 / 重做 | `Ctrl/⌘` + `Z` / `Shift` + `Z` |
| 适应画布 | `Ctrl/⌘` + `0` |
| 打开帮助 | `?` |

> 应用内点击右下角 **?** 按钮可查看完整的「使用指南 + 快捷键」。

---

## 🛠️ 技术栈

- **框架**：Next.js 16（App Router · Turbopack）+ React 19
- **画布引擎**：[@xyflow/react](https://reactflow.dev/)（ReactFlow）12
- **状态管理**：Zustand 5（含 persist 持久化 / 撤销重做）
- **样式**：Tailwind CSS 4
- **语言**：TypeScript
- **鉴权**：JWT（jsonwebtoken）+ bcryptjs，`proxy.ts` 路由守卫
- **邮件**：nodemailer

---

## 📁 项目结构

```
app/                    # Next.js App Router：页面 + API 路由
  api/                  #   生成接口 / 鉴权 / 项目 / 素材
  login · register …    #   账户相关页面
components/
  ai-canvas.tsx         # 画布主组件（ReactFlow 编排）
  nodes/                # 各类节点
    script-node         #   AI 编剧（13 种内容类型）
    screenplay-node     #   剧本
    episode-list-node   #   剧集列表（逐集生成分镜）
    storyboard-node     #   分镜表
    group-node          #   分组容器
    image / video / …   #   生成与素材节点
  help-dialog.tsx       # 帮助面板
lib/
  store.ts              # 画布状态（Zustand）
  services/ai/          # 多服务商 AI 适配层
  auth.ts               # 鉴权
proxy.ts                # 路由中间件（登录守卫，Next.js 16）
```

---

## 📜 脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 开发模式（Turbopack） |
| `npm run build` | 生产构建 |
| `npm start` | 生产运行 |
| `npm run lint` | 代码检查 |

---

## 🔒 安全提示

- 切勿把真实的 `.env` / `.env.local` 提交到仓库 —— 已在 `.gitignore` 中忽略
- **生产环境务必修改 `JWT_SECRET`** 为随机长字符串
- `data/` 目录保存用户账户与素材数据，默认不纳入版本控制

---

## 📄 版权声明 · Copyright

**© 2026 保留所有权利 · All Rights Reserved**

本项目为**私有项目**，仅供作者本人使用与查阅。

- 🚫 **禁止任何形式的复制、粘贴、转载、二次分发或商用**
- 🚫 未经作者书面授权，不得使用本项目的全部或部分代码

📧 **如有商业合作 / 授权需求，请联系作者：shijuebaba@qq.com**
