# AI Agent 平台全站视觉设计规范 (UI/UX Specifications)

## 1. 核心设计语言 (Design System)

- **风格定位**: 极简主义、现代暗黑模式 (Modern Dark Mode)、开发者工具属性，带有微妙的磨砂玻璃效果 (Glassmorphism) 以增加层次感。
- **色彩体系**:
  - **Base Background**: `#0d1117` (深黑蓝，用于页面底层、侧边栏)
  - **Surface Background**: `rgba(22, 27, 34, 0.6)` (磨砂玻璃，用于卡片、主工作区、弹窗)，需配合 `backdrop-filter: blur(12px)`。
  - **Border / Divider**: `rgba(48, 54, 61, 0.5)` (极细边框线)
  - **Hover State**: `rgba(48, 54, 61, 0.3)` (行或卡片悬停时的浅灰色)
  - **Accent Primary (Action/Running)**: `#58a6ff` (蓝色，用于执行中、链接、主按钮、选定日期/标签)
  - **Accent Success (Completed/Connected)**: `#3fb950` (绿色，用于已完成状态、成功提示、输出 Token)
  - **Accent Warning (Pending/Edit)**: `#d29922` (黄色，用于等待、任务数、编辑按钮)
  - **Accent Danger (Error/Delete)**: `#f85149` (红色，用于错误、删除按钮)
  - **Accent Token (Total/Special)**: `#a371f7` (紫色，用于总 Token 计数、特定工具标签)
  - **Text Primary**: `#e6edf3` (高亮白色，用于标题、重要数据)
  - **Text Secondary**: `#8b949e` (辅助灰色，用于描述、次要文字、时间戳)
- **字体**:
  - **UI Standard**: 系统默认无衬线字体 (Inter, Segoe UI, PingFang SC)，14px Base。
  - **Data / Monospace**: 等宽字体 (JetBrains Mono, Fira Code, 13px)，用于 ID、Tokens 计数、代码片段。
- **圆角 (Border Radius)**:
  - 容器/大卡片: `12px`
  - 内部小卡片/按钮/输入框: `8px`
  - 胶囊标签 (Pills): `20px`

---

## 2. 页面 A：会话看板 (Kanban Board)

### 布局
- 采用 **三栏式** 看板布局：空闲等待、正在执行、已完成。
- 列标题需包含状态图标（如 `Inbox`, `PlayCircle`, `CheckCircle`）及任务计数器。

### 任务卡片 (Task Card)
- **Header**: 左侧 [状态圆点 + Agent 角色名称]，右侧 [monospace 微型 ID #hash]。
- **Body**:
  - 前缀 `用户输入:` 设为 `#58a6ff` 蓝色。
  - 任务描述文字使用 `line-clamp: 2` 自动截断。
- **Footer**:
  - 左侧显示 `Completed` (绿色) 或 `Running...` (蓝色)。
  - 右侧显示相对时间 (例如: `8 hours ago`)。
- **交互**: Hover 时边框颜色变亮，并伴随微小位移或投影。

---

## 3. 页面 B：数据看板 (Data Dashboard)

### 布局
- 顶部为日期选择器，下方为四列 KPI 统计卡片，底部为两列详情区。

### 核心 KPI 卡片
- 右上角放置极简状态图标（用户、闪电、日历、网络），使用对应状态色。
- 大数值居中显示（`40px, Bold`），单位（如 tokens）小字随其后。

### 详情与排行
- **Token 详情**: 输入数值 `#58a6ff` 蓝，输出数值 `#3fb950` 绿。
- **Agent 排行**:
  - Agent 名称加粗，总 Token 数紫色 `#a371f7`。
  - 任务数黄色 `#d29922`。
  - **进度条**: 底色 `#30363d`，填充色为紫色到蓝色的水平渐变 (`linear-gradient(to right, #a371f7, #58a6ff)`)。

---

## 4. 页面 C：任务历史 (Task History)

### 布局
- 顶部为大标题及右侧筛选区域（搜索框、Agent 下拉、状态下拉）。下方为全宽数据表格。

### 数据表格 (DataTable)
- **表头**: 次级文字颜色 `#8b949e`，加粗。
- **数据行**:
  - Agent 角色加粗，图标随其左。
  - 任务指令次级文字颜色，`line-clamp: 1` 截断。
  - **状态**: 所有“已完成”状态加粗并高亮为 `#3fb950` 绿。
  - **数值 (Monospace)**: Input Tokens `#58a6ff` 蓝，Output Tokens `#3fb950` 绿，耗时 `#d29922` 黄。
- **分页**: 位于底部居中，当前页码 `#58a6ff` 蓝。

---

## 5. 页面 D：管家记忆 (Butler Memory)

### 布局
- 顶部标题左侧带粉色大脑图标。右侧为“刷新数据”按钮。下方为一个全宽大卡片面板。

### 记忆面板
- **标签页导航 (Tabs)**:
  - 当前选中的标签页高亮为主要文字颜色，下方有蓝色 `#58a6ff` 下划线。
  - 非选中标签页为灰色 `#8b949e`。
- **数据列表**:
  - **ID (Monospace)**: 高对比度文字。
  - **更新时间**: 灰色辅助文字。
  - **操作按钮**:
    - “编辑”: 线性图标 + 黄色文本 `#d29922`。
    - “删除”: 线性图标 + 红色文本 `#f85149`。

---

## 6. 全局交互规范 (Global Interactions)

- **空状态 (Empty State)**: 使用 `lucide-react` 图标（透明度 0.3），配合斜体文字（如“暂无任务”）。
- **加载态**: 正在执行的任务或刷新按钮，图标应有平滑的旋转或呼吸灯动画。
- **滚动条**: 宽度 4px，圆角，颜色 `#30363d`，仅在滚动时显现。
- **输入框/下拉框**: 统一使用磨砂玻璃背景，细边框，Focus 时边框高亮为蓝色 `#58a6ff`。

---

## 7. 实现建议 (Tech Stack)

- **CSS**: Tailwind CSS (强烈推荐)
- **Icons**: Lucide React
- **Framework**: React / Next.js
- **Components**: 优先使用无状态组件封装，保持轻量和响应速度。