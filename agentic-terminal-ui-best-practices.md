# 现代 Agentic Terminal App/Agent UI 最佳实践研究报告

> 研究日期：2026年5月31日
> 研究范围：Claude Code、Warp AI Terminal、GitHub Copilot CLI 等产品

---

## 目录

1. [执行摘要](#1-执行摘要)
2. [产品调研](#2-产品调研)
   - 2.1 [Claude Code](#21-claude-code)
   - 2.2 [Warp AI Terminal](#22-warp-ai-terminal)
   - 2.3 [GitHub Copilot CLI](#23-github-copilot-cli)
3. [Cursorless 交互模式](#3-cursorless-交互模式)
4. [流式输出与实时状态指示](#4-流式输出与实时状态指示)
5. [工具调用可视化最佳实践](#5-工具调用可视化最佳实践)
6. [Agent 思考过程展示方式](#6-agent-思考过程展示方式)
7. [综合最佳实践总结](#7-综合最佳实践总结)
8. [参考资料](#8-参考资料)

---

## 1. 执行摘要

现代 Agentic Terminal 应用正从"命令行工具"向"AI 原生开发环境"演进。本报告深入调研了 Claude Code、Warp AI Terminal、GitHub Copilot CLI 三个代表性产品，从交互模式、信息展示、流式输出、工具调用可视化、思考过程展示等维度进行系统性分析，提炼出适用于 Agentic Terminal App 的 UI/UX 最佳实践。

**核心发现：**

- **双模式设计**成为主流：终端模式（干净的命令行）与 Agent 模式（丰富的对话视图）分离
- **Cursorless 交互**通过智能自动检测、键盘驱动的工作流和渐进式权限模型实现
- **流式输出**需要结合实时进度指示、上下文窗口可视化和任务分解
- **工具调用可视化**应遵循"透明、可控、可追溯"三原则
- **思考过程展示**需要在"简洁"与"透明"之间取得平衡

---

## 2. 产品调研

### 2.1 Claude Code

**产品定位：** 终端中的 AI 驱动编码助手，支持文件编辑、命令执行、代码搜索、Web 搜索等完整代理能力。

#### 核心 UI 设计模式

| 特性 | 设计模式 | 说明 |
|------|----------|------|
| 交互模式 | 纯终端 TUI | 基于终端的文本界面，无 GUI 组件 |
| 输入模式 | 单行/多行混合 | 支持 `\ + Enter`、`Option+Enter`、`Shift+Enter` 多行输入 |
| 权限模型 | 分层权限 | Default → acceptEdits → plan → auto → bypassPermissions 五层 |
| 会话管理 | 本地持久化 | 每消息+工具调用写入 JSONL 文件，支持 resume/fork |
| 快捷键体系 | 类 Readline + Vim 模式 | 完整支持 Vim 编辑模式和 Emacs 风格的 Readline 快捷键 |

#### 关键 UI 元素

**1. 状态栏（Status Line）**
- 可自定义显示上下文窗口使用率、成本、Git 状态
- 权限模式指示器（通过 `Shift+Tab` 循环切换）
- PR 状态链接（带颜色指示：绿=已批准、黄=待审核、红=需修改、灰=Draft）

**2. 任务列表（Task List）**
- 通过 `Ctrl+T` 切换显示
- 自动分解复杂请求为可追踪步骤
- 最多同时显示 5 个任务
- 状态指示：待处理、进行中、已完成
- 跨上下文 compaction 持久化

**3. 对话记录查看器（Transcript Viewer）**
- 通过 `Ctrl+O` 切换
- 显示详细的工具使用和执行细节
- MCP 调用默认折叠为单行（如 "Called slack 3 times"）
- 支持 Vim 式导航（`{`/`}` 跳转到前后用户提示）
- 支持 `v` 在编辑器中打开完整对话

**4. 提示建议（Prompt Suggestions）**
- 基于 Git 历史自动生成灰色示例命令
- 后续建议基于对话历史生成
- 按 `Tab` 或 `→` 接受建议
- 以最低成本复用父对话的提示缓存

**5. 侧边问题（/btw）**
- 不增加对话历史的快速问答
- 在 Agent 工作时可同时运行
- 无工具访问权限（仅从已有上下文中回答）
- 支持 `f` 键 fork 为独立会话

**6. 会话回顾（Session Recap）**
- 离开终端后返回时显示单行摘要
- 至少 3 分钟不活动后自动生成
- 至少 3 轮对话后才显示


---

### 2.3 GitHub Copilot CLI

**产品定位：** GitHub 原生的终端 Agent，深度集成 GitHub 生态（Issues、PRs、Actions），支持多模型、子 Agent 并行执行。

#### 核心 UI 设计模式

| 特性 | 设计模式 | 说明 |
|------|----------|------|
| 交互模式 | Shift+Tab 模式切换 | Plan 模式 ↔ Autopilot 模式 |
| 子 Agent 管理 | /fleet 并行执行 | 多子 Agent 并行执行后合并结果 |
| 模型选择 | /model 切换 | 每任务可切换不同模型 |
| 会话持久化 | 跨会话持久 | 支持 /resume 从断点继续 |
| 扩展性 | MCP + Skills + Plugins | 三层扩展机制 |

#### 关键交互模式

**Plan 模式（Shift+Tab）**
- 用户 Shift+Tab 进入规划模式
- Agent 分析代码库并制定实施计划
- 用户审查计划后返回 autopilot 模式

**Autopilot 模式**
- 不需要逐步批准的自主执行
- Agent 自动完成任务并报告结果

**/fleet 并行执行**
- 跨多个子 Agent 并行执行同一任务
- 合并为一个结果
- 用户控制最终应用哪些变更

**会话管理**
- 跨会话持久化，可构建先前对话
- Memory 和 compaction 防止历史过长导致性能下降
- `/resume` 从断点继续

---

## 3. Cursorless 交互模式

### 3.1 定义与核心理念

### 3.2 关键设计原则

#### 原则 1：渐进式权限（Progressive Permission）

不需要用户对每个操作都批准，而是根据信任级别和任务复杂度提供不同粒度的控制：

```
默认模式：每步都询问 → 适合敏感操作
acceptEdits：自动文件编辑 → 适合代码迭代
plan 模式：只读探索 → 适合分析阶段
auto 模式：后台安全检测 → 适合长任务
bypassPermissions：完全自主 → 适合隔离容器
```

#### 原则 2：智能自动检测（Smart Auto-detection）

| 产品 | 检测内容 | 可视化指示 |
|------|----------|-----------|
| Warp | 自然语言 vs Shell | `(autodetected)` 标签 + UI 边框变化 |
| Claude Code | `!` 前缀显式切换 | Shell 模式实时进度显示 |
| Copilot CLI | Shift+Tab 模式切换 | 显式的 Plan/Autopilot 标签 |

Warp 的最佳实践：自动检测 + `⌘I` 手动覆盖 + `!` 前缀强制 Shell 模式，覆盖选择在当前条目中保持"粘性"。

#### 原则 3：键盘驱动的工作流（Keyboard-driven Workflow）

| 操作 | Claude Code | Warp |
|------|-------------|------|
| 停止 Agent | Esc | Esc / Ctrl+C |
| 切换模式 | Shift+Tab | ⌘I |
| 新对话 | - | ⌘↩ |
| 命令菜单 | / | / |
| 上下文查看 | Ctrl+O | 可视化进度条 |
| 历史搜索 | Ctrl+R | ↑ |
| 多行输入 | \ + Enter | Shift+Enter |

#### 原则 4：无中断交互（Non-disruptive Interaction）

- **Claude Code 后台命令**：`Ctrl+B` 将 Bash 命令移至后台运行
- **Claude Code 侧边问题**：`/btw` 在 Agent 工作时提问，不打断主流程
- **Warp 多 Tab 通知**：Agent 在后台 Tab 中工作时通知状态变化
- **Copilot CLI /fleet**：子 Agent 在后台并行执行

### 3.3 Cursorless 交互的层次模型

```
Level 0: 完全手动 → 用户每步都需要手动操作
Level 1: 半自动 → 智能自动检测 + 用户确认
Level 2: 自动 + 例外处理 → 自动执行 + 异常时介入
Level 3: 完全自主 → 设定目标后完全委托
```

---

## 4. 流式输出与实时状态指示

### 4.1 流式输出的设计挑战

1. **双向数据流**：不仅有文本流，还有工具调用 + 结果返回
2. **状态不确定性**：用户需要知道 Agent 是"正在思考"还是"正在执行"
3. **长输出处理**：大型文件读取、编译输出等可能阻塞交互
4. **语境维护**：流式内容需要与已有对话上下文正确融合

### 4.2 各产品的流式输出方案

| 维度 | Claude Code | Warp | Copilot CLI |
|------|-------------|------|-------------|
| 文本流 | 逐 token 流式输出 | 逐 token 流式输出 | 流式输出 |
| 状态指示 | 文本 + 任务列表 | "Warping" 指示器 + Tips | 状态行 |
| 进度追踪 | Ctrl+T 任务列表 | Task List 芯片 + 完成标记 | - |
| 中断机制 | Esc 即时停止 | Esc / Ctrl+C | - |
| 上下文管理 | 自动 compaction | 自动摘要 + 可视化进度条 | Memory + compaction |

### 4.3 最佳实践

#### 1. 进度指示器的最佳实践

**Warp 的做法（推荐）：**
- 使用固定的"Warping"指示器显示处理中状态
- 同时显示 Agent Tips 提供学习价值
- Task List 实时更新每个步骤的状态
- 可视化上下文窗口进度条

**Claude Code 的做法：**
- 任务列表实时更新（Ctrl+T）
- 状态栏显示当前模式
- 后台命令有独立的任务 ID

#### 2. 上下文窗口可视化

**Warp 的上下文窗口指示器（推荐做法）：**
- < 20%：不显示
- 20-80%：渐变色进度条
- > 80%：红色警告
- 超限：自动摘要

#### 3. 中断与恢复机制

```
用户按 Esc → Agent 停止当前操作（已做工作保留）
→ 用户提供新的方向 → Agent 基于已有进展继续
```

**关键设计点：**
- 中断不应丢失已做的工作
- 提供明确的退出确认（Warp 的"Press again to exit"模式）
- 支持断点恢复（Claude Code 的 checkpoint + /resume）




---

## 5. 工具调用可视化最佳实践

### 5.1 工具调用的"透明三原则"

1. **可预见性**：用户应能预见 Agent 下一步会做什么
2. **可理解性**：工具调用的意图和结果应清晰可理解
3. **可控制性**：用户应能在任何时候批准、拒绝或修改工具调用

### 5.2 各产品的工具调用展示

#### Claude Code

- **默认模式**：每次文件编辑和 Shell 命令执行前暂停并请求批准
- **Transcript Viewer（Ctrl+O）**：详细显示每次工具调用
- **MCP 调用折叠**：多次调用折叠为 "Called slack 3 times"
- **文件编辑前**：自动创建检查点

```
[File] Read: src/auth/middleware.ts (342 lines)
[Search] Regex: "session\\.[a-z]+" in src/auth/
[Bash] Running: npm test src/auth/
[Edit] Write: src/auth/session.ts (82 lines → 95 lines)
```

#### Warp

- **代码差异**：以可视化 diff 形式展示所有代码变更
- **内建编辑器**：支持逐行审查、手动编辑、自然语言优化
- **块系统**：Agent 执行的命令仅在对话中可见，不污染终端视图

```
┌──────────────────────────────────────────┐
│  Edit: src/payments/checkout.ts          │
│  ┌────────────────────────────────────┐  │
│  │ - const oldImplementation = ...    │  │
│  │ + const newImplementation = ...    │  │
│  └────────────────────────────────────┘  │
│  [Accept] [Refine (R)] [Edit (E)]       │
└──────────────────────────────────────────┘
```

### 5.3 最佳实践总结

#### 工具调用的信息层级

```
Level 0: 完全透明 → 所有工具调用 + 参数 + 结果
Level 1: 标准显示 → 工具类型 + 摘要，可展开
Level 2: 折叠显示 → 同类工具调用合并
Level 3: 仅结果 → 只显示最终结果
```

#### 推荐的显示格式

```
[📁 Read]    src/auth/login.ts (156 lines)
[🔍 Search]  "apiKey" in config/*.ts → 3 matches
[💻 Bash]    npm test src/auth/ → 2 passed, 1 failed
[✏️ Edit]    src/auth/login.ts (156 → 178 lines)
[🌐 Web]     Fetching npm docs for bcrypt...
```


---

## 6. Agent 思考过程展示方式

### 6.1 思考展示的设计目标

1. **建立信任**：用户需要相信 Agent 的推理过程是合理的
2. **提供可操作性**：用户应在 Agent 思考过程中能够介入和引导
3. **避免信息过载**：展示足够但不冗余的信息

### 6.2 各产品的思考展示方式

#### Claude Code
- Agent 的推理过程通过文本流自然展示
- 文件读取 → 分析 → 行动的逻辑链条清晰可见
- `/btw` 侧边问题可查看当前上下文中的信息
- Transcript Viewer 完整记录思考过程
- **不专门显示"思考中..."状态**，而是通过逐步行动展示推理

#### Warp
- Agent 思考时显示 "Warping" 动态指示器
- 同时显示 Agent Tips 提供学习价值
- Task List 显示整体计划和当前步骤
- 代码差异直接展示 Agent 的"思考结果"
- **将等待时间转化为学习机会**

#### GitHub Copilot CLI
- Plan 模式显式展示分析过程和实施计划
- Autopilot 模式自动执行，完成后报告结果
- /fleet 并行执行后合并展示各子 Agent 的结果
- **规划与执行分离**

### 6.3 思考展示的最佳实践

#### 1. "行动即思考"原则

Agent 的思考应通过可观察的行动来展示：

```
✅ 好的做法：
  📖 Reading: src/auth/login.ts
  🔍 Found: token expiry not checked after refresh
  ✏️ Fixing: adding token expiry validation

❌ 不好的做法：
  🤔 Thinking about the auth bug...
  🤔 Analyzing the codebase...
```

#### 2. 规划与执行分离

```
📋 实施计划
  Phase 1: 分析当前认证流程
    - 读取 src/auth/middleware.ts
    - 查找 token 刷新逻辑
  Phase 2: 修复 Token 过期问题
    - 在 auth middleware 中添加检查
    - 更新 token refresh 逻辑
  Phase 3: 验证
    - 运行已有的测试
    - 编写新的 edge case 测试
  [批准并执行] [修改计划] [拒绝]
```

#### 3. 思考粒度的动态调整

| 粒度 | 显示内容 | 适用场景 |
|------|----------|----------|
| 宏观 | 任务摘要和最终结果 | 简单任务、信任度高 |
| 标准 | 主要步骤和关键决策 | 日常开发 |
| 微观 | 每步思考、每次工具调用 | 调试、新用户、敏感操作 |




---

## 7. 综合最佳实践总结

### 7.1 架构层面的最佳实践

```
用户界面层:
  终端模式（干净简洁）↔ Agent 模式（丰富控制）
  对话管理（多会话/分叉）

交互层:
  自动检测（NL vs Shell）
  权限管理（渐进式）
  状态指示（实时反馈）

Agent 引擎层:
  Agent 循环（收集→行动→验证）
  工具调用（透明可追溯）
  上下文管理（窗口可视化）
```

### 7.2 各维度最佳实践清单

#### 交互模式
- [x] 提供双模式（终端/Agent），模式切换清晰可见
- [x] 支持智能自动检测自然语言 vs 命令
- [x] 提供快捷键覆盖自动检测结果
- [x] 支持多级权限模型，用户可根据信任度选择
- [x] 支持随时中断 Agent 而不丢失工作

#### 流式输出
- [x] 提供实时的进度指示器
- [x] 显示上下文窗口使用率
- [x] 支持自动 compaction/摘要防止上下文溢出
- [x] 复杂任务自动分解为可追踪步骤
- [x] 中断后支持断点恢复

#### 工具调用
- [x] 工具调用透明可见，支持折叠/展开
- [x] 文件变更以 diff 形式展示
- [x] 支持逐变更批准/拒绝/编辑
- [x] 工具调用信息分级
- [x] 文件编辑前自动创建检查点

#### 思考过程
- [x] 通过行动展示思考（"行动即思考"）
- [x] 规划与执行分离
- [x] 支持不同粒度的思考展示
- [x] 在思考过程中提供交互式介入点
- [x] 支持侧边问题（不打断主流程）

#### 通知与状态
- [x] 多层级通知（In-app + 桌面）
- [x] Tab 级 Agent 状态指示
- [x] Agent Tips 将等待时间转化为学习机会
- [x] 会话离开后返回时提供摘要回顾

### 7.3 推荐的交互流程

```
1. 用户打开终端 → [终端模式] 干净的终端界面
2. 用户输入自然语言 / 按快捷键 → [Agent 模式]
3. Agent 开始工作：
   - 显示 Task List 分解任务
   - 流式输出思考过程
   - 工具调用透明显示
   - 上下文窗口进度可视化
4. 用户可随时：
   - Esc 中断并重定向
   - /btw 侧边提问
   - Ctrl+O 查看完整记录
5. 任务完成：
   - 显示摘要
   - 代码变更以 diff 展示
   - 提供 approve/refine/edit 操作
```

### 7.4 反模式清单

| 反模式 | 说明 | 改进方案 |
|--------|------|----------|
| 黑盒执行 | Agent 过程完全不可见 | 显示工具调用链和决策点 |
| 过度审批 | 每个微小操作都需批准 | 提供渐进式权限模型 |
| 光标依赖 | 必须使用鼠标/光标操作 | 全部操作提供键盘快捷键 |
| 信息倾泻 | 一次性显示过多原始输出 | 分层展示，可折叠/展开 |
| 无状态中断 | 中断后丢失所有已做工作 | 检查点系统 + 恢复机制 |
| 循环思考 | 长时间显示"思考中..."无进展 | 设定超时限制 |

---

## 8. 参考资料

1. **Claude Code Documentation** - https://docs.anthropic.com/en/docs/claude-code/overview
2. **Claude Code: How it works** - https://docs.anthropic.com/en/docs/claude-code/how-claude-code-works
3. **Claude Code: Permission Modes** - https://docs.anthropic.com/en/docs/claude-code/permission-modes
4. **Claude Code: Interactive Mode** - https://docs.anthropic.com/en/docs/claude-code/interactive-mode
5. **Warp Agents Overview** - https://docs.warp.dev/agent-platform/local-agents/overview
6. **Warp: Terminal and Agent Modes** - https://docs.warp.dev/agent-platform/local-agents/interacting-with-agents/terminal-and-agent-modes
7. **Warp: Code Diffs** - https://docs.warp.dev/agent-platform/local-agents/interacting-with-agents/code-diffs
8. **Warp: Task Lists** - https://docs.warp.dev/agent-platform/capabilities/task-lists
9. **Warp: Agent Notifications** - https://docs.warp.dev/agent-platform/capabilities/agent-notifications
10. **GitHub Copilot CLI** - https://github.com/features/copilot/cli
11. **Claude Code Docs Index** - https://code.claude.com/docs/llms.txt

---

> **免责声明：** 本报告基于 2026 年 5 月 31 日可获取的公开文档编写。产品 UI 和功能可能随时间发生变化。

