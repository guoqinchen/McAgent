# 🍏 McAgent Code Wiki

---

## 1. 项目概述

**McAgent** 是一个 CLI 优先的 macOS AI 助手，将 DeepSeek 语言模型与 macOS 操作系统深度集成。它能够理解 macOS 内部机制，执行 shell 命令，检查系统状态，并帮助用户进行故障排除。

### 核心特性

| 特性              | 描述                                                                   |
| ----------------- | ---------------------------------------------------------------------- |
| **20+ 内置工具**  | 系统信息、进程管理、磁盘分析、网络诊断、统一日志、安全审计、电源管理等 |
| **双界面**        | Ink/React TUI（交互式）和 headless CLI（可脚本化）                     |
| **安全优先**      | 14 类危险命令检测、路径限定写权限、可配置权限模式                      |
| **上下文感知**    | 自动消息驱逐防止上下文窗口溢出                                         |
| **可扩展**        | 简洁的 `Tool` 接口支持添加自定义工具                                   |
| **DeepSeek 驱动** | 支持流式输出、推理能力 (R1)、可配置模型                                |

### 技术栈

| 分类   | 技术        | 版本 |
| ------ | ----------- | ---- |
| 语言   | TypeScript  | 5.6+ |
| 运行时 | Node.js     | 18+  |
| UI框架 | Ink + React | 5.0+ |
| 测试   | Vitest      | 4.1+ |
| AI API | DeepSeek    | V4   |

---

## 2. 项目架构

### 2.1 目录结构

```
src/
├── agent.ts                 # 核心 Agent 类（对话循环 + 工具执行）
├── cli.tsx                  # Ink/React TUI 界面
├── headless.ts              # Readline 纯文本 CLI
├── context-manager.ts       # 上下文窗口管理（token 估算 + 消息驱逐）
├── tools.ts                 # 8 个基础 macOS 工具
├── tools-extended.ts        # 8 个扩展工具
├── tools-pro.ts             # 4 个专业诊断工具
├── __tests__/               # Vitest 测试（99 个测试用例）
│   ├── agent.test.ts
│   ├── context-manager.test.ts
│   ├── tools-pro.test.ts
│   └── tools.test.ts
├── agent/
│   └── conversation.ts      # 对话历史管理
├── engine/
│   ├── reasoning-engine.ts  # 自适应推理策略
│   └── error-recovery-engine.ts # 错误恢复机制
├── providers/
│   ├── deepseek-provider.ts # DeepSeek API 提供者
│   ├── openai-provider.ts   # OpenAI API 提供者
│   └── provider-factory.ts  # 提供者工厂
├── tools/
│   ├── tool-registry.ts     # 工具注册与分类
│   └── enhanced-tool-executor.ts # 带缓存和限流的工具执行器
├── types/
│   ├── config.ts            # 配置类型
│   ├── events.ts            # 事件类型
│   ├── llm-provider.ts      # LLM 提供者抽象层
│   └── tool.ts              # 工具定义类型
├── ui/
│   ├── markdown-renderer.ts # Markdown 渲染
│   └── streaming-optimizer.ts # 流式输出优化
├── logging/
│   └── structured-logger.ts # 多处理器日志系统
├── monitoring/
│   ├── metrics-collector.ts # 性能指标收集
│   └── performance-reporter.ts # 性能报告
├── security/
│   └── permission-manager.ts # 细粒度权限系统
├── session/
│   └── session-manager.ts   # 持久化会话管理
└── shell/
    └── executor.ts          # Shell 命令执行器
```

### 2.2 模块依赖关系

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          UI Layer                                          │
│  ┌─────────────────┐    ┌─────────────────┐                               │
│  │     cli.tsx     │    │   headless.ts   │                               │
│  │   (Ink TUI)     │    │  (Readline CLI) │                               │
│  └────────┬────────┘    └────────┬────────┘                               │
└───────────┼──────────────────────┼────────────────────────────────────────┘
            │                      │
            ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Core Layer                                          │
