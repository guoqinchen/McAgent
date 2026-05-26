# CLAUDE.md — for AI agents working on this codebase

## Project

**McAgent** — CLI macOS AI assistant powered by DeepSeek. TypeScript, ES2022, strict mode.

## Architecture

```
src/
├── types/                  # Core type definitions
│   ├── tool.ts             Tool interface
│   ├── config.ts           McAgentConfig, PermissionMode
│   ├── events.ts           McAgentEvents, Message
│   └── llm-provider.ts     LLMProvider interface, ChatCompletionMessage
├── shell/
│   └── executor.ts         ShellExecutor interface + RealShellExecutor
├── agent/
│   ├── core.ts → agent.ts  Main agent class (orchestration + events)
│   └── conversation.ts     ConversationHistory (message management + eviction)
├── providers/              # LLM providers (v2.x)
│   ├── deepseek-provider.ts DeepSeek API provider
│   ├── openai-provider.ts   OpenAI API provider
│   └── provider-factory.ts  Provider factory
├── tools/                  # Tool system (v2.x)
│   ├── tool-registry.ts     Tool registration & categorization
│   └── enhanced-tool-executor.ts Tool execution with caching & rate limiting
├── engine/                 # Reasoning & error handling (v2.x)
│   ├── reasoning-engine.ts  Adaptive reasoning strategies
│   └── error-recovery-engine.ts Error recovery mechanisms
├── session/                # Session management (v2.x)
│   └── session-manager.ts   File-based session persistence
├── ui/                     # UI utilities (v2.x)
│   ├── streaming-optimizer.ts Streaming output optimization
│   └── markdown-renderer.ts   Markdown rendering
├── logging/                # Logging system (v2.x)
│   └── structured-logger.ts Multi-handler logging (console + file)
├── monitoring/             # Performance monitoring (v2.x)
│   ├── metrics-collector.ts Performance metrics collection
│   └── performance-reporter.ts Performance reporting
├── security/               # Security (v2.x)
│   └── permission-manager.ts Fine-grained permission system
├── tools.ts                8 base tools (run_command + diagnostics)
├── tools-extended.ts       8 extended tools (write, edit, clipboard, etc.)
├── tools-pro.ts            4 pro diagnostic tools (network, security, power)
├── context-manager.ts      Token estimation + message eviction
├── cli.tsx                 Ink/React TUI
├── headless.ts             Readline headless CLI
└── __tests__/              4 files, 100 tests, Vitest
```

## Key Types

| Type                    | File                              | Description                                             |
| ----------------------- | --------------------------------- | ------------------------------------------------------- |
| `Tool`                  | `types/tool.ts`                   | `{ name, description, parameters, execute, readonly? }` |
| `McAgentConfig`         | `types/config.ts`                 | Config object for `createMacOSAgent()`                  |
| `PermissionMode`        | `types/config.ts`                 | `'readonly' \| 'approve' \| 'auto'`                     |
| `McAgentEvents`         | `types/events.ts`                 | Event map for EventEmitter                              |
| `ShellExecutor`         | `shell/executor.ts`               | Interface for shell command execution                   |
| `LLMProvider`           | `types/llm-provider.ts`           | Unified interface for LLM backends                      |
| `ChatCompletionMessage` | `types/llm-provider.ts`           | Message format for chat completions                     |
| `ToolRegistry`          | `tools/tool-registry.ts`          | Tool registration and categorization                    |
| `ReasoningEngine`       | `engine/reasoning-engine.ts`      | Adaptive reasoning strategy selector                    |
| `ErrorRecoveryEngine`   | `engine/error-recovery-engine.ts` | Error recovery strategy handler                         |
| `SessionManager`        | `session/session-manager.ts`      | Session persistence manager                             |
| `StructuredLogger`      | `logging/structured-logger.ts`    | Multi-handler logging system                            |
| `MetricsCollector`      | `monitoring/metrics-collector.ts` | Performance metrics collection                          |
| `PermissionManager`     | `security/permission-manager.ts`  | Fine-grained permission control                         |

All types are re-exported from `agent.ts` with their legacy names (`MacOSAgentConfig`, `MacOSAgentEvents`) for backward compatibility.

## Agent Architecture

```
send(content) / sendSync(content)
  └─ ConversationHistory.addUserMessage()
  └─ runLoop(sync)
       └─ ConversationHistory.getMessagesWithSystem()  [with auto-eviction]
       └─ OpenAI API call (streaming or sync)
       └─ ConversationHistory.addAssistantMessage()
       └─ executeToolCalls()
            └─ ConversationHistory.addToolResult()
```

## Commands

```bash
npm start              # TUI
npm run start:headless # Headless CLI
npm test               # 100 tests across 4 files
npm run lint           # ESLint
npm run format         # Prettier
```

## Environment

**DeepSeek Configuration:**

- `DEEPSEEK_API_KEY` (required)
- `DEEPSEEK_MODEL` (default: `deepseek-v4-flash`)
- `DEEPSEEK_BASE_URL` (default: `https://api.deepseek.com`)
- `DEEPSEEK_THINKING_ENABLED` (default: `true`)
- `DEEPSEEK_REASONING_EFFORT` (default: `high`; for complex tasks: `max`)
- `DEEPSEEK_MAX_TOKENS` (default: `1048576`)

**Multi-Provider Configuration (v2.x):**

- `LLM_PROVIDER` (default: `deepseek`; options: `deepseek`, `openai`)
- `OPENAI_API_KEY` (required when `LLM_PROVIDER=openai`)
- `OPENAI_BASE_URL` (default: `https://api.openai.com`)

## Conventions

- Shell execution: use `defaultExecutor.run(cmd, timeout?)` from `shell/executor.ts`
- All tools import `Tool` from `types/tool.js`, NOT from `agent.js`
- Dangerous commands blocked by `checkCommand()` in `tools.ts` (14 patterns)
- File paths restricted to `$HOME` via `safePath()`
- User docs: `README.md`, `INSTALL.md`, `CONFIG.md`, `USAGE.md`
- LLM providers implement `LLMProvider` interface from `types/llm-provider.ts`
- Tools are registered via `ToolRegistry` in `tools/tool-registry.ts`
- Use `StructuredLogger` from `logging/structured-logger.ts` for logging
- Use `MetricsCollector` from `monitoring/metrics-collector.ts` for metrics
- Permission checks via `PermissionManager` from `security/permission-manager.ts`
