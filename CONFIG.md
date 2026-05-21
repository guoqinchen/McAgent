# McAgent Configuration Guide / 配置参考

---

<a name="english"></a>
## 🔧 Configuration

### Environment Variables

McAgent is configured primarily through environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DEEPSEEK_API_KEY` | **Yes** | — | DeepSeek API key from [platform.deepseek.com](https://platform.deepseek.com/api-docs) |
| `DEEPSEEK_MODEL` | No | `deepseek-chat` | Model ID (e.g., `deepseek-chat`, `deepseek-reasoner`) |
| `DEEPSEEK_BASE_URL` | No | `https://api.deepseek.com/v1` | API base URL (for self-hosted / proxies) |

Example `.env` file:

```bash
DEEPSEEK_API_KEY=sk-your-key-here
DEEPSEEK_MODEL=deepseek-chat
# DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
```

### Programmatic Configuration

When creating an agent instance, pass a `MacOSAgentConfig` object:

```typescript
const agent = createMacOSAgent({
  apiKey: 'sk-...',
  model: 'deepseek-chat',
  instructions: 'You are a macOS expert...',
  tools: [...macOSDefaultTools, ...macOSExtendedTools],
  maxToolRounds: 10,
  maxContextTokens: 96000,
  permissionMode: 'approve',
  autoAllowlist: ['git', 'brew', 'npm', 'ls', 'cat', 'echo'],
});
```

#### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | — | DeepSeek API key (required) |
| `baseURL` | `string` | `https://api.deepseek.com/v1` | API base URL |
| `model` | `string` | `deepseek-chat` | OpenAI-compatible model ID |
| `instructions` | `string` | *(macOS expert prompt)* | System prompt for the agent |
| `tools` | `Tool[]` | `[]` | Array of tool definitions |
| `maxToolRounds` | `number` | `10` | Max tool-calling iterations per message |
| `maxContextTokens` | `number` | `96000` | Context window limit (0 = disabled) |
| `permissionMode` | `string` | `'approve'` | Permission mode: `'readonly'` / `'approve'` / `'auto'` |
| `autoAllowlist` | `string[]` | `['git','npm','brew','ls','cat','echo','mkdir','touch']` | Commands that bypass safety check in `approve` mode |

### Runtime Configuration

McAgent allows runtime changes without recreating the instance:

```typescript
// Change permission mode
agent.setPermissionMode('readonly');  // only readonly tools available
agent.setPermissionMode('auto');      // skip all safety checks
agent.setPermissionMode('approve');   // restore default safety

// Update command allowlist
agent.setAllowlist(['git', 'npm', 'brew', 'rsync']);

// Switch model
agent.setModel('deepseek-reasoner');

// Change system instructions
agent.setInstructions('You are a macOS security expert...');

// Register a new tool
agent.addTool({
  name: 'my_tool',
  description: 'A custom tool',
  parameters: { type: 'object', properties: {} },
  execute: async (args) => { /* ... */ },
});
```

### Permission Modes

| Mode | Description | `run_command` | Write tools | Read-only tools |
|------|-------------|:---:|:---:|:---:|
| `readonly` | Only read-only tools available | ❌ | ❌ | ✅ |
| `approve` | Commands checked against dangerous patterns | ✅ (filtered) | ✅ | ✅ |
| `auto` | All commands allowed without safety checks | ✅ (unrestricted) | ✅ | ✅ |

---

<a name="chinese"></a>
## 🔧 配置参考

### 环境变量

McAgent 主要通过环境变量配置：

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `DEEPSEEK_API_KEY` | **是** | — | 来自 [platform.deepseek.com](https://platform.deepseek.com/api-docs) 的 API 密钥 |
| `DEEPSEEK_MODEL` | 否 | `deepseek-chat` | 模型 ID（如 `deepseek-chat`、`deepseek-reasoner`） |
| `DEEPSEEK_BASE_URL` | 否 | `https://api.deepseek.com/v1` | API 基础 URL（自托管/代理时使用） |

`.env` 文件示例：

```bash
DEEPSEEK_API_KEY=sk-your-key-here
DEEPSEEK_MODEL=deepseek-chat
# DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
```

### 编程配置

创建 Agent 实例时传入 `MacOSAgentConfig` 对象：

```typescript
const agent = createMacOSAgent({
  apiKey: 'sk-...',
  model: 'deepseek-chat',
  instructions: 'You are a macOS expert...',
  tools: [...macOSDefaultTools, ...macOSExtendedTools],
  maxToolRounds: 10,
  maxContextTokens: 96000,
  permissionMode: 'approve',
  autoAllowlist: ['git', 'brew', 'npm', 'ls', 'cat', 'echo'],
});
```

#### 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `apiKey` | `string` | — | DeepSeek API 密钥（必填） |
| `baseURL` | `string` | `https://api.deepseek.com/v1` | API 基础 URL |
| `model` | `string` | `deepseek-chat` | OpenAI 兼容的模型 ID |
| `instructions` | `string` | *(macOS expert prompt)* | 系统提示词 |
| `tools` | `Tool[]` | `[]` | 工具定义数组 |
| `maxToolRounds` | `number` | `10` | 每条消息最大工具调用轮次 |
| `maxContextTokens` | `number` | `96000` | 上下文窗口限制（0 = 禁用） |
| `permissionMode` | `string` | `'approve'` | 权限模式：`'readonly'` / `'approve'` / `'auto'` |
| `autoAllowlist` | `string[]` | `['git','npm','brew','ls','cat','echo','mkdir','touch']` | 允许绕过安全检查的命令前缀 |

### 运行时配置

McAgent 支持运行时动态调整，无需重建实例：

```typescript
// 更改权限模式
agent.setPermissionMode('readonly');  // 仅只读工具可用
agent.setPermissionMode('auto');      // 跳过所有安全检查
agent.setPermissionMode('approve');   // 恢复默认安全模式

// 更新命令白名单
agent.setAllowlist(['git', 'npm', 'brew', 'rsync']);

// 切换模型
agent.setModel('deepseek-reasoner');

// 更改系统指令
agent.setInstructions('You are a macOS security expert...');

// 注册新工具
agent.addTool({
  name: 'my_tool',
  description: 'A custom tool',
  parameters: { type: 'object', properties: {} },
  execute: async (args) => { /* ... */ },
});
```

### 权限模式

| 模式 | 说明 | `run_command` | 写入工具 | 只读工具 |
|------|------|:---:|:---:|:---:|
| `readonly` | 仅只读工具可用 | ❌ | ❌ | ✅ |
| `approve` | 命令经过危险模式检测 | ✅（过滤后） | ✅ | ✅ |
| `auto` | 所有命令不经安全检查直接执行 | ✅（无限） | ✅ | ✅ |

---

## 📝 Scripts / 脚本命令

```bash
npm start              # Launch TUI / 启动 TUI 界面
npm run start:headless # Launch headless CLI / 启动纯文本模式
npm run dev            # Auto-reload development / 开发模式（自动重载）
npm test               # Run tests / 运行测试
npm run lint           # Lint source / 代码检查
npm run format         # Format source / 代码格式化
```