│                    ┌───────────────────┐                                   │
│                    │    agent.ts       │ ← 核心对话循环                    │
│                    │   (MacOSAgent)    │   - 消息管理                     │
│                    └─────────┬─────────┘   - 工具执行                     │
│                              │              - 事件发射                     │
│          ┌───────────────────┼───────────────────┐                        │
│          ▼                   ▼                   ▼                        │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                  │
│  │ conversation  │  │ context-      │  │  providers/   │                  │
│  │    .ts        │  │  manager.ts   │  │   factory     │                  │
│  │               │  │               │  └───────┬───────┘                  │
│  └───────────────┘  └───────────────┘           │                          │
│                              │                  │                          │
│                              ▼                  ▼                          │
│                    ┌───────────────────────────────────┐                   │
│                    │          tools/                   │                   │
│                    │  tool-registry + executor         │                   │
│                    └───────────────┬───────────────────┘                   │
│                                    │                                      │
│           ┌────────────────────────┼────────────────────────┐              │
│           ▼                        ▼                        ▼              │
│    ┌───────────┐           ┌───────────┐           ┌───────────┐           │
│    │ tools.ts  │           │ tools-    │           │ tools-    │           │
│    │ (基础工具)│           │ extended  │           │   pro.ts  │           │
│    └───────────┘           │   .ts     │           │ (专业工具)│           │
│                            │ (扩展工具)│           └───────────┘           │
│                            └───────────┘                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
┌───────────────────────────────────┴─────────────────────────────────────────┐
│                        Support Layer                                       │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐│
│  │   engine/     │  │   logging/    │  │  monitoring/  │  │  security/    ││
│  │ reasoning     │  │ structured-   │  │ metrics-      │  │ permission-   ││
│  │ error-recovery│  │   logger.ts   │  │ collector.ts  │  │  manager.ts   ││
│  └───────────────┘  └───────────────┘  └───────────────┘  └───────────────┘│
│                                                                             │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐│
│  │  session/     │  │   shell/      │  │    types/     │                  ││
│  │ session-      │  │  executor.ts  │  │ config/events │                  ││
│  │  manager.ts   │  │               │  │ llm-provider  │                  ││
│  └───────────────┘  └───────────────┘  └───────────────┘                  ││
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 核心模块详解

### 3.1 Agent 核心模块

#### 3.1.1 MacOSAgent 类

