# agent.md — Agent Team 开发协作指南

本文档用于帮助后续开发者与 AI Agent 快速理解 **Agent Team** 项目结构、运行方式与常见开发约定。

## 1. 项目定位

Agent Team 是一个“多 Agent 控制台 + 赛博像素办公模拟器”项目：

- 前端负责管理界面、终端 UI 和像素场景渲染。
- 后端提供 Agent/Task/模板等 REST API，并通过 WebSocket 推送任务状态与输出。
- PTY 服务负责终端桥接（`node-pty`），支持交互式命令行体验。

## 2. 目录总览

- `frontend/`：React + TypeScript + Vite + PixiJS 前端。
- `backend/AgentTeam.Api/`：ASP.NET Core Web API（SQLite 持久化、WebSocket 管理、Claude 任务编排）。
- `pty-server/`：Node.js + `ws` + `node-pty` 的 PTY 桥接服务。
- `screenshot/`：README 展示截图。
- 根目录启动脚本：`start-all.bat`、`run-backend.bat`、`run-frontend.bat`、`run-pty.bat`。

## 3. 技术栈

- 前端：React、TypeScript、Vite、Ant Design、PixiJS、xterm.js。
- 后端：.NET（ASP.NET Core）、Entity Framework Core、SQLite。
- 终端桥接：Node.js、WebSocket、node-pty。
- 通信模式：REST + WebSocket（后端任务输出流式推送）。

## 4. 本地开发启动

## 4.1 前置条件

- Node.js >= 18
- .NET SDK >= 10
- 已安装并登录可用的 Claude CLI（若要真实执行 Agent 任务）

## 4.2 一键启动（Windows）

在仓库根目录执行：

```bat
start-all.bat
```

默认访问：

- 前端：`http://localhost:5502`
- 后端：`http://localhost:5501`

## 4.3 分服务启动（跨平台建议）

### 前端

```bash
cd frontend
npm install
npm run dev
```

### 后端

```bash
cd backend/AgentTeam.Api
dotnet restore
dotnet run
```

### PTY 服务

```bash
cd pty-server
npm install
npm run dev
```

## 5. 关键运行机制

### 5.1 后端数据与文件

后端启动时会自动创建：

- `backend/AgentTeam.Api/data/agent-team.db`（SQLite）
- `backend/AgentTeam.Api/data/outputs/`（任务输出）
- `backend/AgentTeam.Api/data/sessions/`（会话数据）

### 5.2 WebSocket 路由

任务流式输出 WebSocket 路由：

- `ws://<host>/ws/task/{taskId}`

后端会将任务输出与状态变化广播到对应 task channel。

### 5.3 CORS（开发环境）

后端默认允许以下前端开发源：

- `http://localhost:5502`
- `http://localhost:5173`
- `http://localhost:3000`

## 6. 开发建议（给后续 Agent）

1. **优先小步迭代**：一次只改一个模块（例如仅改 API 或仅改 UI），减少联调复杂度。
2. **先接口后交互**：新增前端功能前，先确认后端 DTO 与返回字段。
3. **保持事件一致性**：任务输出/状态字段变更时，前后端与 WebSocket 消息结构要同步。
4. **避免破坏默认端口**：除非有充分理由，保持 5501/5502 与现有脚本一致。
5. **提交前检查**：至少执行一次前端构建或 lint，以及后端构建，确保主干可运行。
6. **文件编码与 TypeScript 类型导入规范**:
   - **统一编码格式**：所有新创建或修改的正文文件应确保使用 **UTF-8** 编码，避免使用 PowerShell 默认的 UTF-16 编码，以免导致 Vite 或浏览器在解析 ESM 模块导出时报错（如 `SyntaxError`）。
   - **规范导入方式**：在导入 TypeScript 纯类型或接口（如 `GitStatusInfo`）时，应优先使用 `import type { ... }` 语法。这符合现代 TypeScript 的 `isolatedModules` 规范，能确保类型信息在编译后被完全剔除，避免在浏览器运行时出现找不到导出的错误。
7. **JSX 结构与嵌套检查**：在 React 组件（如 `Simulation.tsx`）中添加大型组件或抽屉（Drawer）时，务必仔细检查 `div` 标签的闭合情况。避免在插入代码时冗余闭合标签，导致父级容器提前关闭，进而引发类似 `PARSE_ERROR` 的解析错误。建议在插入大块 JSX 代码后，仔细核对层级缩进。
8. **数据库变更注意事项**：如果后端修改了 `Models`（实体类）中的数据库结构，**必须**同步执行 Entity Framework 的 `Migrations` 流程。在 `backend/AgentTeam.Api` 目录下运行 `dotnet ef migrations add <Name>` 生成迁移文件。否则，由于后端启动时会执行 `dbCtx.Database.Migrate()`，若检测到模型有挂起的更改却没有迁移记录，程序将抛出 `InvalidOperationException` 并崩溃。

## 7. 常用命令速查

### 前端

```bash
cd frontend
npm run dev
npm run build
npm run lint
```

### 后端

```bash
cd backend/AgentTeam.Api
dotnet run
dotnet build

### 数据库迁移 (如有模型修改)
dotnet ef migrations add <MigrationName>
```

### PTY

```bash
cd pty-server
npm run dev
npm run start
```

---

如果后续需要扩展本文件，建议新增章节：

- API 约定与错误码
- 前端状态管理（store）说明
- 任务生命周期时序图
- 发布与部署流程
