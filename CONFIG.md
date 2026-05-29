# McAgent Configuration Guide / 配置参考

---

<a name="english"></a>

## 🔧 Configuration

McAgent supports three configuration layers (highest priority first):

```
Environment Variables  >  ~/.mcagent/config.yaml  >  Built-in Defaults
```

### Quick Setup

Run the interactive wizard to generate a config file:

```bash
npm run init
```

This saves `~/.mcagent/config.yaml`. You can edit it manually at any time.

### YAML Configuration File

`~/.mcagent/config.yaml` example:

```yaml
model: deepseek-v4-flash
thinking:
  enabled: true
  reasoningEffort: high
permission:
  mode: approve
  autoAllowlist: [git, npm, brew, ls, cat, find]
context:
  maxTokens: 96000
```

Environment variables override any YAML value.

### Environment Variables

McAgent also accepts these environment variables:

| Variable                    | Required    | Default                    | Description                                                                           |
| --------------------------- | ----------- | -------------------------- | ------------------------------------------------------------------------------------- |
| `DEEPSEEK_API_KEY`          | **Yes**     | —                          | DeepSeek API key from [platform.deepseek.com](https://platform.deepseek.com/api-docs) |
| `DEEPSEEK_MODEL`            | No          | `deepseek-v4-flash`        | Model ID (e.g., `deepseek-v4-flash`, `deepseek-v4-pro`)                               |
| `DEEPSEEK_BASE_URL`         | No          | `https://api.deepseek.com` | API base URL (for self-hosted / proxies)                                              |
| `DEEPSEEK_THINKING_ENABLED` | No          | `true`                     | Enable thinking mode for better reasoning                                             |
| `DEEPSEEK_REASONING_EFFORT` | No          | `high`                     | Reasoning effort level (`low`, `medium`, `high`, `max`)                               |
| `DEEPSEEK_MAX_TOKENS`       | No          | `1048576`                  | Maximum tokens per response                                                           |
| `LLM_PROVIDER`              | No          | `deepseek`                 | LLM provider (`deepseek`, `openai`)                                                   |
| `OPENAI_API_KEY`            | Conditional | —                          | OpenAI API key (required if using `openai` provider)                                  |
| `OPENAI_BASE_URL`           | No          | `https://api.openai.com`   | OpenAI API base URL                                                                   |

Example `.env` file:

```bash
# DeepSeek configuration
DEEPSEEK_API_KEY=sk-your-key-here
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_THINKING_ENABLED=true
DEEPSEEK_REASONING_EFFORT=high
# DEEPSEEK_BASE_URL=https://api.deepseek.com

# Alternative provider configuration
# LLM_PROVIDER=openai
# OPENAI_API_KEY=sk-your-openai-key-here
```

### Programmatic Configuration

When creating an agent instance, pass a `MacOSAgentConfig` object:

```typescript
const agent = createMacOSAgent({
  apiKey: 'sk-...',
  model: 'deepseek-v4-flash',
  instructions: 'You are a macOS expert...',
  tools: [...macOSDefaultTools, ...macOSExtendedTools],
  maxToolRounds: 10,
  maxContextTokens: 1048576,
  permissionMode: 'approve',
  autoAllowlist: ['git', 'brew', 'npm', 'ls', 'cat', 'echo'],
});
```

#### Config Options

| Option             | Type       | Default                                                  | Description                                                        |
| ------------------ | ---------- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| `apiKey`           | `string`   | —                                                        | DeepSeek API key (required)                                        |
| `baseURL`          | `string`   | `https://api.deepseek.com`                               | API base URL                                                       |
| `model`            | `string`   | `deepseek-v4-flash`                                      | OpenAI-compatible model ID                                         |
| `provider`         | `string`   | `'deepseek'`                                             | LLM provider: `'deepseek'` / `'openai'`                            |
| `instructions`     | `string`   | _(macOS expert prompt)_                                  | System prompt for the agent                                        |
| `tools`            | `Tool[]`   | `[]`                                                     | Array of tool definitions                                          |
| `maxToolRounds`    | `number`   | `10`                                                     | Max tool-calling iterations per message                            |
| `maxContextTokens` | `number`   | `1048576`                                                | Context window limit (0 = disabled)                                |
| `permissionMode`   | `string`   | `'approve'`                                              | Permission mode: `'readonly'` / `'approve'` / `'auto'`             |
| `autoAllowlist`    | `string[]` | `['git','npm','brew','ls','cat','echo','mkdir','touch']` | Commands that bypass safety check in `approve` mode                |
| `thinkingEnabled`  | `boolean`  | `true`                                                   | Enable thinking mode for better reasoning                          |
| `reasoningEffort`  | `string`   | `'high'`                                                 | Reasoning effort level                                             |
| `streamingEnabled` | `boolean`  | `true`                                                   | Enable streaming output                                            |
| `logLevel`         | `string`   | `'info'`                                                 | Log level: `'trace'` / `'debug'` / `'info'` / `'warn'` / `'error'` |

### Runtime Configuration

McAgent allows runtime changes without recreating the instance:

```typescript
// Change permission mode
agent.setPermissionMode('readonly'); // only readonly tools available
agent.setPermissionMode('auto'); // skip all safety checks
agent.setPermissionMode('approve'); // restore default safety

// Update command allowlist
agent.setAllowlist(['git', 'npm', 'brew', 'rsync']);

// Switch model
agent.setModel('deepseek-v4-pro');

// Change system instructions
agent.setInstructions('You are a macOS security expert...');

// Register a new tool
agent.addTool({
  name: 'my_tool',
  description: 'A custom tool',
  parameters: { type: 'object', properties: {} },
  execute: async (args) => {
    /* ... */
  },
});
```

### Permission Modes

| Mode       | Description                                 |   `run_command`   | Write tools | Read-only tools |
| ---------- | ------------------------------------------- | :---------------: | :---------: | :-------------: |
| `readonly` | Only read-only tools available              |        ❌         |     ❌      |       ✅        |
| `approve`  | Commands checked against dangerous patterns |   ✅ (filtered)   |     ✅      |       ✅        |
| `auto`     | All commands allowed without safety checks  | ✅ (unrestricted) |     ✅      |       ✅        |

---

<a name="chinese"></a>

## 🔧 配置参考

### 环境变量

McAgent 主要通过环境变量配置：

| 变量                        | 必填   | 默认值                     | 说明                                                                             |
| --------------------------- | ------ | -------------------------- | -------------------------------------------------------------------------------- |
| `DEEPSEEK_API_KEY`          | **是** | —                          | 来自 [platform.deepseek.com](https://platform.deepseek.com/api-docs) 的 API 密钥 |
| `DEEPSEEK_MODEL`            | 否     | `deepseek-v4-flash`        | 模型 ID（如 `deepseek-v4-flash`、`deepseek-v4-pro`）                             |
| `DEEPSEEK_BASE_URL`         | 否     | `https://api.deepseek.com` | API 基础 URL（自托管/代理时使用）                                                |
| `DEEPSEEK_THINKING_ENABLED` | 否     | `true`                     | 启用思考模式以获得更好的推理                                                     |
| `DEEPSEEK_REASONING_EFFORT` | 否     | `high`                     | 推理努力级别（`low`、`medium`、`high`、`max`）                                   |
| `DEEPSEEK_MAX_TOKENS`       | 否     | `1048576`                  | 最大响应令牌数                                                                   |
| `LLM_PROVIDER`              | 否     | `deepseek`                 | LLM 提供商（`deepseek`、`openai`）                                               |
| `OPENAI_API_KEY`            | 条件   | —                          | OpenAI API 密钥（使用 `openai` 提供商时必填）                                    |
| `OPENAI_BASE_URL`           | 否     | `https://api.openai.com`   | OpenAI API 基础 URL                                                              |

`.env` 文件示例：

```bash
DEEPSEEK_API_KEY=sk-your-key-here
DEEPSEEK_MODEL=deepseek-v4-flash
# DEEPSEEK_BASE_URL=https://api.deepseek.com
```

### 编程配置

创建 Agent 实例时传入 `MacOSAgentConfig` 对象：

```typescript
const agent = createMacOSAgent({
  apiKey: 'sk-...',
  model: 'deepseek-v4-flash',
  instructions: 'You are a macOS expert...',
  tools: [...macOSDefaultTools, ...macOSExtendedTools],
  maxToolRounds: 10,
  maxContextTokens: 1048576,
  permissionMode: 'approve',
  autoAllowlist: ['git', 'brew', 'npm', 'ls', 'cat', 'echo'],
});
```

#### 配置选项

| 选项               | 类型       | 默认值                                                   | 说明                                                              |
| ------------------ | ---------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| `apiKey`           | `string`   | —                                                        | DeepSeek API 密钥（必填）                                         |
| `baseURL`          | `string`   | `https://api.deepseek.com`                               | API 基础 URL                                                      |
| `model`            | `string`   | `deepseek-v4-flash`                                      | OpenAI 兼容的模型 ID                                              |
| `provider`         | `string`   | `'deepseek'`                                             | LLM 提供商：`'deepseek'` / `'openai'`                             |
| `instructions`     | `string`   | _(macOS expert prompt)_                                  | 系统提示词                                                        |
| `tools`            | `Tool[]`   | `[]`                                                     | 工具定义数组                                                      |
| `maxToolRounds`    | `number`   | `10`                                                     | 每条消息最大工具调用轮次                                          |
| `maxContextTokens` | `number`   | `1048576`                                                | 上下文窗口限制（0 = 禁用）                                        |
| `permissionMode`   | `string`   | `'approve'`                                              | 权限模式：`'readonly'` / `'approve'` / `'auto'`                   |
| `autoAllowlist`    | `string[]` | `['git','npm','brew','ls','cat','echo','mkdir','touch']` | 允许绕过安全检查的命令前缀                                        |
| `thinkingEnabled`  | `boolean`  | `true`                                                   | 启用思考模式以获得更好的推理                                      |
| `reasoningEffort`  | `string`   | `'high'`                                                 | 推理努力级别                                                      |
| `streamingEnabled` | `boolean`  | `true`                                                   | 启用流式输出                                                      |
| `logLevel`         | `string`   | `'info'`                                                 | 日志级别：`'trace'` / `'debug'` / `'info'` / `'warn'` / `'error'` |

### 运行时配置

McAgent 支持运行时动态调整，无需重建实例：

```typescript
// 更改权限模式
agent.setPermissionMode('readonly'); // 仅只读工具可用
agent.setPermissionMode('auto'); // 跳过所有安全检查
agent.setPermissionMode('approve'); // 恢复默认安全模式

// 更新命令白名单
agent.setAllowlist(['git', 'npm', 'brew', 'rsync']);

// 切换模型
agent.setModel('deepseek-v4-pro');

// 更改系统指令
agent.setInstructions('You are a macOS security expert...');

// 注册新工具
agent.addTool({
  name: 'my_tool',
  description: 'A custom tool',
  parameters: { type: 'object', properties: {} },
  execute: async (args) => {
    /* ... */
  },
});
```

### 权限模式

| 模式       | 说明                         | `run_command` | 写入工具 | 只读工具 |
| ---------- | ---------------------------- | :-----------: | :------: | :------: |
| `readonly` | 仅只读工具可用               |      ❌       |    ❌    |    ✅    |
| `approve`  | 命令经过危险模式检测         | ✅（过滤后）  |    ✅    |    ✅    |
| `auto`     | 所有命令不经安全检查直接执行 |  ✅（无限）   |    ✅    |    ✅    |

---

## 📝 Scripts / 脚本命令

```bash
npm run init           # Interactive setup wizard / 交互式配置向导
npm start              # Launch TUI / 启动 TUI 界面
npm run start:headless # Launch headless CLI / 启动纯文本模式
npm run dev            # Auto-reload development / 开发模式（自动重载）
npm test               # Run tests / 运行测试
npm run lint           # Lint source / 代码检查
npm run format         # Format source / 代码格式化
```
