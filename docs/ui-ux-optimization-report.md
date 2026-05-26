# McAgent UI/UX 全流程优化总结报告

## 一、前期调研摘要

### 1.1 现有用户行为数据
- **产品形态**: CLI 终端 AI 助手，支持 TUI（Ink/React）和 Headless（readline）两种交互模式
- **核心用户**: macOS 开发者 / 高级用户，主要使用终端进行操作
- **高频操作**: 提问 macOS 系统问题 → Agent 回复 → 工具调用 → 返回结果

### 1.2 体验痛点识别

| 痛点 | 严重程度 | 描述 |
|---|---|---|
| 色彩不一致 | 高 | message-list 组件硬编码颜色，与 useTheme 主题系统不同步 |
| 缺少 Markdown 渲染 | 高 | AI 回复的格式化内容（标题/代码/列表）以纯文本显示，可读性差 |
| 流式逻辑耦合 | 中 | 60fps 防抖逻辑内嵌在 cli.tsx 的 useEffect 中，难以复用和维护 |
| headless 色彩独立 | 中 | headless 模式使用独立硬编码 ANSI 颜色，与 TUI 不统一 |
| 错误反馈不足 | 高 | 错误仅显示原始消息，无分类和恢复建议 |
| 缺少加载进度 | 中 | 长时间等待无耗时提示，用户无法判断是否卡死 |
| 工具调用单向透明 | 中 | 只显示工具被调用，不显示执行结果 |

### 1.3 目标用户画像
- **主要用户**: 日常使用终端进行开发、运维的 macOS 用户
- **次要用户**: 需要快速诊断 macOS 系统问题的非专业用户

### 1.4 用户旅程地图 (Current → Target)

```
用户旅程: 发现磁盘空间不足
─────────────────────────────────────────────────
现状 (Before):
  输入 "我的磁盘空间还有多少" → 等待(5-15s) → 
  收到纯文本回复 → 无法区分标题/代码/数据

优化后 (After):
  输入 "我的磁盘空间还有多少" → 显示 "🤔 Processing… (3s)" →
  工具调用显示 (🔧 diskUsageTool) → 结果反馈 (✓ diskUsageTool) →
  收到 Markdown 渲染的结构化回复 → 标题/列表/代码清晰可辨
  如果有错误 → 分类错误 + 恢复建议(💡)
```

---

## 二、视觉升级 —— 统一设计规范

### 2.1 色彩体系

建立了完整的语义化主题令牌 (Token) 系统，支持 dark/light 双主题：

| Token | 语义 | Dark | Light |
|---|---|---|---|
| `userLabel` | 用户消息标识 | cyan | blueBright |
| `assistantLabel` | 助手消息标识 | green | green |
| `toolCall` | 工具调用 | yellow | yellow |
| `heading` | Markdown 标题 | cyanBright | blueBright |
| `codeBlock` | 代码块 | cyan | blue |
| `inlineCode` | 行内代码 | yellow | magenta |
| `link` | 链接 | blueBright | blueBright |
| `error` | 错误 | redBright | redBright |
| `success` | 成功 | greenBright | green |
| `warning` | 警告 | yellowBright | yellow |
| `streamingIndicator` | 流式光标 | gray | gray |
| `scrollIndicator` | 滚动指示 | gray | gray |

**主题检测**: 自动识别终端 COLORFGBG 环境变量，支持 MCAGENT_THEME 环境变量显式覆盖。

### 2.2 字体层级

| 层级 | 用法 | 样式规则 |
|---|---|---|
| H1 | 页面标题、header | bold + heading 颜色 |
| H2-H3 | Markdown 渲染标题 | bold + heading 颜色 + 前缀装饰线 |
| 正文 | 消息内容、段落 | 正常粗细，wrap 折行 |
| 代码/数据 | 代码块、inline code | codeBlock/inlineCode 颜色 |
| 次要文本 | 状态、滚动指示、帮助 | muted/dimColor |
| 错误 | 异常消息 | bold + error 颜色 |
| 成功/警告 | 反馈文本 | success/warning 颜色 |

### 2.3 组件样式

- **Header**: borderStyle="round" + header 颜色
- **Input**: borderStyle="single" + border 颜色 + 语义化 inputPrompt 颜色
- **帮助面板**: borderStyle="round" + 分段标题(Line Editing / Navigation / Actions) + 颜色图例
- **滚动指示器**: dimColor + scrollIndicator 颜色

### 2.4 响应式适配

- TUI: 自适应终端列宽 (`process.stdout.columns`)
- 虚拟滚动: 仅渲染可视区域消息
- 行数估算: 基于终端列宽动态折行计算

---

## 三、交互优化

### 3.1 核心操作路径简化

