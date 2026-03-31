# 🤖 Agent Team — Claude Code 多 Agent 管理平台

一个集中管理多个 Claude Code 实例的 Web 控制台平台，支持实时流式输出、历史会话追踪、类微信聊天交互界面。

---

## ✨ 功能特性

- **多 Agent 管理**：统一配置并管理多个 Claude Code 实例，支持自定义工作目录、模型、系统提示词等参数
- **实时流式输出**：通过 `stream-json` 模式启动 Claude Code，借助 WebSocket 实时推送每一条 AI 响应到前端终端
- **聊天式控制台**：类微信气泡风格的对话界面，用户问题在右，AI 响应在左，附带打字机动态渲染效果
- **会话上下文追踪**：同一个 Claude 会话下的多轮追问在侧边栏聚合展示，支持通过 `--resume <session-id>` 续写上下文
- **图片分析支持**：输入框内可上传本地图片，路径自动附加到 Prompt 供 Claude 分析
- **自动滚动定位**：仅在发送新消息或切换任务时才触发底部滚动，不打扰历史记录浏览
- **任务历史回放**：重新进入任务时自动加载历史输出，不丢失任何对话记录
- **任务状态追踪**：实时监控 Running / Completed / Failed / Cancelled 各状态，附带 Token 用量统计

---

## 🏗️ 技术架构

```
agent-team/
├── backend/                  # 后端：ASP.NET Core Web API
│   └── AgentTeam.Api/
│       ├── Controllers/      # REST API 控制器
│       │   ├── AgentsController.cs   # Agent 增删改查
│       │   ├── TasksController.cs    # 任务管理与 WebSocket
│       │   ├── UploadController.cs   # 图片上传
│       │   └── StatsController.cs    # 统计数据
│       ├── Services/
│       │   ├── ClaudeCodeService.cs  # 核心：进程管理 + 流解析
│       │   └── OutputFileService.cs  # 输出日志落盘
│       ├── Models/           # 数据模型（Agent、AgentTask）
│       ├── Data/             # EF Core + SQLite 数据上下文
│       └── WebSockets/       # WebSocket 实时推送
│
├── frontend/                 # 前端：React + TypeScript + Vite
│   └── src/
│       ├── pages/
│       │   ├── Console/      # 聊天式任务控制台（核心页面）
│       │   ├── Agents/       # Agent 配置管理
│       │   ├── Dashboard/    # 数据概览仪表盘
│       │   └── History/      # 历史任务列表
│       ├── components/
│       │   └── Terminal/     # xterm.js 终端组件（含打字机效果）
│       ├── hooks/
│       │   ├── useTerminal.ts      # 终端实例管理（含 Buffer 机制）
│       │   └── useTaskWebSocket.ts # WebSocket 实时订阅
│       └── api/              # 封装后端 REST API 调用
│
├── start-all.bat             # 一键启动前端 + 后端
├── run-backend.bat           # 单独启动后端
└── run-frontend.bat          # 单独启动前端
```

### 后端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| ASP.NET Core | .NET 10 | Web API 框架 |
| Entity Framework Core | 10.x | ORM 数据访问 |
| SQLite | - | 本地轻量数据库 |
| System.Diagnostics.Process | - | Claude Code 子进程管理 |
| WebSocket (原生) | - | 实时输出推送 |

### 前端技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.x | UI 框架 |
| TypeScript | 5.x | 类型安全 |
| Vite | 5.x | 构建工具 |
| Ant Design | 5.x | UI 组件库 |
| xterm.js | 5.x | 终端模拟器 |
| WebSocket API | - | 实时数据订阅 |

---

