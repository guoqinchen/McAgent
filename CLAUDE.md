# CLAUDE.md — for AI agents working on this codebase

## Project

**McAgent** — CLI macOS AI assistant powered by DeepSeek. TypeScript, ES2022, strict mode.

## Architecture

```
agent.ts              Core loop + EventEmitter events
tools.ts              8 base tools (run_command + read-only diagnostics)
tools-extended.ts     8 extended tools (write, edit, clipboard, etc.)
tools-pro.ts          4 pro diagnostic tools (network, security, power)
context-manager.ts    Token estimation + message eviction
cli.tsx               Ink/React TUI
headless.ts           Readline headless CLI
__tests__/            4 files, 99 tests, Vitest
```

## Key types

- `Tool` — `{ name, description, parameters, execute, readonly? }`
- `MacOSAgentConfig` — config object for `createMacOSAgent()`
- `PermissionMode` — `'readonly' | 'approve' | 'auto'`
- `MacOSAgent` — extends `EventEmitter3`, emits `stream:delta`, `tool:call`, `tool:result`, `reasoning:delta`, `error`, etc.

## Commands

```bash
npm start              # TUI
npm run start:headless # Headless CLI
npm test               # 99 tests
npm run lint           # ESLint
npm run format         # Prettier
```

## Environment

- `DEEPSEEK_API_KEY` (required)
- `DEEPSEEK_MODEL` (default: `deepseek-chat`)
- `DEEPSEEK_BASE_URL` (default: `https://api.deepseek.com/v1`)

## Conventions

- All tools use `execSync` with 30s timeout, 1MB buffer
- Dangerous commands blocked by `checkCommand()` in `tools.ts` (14 patterns)
- File paths restricted to `$HOME` via `safePath()`
- User docs: `README.md`, `INSTALL.md`, `CONFIG.md`, `USAGE.md`
