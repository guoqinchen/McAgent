# CLAUDE.md — for AI agents working on this codebase

## Project

**McAgent** — CLI macOS AI assistant powered by DeepSeek. TypeScript, ES2022, strict mode.

## Architecture

```
src/
├── agent/
│   ├── conversation.ts       ConversationHistory (message management + eviction)
│   ├── llm-client.ts         LLMClient wrapper with error recovery
│   ├── tool-accumulator.ts   ToolCallAccumulator (streaming tool call assembly)
│   └── tool-executor.ts      ToolExecutor (tool invocation + metrics)
├── engine/
│   └── error-recovery-engine.ts ErrorRecoveryEngine with retry/fallback/skip/abort/escalate
├── logging/
│   └── structured-logger.ts  Multi-handler logging (console + file, JSON structured)
├── monitoring/
│   └── metrics-collector.ts  Performance metrics collection (latency, tokens, errors)
├── shell/
│   └── executor.ts           ShellExecutor interface + RealShellExecutor
├── types/
│   ├── config.ts             McAgentConfig, PermissionMode
│   ├── events.ts             McAgentEvents, Message
│   ├── llm-provider.ts       CompletionResponse, CompletionStream types
│   └── tool.ts               Tool interface
├── ui/
│   ├── ansi-theme.ts         ANSI color theme for headless CLI
│   ├── components/
│   │   ├── markdown-renderer.tsx Terminal-friendly Markdown rendering
│   │   └── message-list.tsx      Scrollable message display component
│   └── hooks/
│       ├── use-line-editor.ts      Emacs/readline-style line editing
│       ├── use-scroll-manager.ts   Scroll viewport state management
│       ├── use-streaming-agent.ts  Agent event wiring with 60fps debounce
│       └── use-theme.ts            Light/dark terminal theme detection
├── agent.ts                 Main MacOSAgent class (orchestration + events)
├── cli.tsx                  Ink/React TUI
├── headless.ts              Readline headless CLI
├── context-manager.ts       Token estimation + message eviction
├── tools.ts                 8 base tools (run_command + diagnostics)
├── tools-extended.ts        8 extended tools (write, edit, clipboard, etc.)
├── tools-pro.ts             4 pro diagnostic tools (network, security, power)
└── __tests__/               Unit tests + benchmarks
```

## Key Types

| Type                    | File                              | Description                                             |
| ----------------------- | --------------------------------- | ------------------------------------------------------- |
| `Tool`                  | `types/tool.ts`                   | `{ name, description, parameters, execute, readonly? }` |
| `McAgentConfig`         | `types/config.ts`                 | Config object for `createMacOSAgent()`                  |
| `PermissionMode`        | `types/config.ts`                 | `'readonly' \| 'approve' \| 'auto'`                     |
| `McAgentEvents`         | `types/events.ts`                 | Event map for EventEmitter                              |
| `ShellExecutor`         | `shell/executor.ts`               | Interface for shell command execution                   |
| `ConversationHistory`   | `agent/conversation.ts`           | Message history storage with auto-eviction              |
| `LLMClient`             | `agent/llm-client.ts`             | OpenAI SDK wrapper with error recovery                  |
| `ToolExecutor`          | `agent/tool-executor.ts`          | Tool invocation with metrics tracking                   |
| `ErrorRecoveryEngine`   | `engine/error-recovery-engine.ts` | Error classification + retry/fallback strategies        |
| `StructuredLogger`      | `logging/structured-logger.ts`    | Multi-handler structured logging system                 |
| `MetricsCollector`      | `monitoring/metrics-collector.ts` | Performance metrics collector (latency, tokens, errors) |

All types are re-exported from `agent.ts` with their legacy names (`MacOSAgentConfig`, `MacOSAgentEvents`) for backward compatibility.

## Agent Architecture

```
send(content) / sendSync(content)
  └─ ConversationHistory.addUserMessage()
  └─ runLoop(sync)
       ├─ ConversationHistory.evictIfNeeded()  [explicit eviction]
       ├─ ConversationHistory.getMessagesWithSystem()
       ├─ LLMClient.createSync() or createStream()
       ├─ ConversationHistory.addAssistantMessage()
       └─ executeToolCalls()
            ├─ ToolExecutor.executeAll()
            └─ ConversationHistory.addToolResult()
```

## Commands

```bash
npm start              # TUI
npm run start:headless # Headless CLI
npm test               # Run unit tests + benchmarks (Vitest)
npm run lint           # ESLint
npm run format         # Prettier
npm run build          # TypeScript compilation
```

## Environment

- `DEEPSEEK_API_KEY` (required)
- `DEEPSEEK_MODEL` (default: `deepseek-v4-flash`)
- `DEEPSEEK_BASE_URL` (default: `https://api.deepseek.com`)
- `DEEPSEEK_THINKING_ENABLED` (default: `true`)
- `DEEPSEEK_REASONING_EFFORT` (default: `high`; for complex tasks: `max`)
- `DEEPSEEK_MAX_TOKENS` (default: `1048576`)

## Conventions

- Shell execution: use `defaultExecutor.run(cmd, timeout?)` from `shell/executor.ts`
- All tools import `Tool` from `types/tool.js`, NOT from `agent.js`
- Dangerous commands blocked by `checkCommand()` in `tools.ts` (14 patterns)
- File paths restricted to `$HOME` via `safePath()`
- Use `StructuredLogger` from `logging/structured-logger.ts` for logging
- Use `MetricsCollector` from `monitoring/metrics-collector.ts` for metrics
- Use `ErrorRecoveryEngine` from `engine/error-recovery-engine.ts` for retry logic