| 操作 | 优化前 | 优化后 |
|---|---|---|
| 查看帮助 | `?` 键切换，显示无序快捷键 | 分类展示 (Line Editing / Navigation / Actions) + 颜色图例 |
| 浏览历史 | 仅支持上下箭头 | 上下箭头 + Home/End 跳转 |
| 理解 AI 回复 | 纯文本，markdown 乱码 | Markdown 渲染 (标题/加粗/斜体/代码/链接/列表) |

### 3.2 反馈逻辑优化

**加载态**:
- 流式输出时显示 `◀ Assistant (3s)` 带耗时计数器
- 空状态显示 `🤔 Processing (5s)…`
- 60fps 防抖确保流畅渲染

**异常态**:
- 错误自动分类 (网络/认证/限流/超时/安全拦截)
- 每类错误提供 `💡` 恢复建议
- 网络错误 → "Check your network connection and API endpoint."
- 认证错误 → "Verify your DEEPSEEK_API_KEY is valid."
- 限流错误 → "Too many requests. Please wait and retry."

**工具反馈**:
- 工具调用: `🔧 diskUsageTool({...})`
- 工具结果: `✓ diskUsageTool: ...` (成功绿) 或 `✗ diskUsageTool: Error...` (失败黄)
- 结果过长超过120字符自动截断

### 3.3 无障碍适配

- **颜色图例**: 帮助面板中包含 Color Key，解释每种颜色的语义
- **双主题**: dark/light 自动检测，适配不同终端背景
- **键盘全操控**: 所有功能均支持键盘快捷键，无需鼠标
- **语义化颜色**: 红色仅用于错误，绿色用于成功，黄色用于警告/工具调用

---

## 四、原型验证 —— 代码架构变更

### 4.1 新增文件

| 文件 | 功能 |
|---|---|
| `src/ui/components/markdown-renderer.tsx` | 终端 Markdown 渲染器 |
| `src/ui/hooks/use-streaming-agent.ts` | 流式处理和 Agent 事件绑定 Hook |
| `src/ui/ansi-theme.ts` | 共享 ANSI 色彩主题（headless 使用） |

### 4.2 修改文件

| 文件 | 变更内容 |
|---|---|
| `src/ui/hooks/use-theme.ts` | 新增 11 个语义令牌 (heading, codeBlock, link 等) |
| `src/ui/components/message-list.tsx` | 使用主题令牌 + MarkdownRenderer + 增强错误 + 加载计时 + 工具结果 |
| `src/cli.tsx` | 使用 useStreamingAgent Hook / 帮助面板重构 / InputField 主题化 |
| `src/headless.ts` | 使用共享 ANSI 主题替代硬编码颜色 |

### 4.3 可用性测试方案

**测试目标**: 验证优化后界面在以下维度的提升

| 维度 | 测试指标 | 目标值 |
|---|---|---|
| 信息可读性 | AI 回复内容理解准确率 | ≥ 90% |
| 操作效率 | 查看帮助后找到目标快捷键的时间 | ≤ 5s |
| 错误恢复 | 遇到错误后成功恢复的比例 | ≥ 80% |
| 视觉一致性 | 颜色使用时序一致性评分 | ≥ 4/5 |
| 加载感知 | 用户感知等待时间满意度 | ≥ 4/5 |

**测试参与者**: ≥20 名 macOS 终端用户
**测试方法**: 
1. 任务导向测试 (5 个核心场景)
2. SUS 可用性量表评分
3. A/B 对比 (优化前 vs 优化后)

---

## 五、落地验收 —— 核心指标追踪

### 5.1 建议追踪指标

| 指标 | 测量方式 | 目标提升 |
|---|---|---|
| 任务完成率 | 用户成功获得预期回复的比例 | ≥ 15% |
| 错误恢复率 | 遇到错误后成功继续交互的比例 | ≥ 20% |
| 用户满意度 | 终端内嵌 NPS / 5 分评分 | ≥ 4.0/5.0 |
| 首次响应可读性 | 初次用户能否正确理解 AI 回复 | ≥ 90% |

### 5.2 技术验证

- TypeScript 类型检查: ✅ 核心代码零类型错误
- Lint 检查: ✅ 无新增 lint 错误
- 单元测试: ✅ 306 测试全部通过 (20 测试文件)

---

## 六、文件变更总览

```
新增文件:
  src/ui/components/markdown-renderer.tsx   (281 行)
  src/ui/hooks/use-streaming-agent.ts       (134 行)
  src/ui/ansi-theme.ts                      (112 行)

修改文件:
  src/ui/hooks/use-theme.ts                 (+20 tokens)
  src/ui/components/message-list.tsx         (+props, +计时, +错误分类, +工具结果)
  src/cli.tsx                                (-96 行内联流式逻辑, +帮助面板重构)
  src/headless.ts                            (共享 ANSI 主题)

新增 Token:
  streamingIndicator, scrollIndicator, heading, codeBlock, inlineCode,
  link, listMarker, success, warning, reasoning
```
