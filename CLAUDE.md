# CLAUDE.md — for AI agents working on this codebase

## Project

**McAgent** — CLI macOS AI assistant powered by DeepSeek. TypeScript, ES2022, strict mode.

## Architecture

```
src/
├── types/                  # Core type definitions
│   ├── tool.ts             Tool interface
│   ├── config.ts           McAgentConfig, PermissionMode
│   └── events.ts           McAgentEvents, Message
├── shell/
│   └── executor.ts         ShellExecutor interface + RealShellExecutor
├── agent/
│   ├── core.ts → agent.ts  Main agent class (orchestration + events)
│   └── conversation.ts     ConversationHistory (message management + eviction)
├── tools.ts                8 base tools (run_command + diagnostics)
├── tools-extended.ts       8 extended tools (write, edit, clipboard, etc.)
├── tools-pro.ts            4 pro diagnostic tools (network, security, power)
├── context-manager.ts      Token estimation + message eviction
├── cli.tsx                 Ink/React TUI
├── headless.ts             Readline headless CLI
└── __tests__/              4 files, 100 tests, Vitest
```

## Key Types

| Type | File | Description |
|------|------|-------------|
| `Tool` | `types/tool.ts` | `{ name, description, parameters, execute, readonly? }` |
| `McAgentConfig` | `types/config.ts` | Config object for `createMacOSAgent()` |
| `PermissionMode` | `types/config.ts` | `'readonly' \| 'approve' \| 'auto'` |
| `McAgentEvents` | `types/events.ts` | Event map for EventEmitter |
| `ShellExecutor` | `shell/executor.ts` | Interface for shell command execution |

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

- `DEEPSEEK_API_KEY` (required)
- `DEEPSEEK_MODEL` (default: `deepseek-chat`)
- `DEEPSEEK_BASE_URL` (default: `https://api.deepseek.com/v1`)

## Conventions

- Shell execution: use `defaultExecutor.run(cmd, timeout?)` from `shell/executor.ts`
- All tools import `Tool` from `types/tool.js`, NOT from `agent.js`
- Dangerous commands blocked by `checkCommand()` in `tools.ts` (14 patterns)
- File paths restricted to `$HOME` via `safePath()`
- User docs: `README.md`, `INSTALL.md`, `CONFIG.md`, `USAGE.md`