## 🚀 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) >= 18
- [.NET SDK](https://dotnet.microsoft.com/) >= 10.0
- [Claude Code CLI](https://github.com/anthropics/claude-code) 已全局安装并完成登录

验证 Claude Code 是否已就绪：

```bash
claude --version
```

---

### 启动方式

**方式一：一键启动（推荐）**

```bat
:: 双击或在根目录运行
start-all.bat
```

这将同时在独立窗口启动前端（端口 5173）和后端（端口 5000）。

**方式二：分别启动**

```bat
:: 启动后端
run-backend.bat

:: 新开终端，启动前端
run-frontend.bat
```

**方式三：手动命令**

```bash
# 后端
cd backend/AgentTeam.Api
dotnet run

# 前端（新终端）
cd frontend
npm install
npm run dev
```

---

### 访问应用

启动成功后，浏览器打开：

- **前端控制台**：http://localhost:5173
- **后端 API**：http://localhost:5000

---

## 📖 使用指南

### 1. 配置 Agent

进入「Agents」页面，点击「新建 Agent」，填写：

| 字段 | 说明 | 示例 |
|------|------|------|
| 名称 | Agent 标识名称 | `代码助手` |
| 工作目录 | Claude Code 运行所在的项目目录 | `D:\MyProject` |
| 模型 | 使用的 Claude 模型 | `claude-opus-4-5` |
| 系统提示词 | 追加给 Claude 的全局指令 | `你是一个专注于 C# 的代码助手` |
| 最大轮次 | 单次任务最多执行多少轮工具调用 | `10` |

### 2. 发送任务

1. 在「Console」页面左侧选择 Agent
2. 在底部输入框填写你的指令
3. 点击「发送 [Ctrl+Enter]」或按 `Ctrl+Enter` 快捷键
4. 实时观察右侧终端中 Claude 的执行过程

### 3. 追问继续对话

- 选中左侧某个正在进行或已完成的会话
- 在底部继续输入问题后发送
- 新任务会携带 `--resume <session-id>` 在原有上下文中继续执行

### 4. 图片分析

- 点击输入框右侧的 🖼️ 图片按钮上传本地图片
- 图片路径会自动附加到 Prompt 中
- Claude Code 将读取并分析该图片

### 5. 终端操作

- **复制**：在终端中选中文字，按 `Ctrl+C`（或 Mac 上 `Cmd+C`）复制
- **清空**：点击终端右上角「清空」按钮
- **自适应**：内容高度随输出行数自动增减（最多 40 行）

---

## 🔌 API 接口说明

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/agents` | 获取所有 Agent |
| `POST` | `/api/agents` | 创建 Agent |
| `PUT` | `/api/agents/{id}` | 更新 Agent |
| `DELETE` | `/api/agents/{id}` | 删除 Agent |
| `GET` | `/api/tasks` | 获取任务列表 |
| `POST` | `/api/tasks` | 创建并启动任务 |
| `POST` | `/api/tasks/{id}/cancel` | 取消任务 |
| `DELETE` | `/api/tasks/{id}` | 删除任务 |
| `GET` | `/api/tasks/{id}/output` | 获取任务历史输出 |
| `WebSocket` | `/ws/tasks/{id}` | 订阅任务实时输出 |
| `POST` | `/api/upload` | 上传图片文件 |

---

## 📁 数据存储

- **数据库**：SQLite，文件位于 `backend/AgentTeam.Api/data/agentteam.db`
- **输出日志**：每个任务的原始输出保存于 `backend/AgentTeam.Api/data/outputs/{taskId}.log`
- **上传文件**：保存于 `backend/AgentTeam.Api/data/uploads/{yyyyMM}/{guid}.ext`

> 以上目录均已在 `.gitignore` 中排除，不会被提交至版本控制。

---

## 🎨 界面预览

**任务控制台（Console）**
- 左侧：Agent 选择 + 会话列表（按 Claude Session 聚合）
- 右侧：聊天气泡式对话流（用户问题 + AI 终端输出）
- 底部：输入框 + 图片上传 + 发送按钮

**设计风格**
- 深色主题（GitHub Dark 配色体系）
- 终端输出带 ANSI 颜色语法
- AI 响应有打字机逐字动效
- 发送后有等待动画反馈

---

## 🛠️ 开发说明

### 数据库迁移

```bash
cd backend/AgentTeam.Api
dotnet ef migrations add <MigrationName>
dotnet ef database update
```

### 前端依赖安装

```bash
cd frontend
npm install
```

### 环境配置

后端默认通过 `appsettings.Development.json` 配置日志级别，无需额外的 `.env` 文件。

---

## 📝 License

MIT