**位置**: [src/agent.ts](file:///workspace/src/agent.ts)

**职责**: 核心对话代理，管理对话历史、工具执行和 LLM 交互。

**核心属性**:

| 属性                | 类型                  | 说明                     |
| ------------------- | --------------------- | ------------------------ |
| `client`            | `OpenAIClient`        | DeepSeek API 客户端      |
| `conversation`      | `ConversationHistory` | 对话历史管理器           |
| `config`            | `McAgentConfig`       | 完整配置对象             |
| `toolsByName`       | `Map<string, Tool>`   | 工具名称到工具对象的映射 |
| `busy`              | `boolean`             | 并发保护标志             |
| `consecutiveErrors` | `number`              | 连续工具错误计数         |

**核心方法**:

| 方法                  | 签名                                               | 说明               |
| --------------------- | -------------------------------------------------- | ------------------ |
| `send()`              | `async send(content: string): Promise<string>`     | 发送消息并流式响应 |
| `sendSync()`          | `async sendSync(content: string): Promise<string>` | 发送消息并同步响应 |
| `addTool()`           | `addTool(tool: Tool): void`                        | 运行时注册工具     |
| `setModel()`          | `setModel(model: string): void`                    | 切换模型           |
| `setPermissionMode()` | `setPermissionMode(mode: PermissionMode): void`    | 切换权限模式       |
| `saveSession()`       | `saveSession(path: string): void`                  | 保存会话到文件     |
| `loadSession()`       | `loadSession(path: string): void`                  | 从文件加载会话     |

**事件系统**:

```typescript
// 事件类型定义（来自 types/events.ts）
interface McAgentEvents {
  'message:user': (message: Message) => void;
  'message:assistant': (message: Message) => void;
  'stream:delta': (delta: string, accumulated: string) => void;
  'stream:end': (fullText: string) => void;
  'tool:call': (name: string, args: unknown) => void;
  'tool:result': (name: string, result: unknown) => void;
  'reasoning:delta': (text: string) => void;
  'thinking:start': () => void;
  'thinking:end': () => void;
  error: (error: Error) => void;
}
```

#### 3.1.2 ConversationHistory 类

**位置**: [src/agent/conversation.ts](file:///workspace/src/agent/conversation.ts)

**职责**: 管理对话历史的存储、系统提示组合、上下文驱逐和会话持久化。

**核心方法**:

| 方法                      | 说明                           |
| ------------------------- | ------------------------------ |
| `addUserMessage()`        | 添加用户消息                   |
| `addAssistantMessage()`   | 添加助手消息（支持工具调用）   |
| `addToolResult()`         | 添加工具执行结果               |
| `getMessagesWithSystem()` | 构建包含系统提示的完整消息数组 |
| `toPlainMessages()`       | 返回简化的消息列表用于显示     |
| `save()` / `load()`       | 会话持久化                     |

### 3.2 工具系统

#### 3.2.1 Tool 类型定义

**位置**: [src/types/tool.ts](file:///workspace/src/types/tool.ts)

```typescript
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  execute: (args: Record<string, unknown>) => Promise<unknown>;
  readonly?: boolean; // 只读标记
}
```

#### 3.2.2 工具分类

| 分类                               | 工具名称              | 只读 | 说明            |
| ---------------------------------- | --------------------- | ---- | --------------- |
| **基础工具** (`tools.ts`)          |                       |      |                 |
|                                    | `run_command`         | ❌   | 执行 shell 命令 |
|                                    | `get_system_info`     | ✅   | 获取系统信息    |
|                                    | `list_processes`      | ✅   | 列出进程        |
|                                    | `disk_usage`          | ✅   | 磁盘使用分析    |
|                                    | `get_network_info`    | ✅   | 网络信息        |
|                                    | `find_files`          | ✅   | 文件搜索        |
|                                    | `read_file`           | ✅   | 读取文件        |
|                                    | `system_logs`         | ✅   | 系统日志        |
| **扩展工具** (`tools-extended.ts`) |                       |      |                 |
|                                    | `write_file`          | ❌   | 写入文件        |
|                                    | `edit_file`           | ❌   | 编辑文件        |
|                                    | `open_app`            | ❌   | 打开应用        |
|                                    | `clipboard`           | ❌   | 剪贴板操作      |
|                                    | `brew_info`           | ✅   | Homebrew 信息   |
|                                    | `software_update`     | ✅   | 软件更新检查    |
|                                    | `battery`             | ✅   | 电池状态        |
|                                    | `screenshot`          | ✅   | 截图            |
| **专业工具** (`tools-pro.ts`)      |                       |      |                 |
|                                    | `network_diagnostics` | ✅   | 网络诊断        |
|                                    | `system_diagnostics`  | ✅   | 系统诊断        |
|                                    | `security_check`      | ✅   | 安全检查        |
|                                    | `power_management`    | ✅   | 电源管理        |

#### 3.2.3 安全机制

**危险命令检测** - 14 类危险命令模式：

| 类别       | 命令模式                                          | 风险说明     |
| ---------- | ------------------------------------------------- | ------------ |
| 文件删除   | `rm -rf`, `rm -r`, `rmdir`                        | 数据丢失     |
| 磁盘操作   | `dd if=`, `mkfs`, `newfs_*`, `diskutil eraseDisk` | 磁盘擦除     |
| 权限提升   | `sudo`                                            | 绕过安全限制 |
| 系统完整性 | `csrutil disable`, `nvram -d`                     | 禁用 SIP     |
| 服务管理   | `launchctl unload/remove`                         | 禁用系统服务 |
| RCE 向量   | `curl\|sh`, `wget\|bash`                          | 远程代码执行 |

**权限模式**:

| 模式       | 说明                         |
| ---------- | ---------------------------- |
| `readonly` | 仅允许标记为 readonly 的工具 |
| `approve`  | 默认模式，危险命令需要确认   |
| `auto`     | 跳过所有安全检查             |

### 3.3 上下文管理

**位置**: [src/context-manager.ts](file:///workspace/src/context-manager.ts)

**职责**: 提供 token 估算和消息驱逐功能，防止对话历史超出模型上下文窗口限制。

**核心函数**:

| 函数                      | 说明                                                                  |
| ------------------------- | --------------------------------------------------------------------- |
| `estimateTokens()`        | 根据字符长度估算 token 数（CJK: ~2 char/token, ASCII: ~4 char/token） |
| `estimateMessageTokens()` | 估算消息数组的总 token 数                                             |
| `evictMessages()`         | 根据最大 token 限制驱逐旧消息                                         |

**驱逐策略**:

1. 无条件保留系统提示
2. 优先移除最旧的用户/助手消息对
3. 保留属于存活助手调用的工具消息
4. 始终保留至少 5 条消息

### 3.4 LLM 提供者

#### 3.4.1 提供者抽象层

**位置**: [src/types/llm-provider.ts](file:///workspace/src/types/llm-provider.ts)

```typescript
export interface LLMProvider {
  name: string;
  config: ProviderConfig;

  chatCompletion(messages: ChatCompletionMessage[], options?: {...}): Promise<ChatCompletionResponse>;
  streamingChatCompletion(messages: ChatCompletionMessage[], options?: {...}): Promise<AsyncIterable<StreamingChatCompletionChunk>>;
  estimateTokens(text: string): number;
}
```

#### 3.4.2 可用提供者

| 提供者   | 类名               | 默认 URL                   | 默认模型            |
| -------- | ------------------ | -------------------------- | ------------------- |
| DeepSeek | `DeepSeekProvider` | `https://api.deepseek.com` | `deepseek-v4-flash` |
| OpenAI   | `OpenAIProvider`   | `https://api.openai.com`   | `gpt-4o-mini`       |

**位置**: [src/providers/deepseek-provider.ts](file:///workspace/src/providers/deepseek-provider.ts)、[src/providers/openai-provider.ts](file:///workspace/src/providers/openai-provider.ts)

#### 3.4.3 Provider Factory

**位置**: [src/providers/provider-factory.ts](file:///workspace/src/providers/provider-factory.ts)

```typescript
const factory = new ProviderFactory();
const provider = factory.create('deepseek', { apiKey: 'sk-xxx' });
```

---

## 4. 辅助模块

### 4.1 推理引擎

**位置**: [src/engine/reasoning-engine.ts](file:///workspace/src/engine/reasoning-engine.ts)

**职责**: 自适应推理策略选择，根据任务复杂度和风险级别动态调整推理模式。

**推理策略**:

| 策略          | 适用场景          | 说明                   |
| ------------- | ----------------- | ---------------------- |
| `direct`      | 简单任务          | 直接、简洁的回答       |
| `reasoned`    | 中等复杂度        | 逐步思考后回答         |
| `explorative` | 高复杂度/不确定性 | 探索多种方法后决策     |
| `critical`    | 高风险场景        | 极端谨慎，考虑最坏情况 |

### 4.2 错误恢复引擎

**位置**: [src/engine/error-recovery-engine.ts](file:///workspace/src/engine/error-recovery-engine.ts)

**职责**: 自动化错误处理和恢复机制。

**错误类型与策略**:

| 错误类型                             | 恢复策略          |
| ------------------------------------ | ----------------- |
| `network` / `timeout` / `rate_limit` | 重试（最多 3 次） |
| `api_error`                          | 重试或降级        |
| `permission_error`                   | 升级到人工        |
| `validation_error`                   | 中止              |
| `resource_unavailable`               | 重试或跳过        |

### 4.3 日志系统

**位置**: [src/logging/structured-logger.ts](file:///workspace/src/logging/structured-logger.ts)

**特性**:

- 多处理器架构（ConsoleHandler + FileHandler）
- 日志级别：`trace` → `debug` → `info` → `warn` → `error` → `fatal`
- 结构化 JSON 日志输出
- 自动按日期分割日志文件

### 4.4 监控系统

#### 4.4.1 Metrics Collector

**位置**: [src/monitoring/metrics-collector.ts](file:///workspace/src/monitoring/metrics-collector.ts)

**收集的指标**:

- 请求数、成功数、失败数
- 延迟统计（最小/最大/平均）
- Token 统计（prompt/completion/total）
- 错误类型分布

#### 4.4.2 Performance Reporter

**位置**: [src/monitoring/performance-reporter.ts](file:///workspace/src/monitoring/performance-reporter.ts)

**功能**:

- 定期生成性能报告（默认 10 分钟间隔）
- 报告持久化存储
- 支持查询历史报告

### 4.5 权限管理

**位置**: [src/security/permission-manager.ts](file:///workspace/src/security/permission-manager.ts)

**职责**: 细粒度权限控制，支持规则配置。

**默认规则**:

1. 允许以 `get_`、`list_`、`search` 开头的只读工具
2. 文件操作限制在用户主目录内

### 4.6 会话管理

**位置**: [src/session/session-manager.ts](file:///workspace/src/session/session-manager.ts)

**功能**:

- 会话创建/保存/加载/删除
- 支持分页列表查询
- 按创建时间或修改时间排序
- 消息追加和清空

### 4.7 Shell 执行器

**位置**: [src/shell/executor.ts](file:///workspace/src/shell/executor.ts)

**职责**: 统一的 shell 命令执行接口，支持超时控制和错误处理。

---

## 5. UI 模块

### 5.1 TUI 界面

**位置**: [src/cli.tsx](file:///workspace/src/cli.tsx)

**技术栈**: Ink + React

**特性**:

- 交互式聊天界面
- 实时流式输出
- 工具调用可视化
- 键盘快捷键支持（↑↓ 历史、Ctrl+C/Esc 退出）

### 5.2 Headless 界面

**位置**: [src/headless.ts](file:///workspace/src/headless.ts)

**技术栈**: Node.js Readline

**特性**:

- 纯文本模式，适合脚本调用
- 支持颜色输出
- 事件驱动的状态显示

### 5.3 Markdown 渲染器

**位置**: [src/ui/markdown-renderer.ts](file:///workspace/src/ui/markdown-renderer.ts)

**支持的格式**:

- 粗体、斜体、下划线
- 行内代码和代码块
- 链接
- 标题
- 列表
- 水平分隔线

### 5.4 流式优化器

**位置**: [src/ui/streaming-optimizer.ts](file:///workspace/src/ui/streaming-optimizer.ts)

**功能**:

- 缓冲区管理（默认 100 字符）
- 防抖延迟（默认 50ms）
- 不完整 Markdown 修复
- 订阅者模式

---

## 6. 配置与运行

### 6.1 环境变量

| 变量名                      | 说明              | 默认值              |
| --------------------------- | ----------------- | ------------------- |
| `DEEPSEEK_API_KEY`          | DeepSeek API 密钥 | **必填**            |
| `DEEPSEEK_MODEL`            | 模型 ID           | `deepseek-v4-flash` |
| `DEEPSEEK_THINKING_ENABLED` | 启用思考模式      | `true`              |
| `DEEPSEEK_REASONING_EFFORT` | 推理级别          | `high`              |
| `DEEPSEEK_MAX_TOKENS`       | 最大上下文 token  | `96000`             |

### 6.2 配置接口

```typescript
interface McAgentConfig {
  apiKey: string; // 必填
  baseURL?: string; // API 基础 URL
  model?: string; // 模型 ID
  instructions?: string; // 系统提示
  tools?: Tool[]; // 工具数组
  maxToolRounds?: number; // 最大工具调用轮数
  maxContextTokens?: number; // 上下文 token 限制
  permissionMode?: PermissionMode; // 权限模式
  autoAllowlist?: string[]; // 命令白名单
  thinkingEnabled?: boolean; // 思考模式
  reasoningEffort?: 'high' | 'max'; // 推理级别
  toolStrictMode?: boolean; // 严格工具模式(Beta)
  useBetaEndpoint?: boolean; // 使用 Beta 端点
}
```

### 6.3 启动命令

```bash
# 安装依赖
npm install

# 配置 API 密钥
export DEEPSEEK_API_KEY=sk-your-key-here

# 启动 TUI 界面
npm start

# 启动 headless 模式
npm run start:headless

# 开发模式（热重载）
npm run dev

# 运行测试
npm test

# 代码检查
npm run lint

# 代码格式化
npm run format

# 构建生产版本
npm run build
```

### 6.4 使用示例

```typescript
import { createMacOSAgent } from './agent.js';
import { macOSDefaultTools } from './tools.js';
import { macOSExtendedTools } from './tools-extended.js';

const agent = createMacOSAgent({
  apiKey: process.env.DEEPSEEK_API_KEY,
  model: 'deepseek-v4-flash',
  tools: [...macOSDefaultTools, ...macOSExtendedTools],
  permissionMode: 'approve',
  maxContextTokens: 96000,
});

// 发送消息
const response = await agent.send('Show me my disk usage');
console.log(response);

// 监听事件
agent.on('tool:call', (name, args) => {
  console.log(`Tool called: ${name}`, args);
});

// 保存会话
agent.saveSession('/path/to/session.json');
```

---

## 7. 测试体系

### 7.1 测试覆盖

| 测试文件                  | 测试范围                                       |
| ------------------------- | ---------------------------------------------- |
| `agent.test.ts`           | Agent 核心功能、安全检查、并发控制、上下文驱逐 |
| `tools.test.ts`           | 工具安全检查、命令格式验证、工具执行           |
| `tools-pro.test.ts`       | 专业工具测试                                   |
| `context-manager.test.ts` | 上下文管理、token 估算                         |

### 7.2 运行测试

```bash
# 运行所有测试
npm test

# 监听模式
npm run test:watch

# 特定测试文件
npx vitest run agent.test.ts
```

---

## 8. 安全最佳实践

### 8.1 危险命令防护

- ✅ 14 类危险命令模式检测
- ✅ 命令白名单机制（git、npm、brew 等自动放行）
- ✅ 路径限制（文件写入限制在 `$HOME` 目录）

### 8.2 权限模式

| 模式       | 适用场景                   |
| ---------- | -------------------------- |
| `readonly` | 公共环境、演示模式         |
| `approve`  | 默认模式，需要确认危险操作 |
| `auto`     | 可信环境、自动化脚本       |

### 8.3 错误处理

- 连续工具错误超过 3 次自动中断
- 网络错误自动重试（带指数退避）
- 权限错误升级到人工处理

---

## 9. 扩展指南

### 9.1 添加自定义工具

```typescript
import type { Tool } from './types/tool.js';

const myCustomTool: Tool = {
  name: 'my_tool',
  description: 'Description of what this tool does',
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'First parameter' },
      param2: { type: 'number', description: 'Second parameter' },
    },
    required: ['param1'],
  },
  readonly: true, // 或 false
  execute: async (args) => {
    const { param1, param2 } = args;
    // 实现工具逻辑
    return { result: 'success' };
  },
};

// 注册到 agent
agent.addTool(myCustomTool);
```

### 9.2 添加自定义 LLM 提供者

```typescript
import { LLMProvider, ProviderConfig } from './types/llm-provider.js';

export class MyProvider implements LLMProvider {
  name = 'my-provider';

  constructor(private config: ProviderConfig) {}

  async chatCompletion(messages, options) {
    // 实现 API 调用
  }

  async streamingChatCompletion(messages, options) {
    // 实现流式调用
  }

  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }
}

// 在 factory 中注册
// providers/provider-factory.ts
case 'my-provider':
  return new MyProvider(config);
```

---

## 10. 版本历史

| 版本  | 日期    | 主要变更                                       |
| ----- | ------- | ---------------------------------------------- |
| 2.0.0 | 2026-05 | 升级到 DeepSeek V4；新增推理引擎；改进安全机制 |
| 1.x.x | 之前    | 初始版本，基于 DeepSeek Chat API               |

---

## 附录：核心类型定义

```typescript
// 权限模式
type PermissionMode = 'readonly' | 'approve' | 'auto';

// 推理级别
type ReasoningEffort = 'high' | 'max';

// 消息类型
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
```

---

_Built with 🍏 by [guoqinchen](https://github.com/guoqinchen)_
