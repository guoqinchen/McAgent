# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

McAgent — a TypeScript CLI app that wraps DeepSeek's API (OpenAI-compatible) with macOS-specific tools. The agent can execute shell commands, inspect system state, and answer macOS questions. Two interfaces: an Ink/React TUI and a headless readline CLI.

## Commands

```bash
# TUI mode (interactive Ink/React terminal UI)
npm start                    # or: tsx src/cli.tsx

# Headless mode (plain text readline loop)
npm run start:headless       # or: tsx src/headless.ts

# Dev (auto-reload on file changes)
npm run dev                  # or: tsx watch src/cli.tsx

# Run tests
npm test                     # or: vitest run
npm run test:watch           # or: vitest

# Lint & format
npm run lint                 # or: eslint src/
npm run lint:fix             # fix auto-fixable lint issues
npm run format               # or: prettier --write "src/**/*.ts"
```

## Environment

- `DEEPSEEK_API_KEY` (required) — DeepSeek API key
- `DEEPSEEK_MODEL` (optional, default: `deepseek-chat`)
- `DEEPSEEK_BASE_URL` (optional, default: `https://api.deepseek.com/v1`)

## Architecture

```
agent.ts          Core — stateless conversation loop + tool execution
tools.ts          macOS tool definitions (shell exec, system info, etc.)
cli.tsx           Ink TUI — subscribes to agent events, renders React components
headless.ts       Plain text CLI — subscribes to agent events, writes to stdout
```

### Agent core (`src/agent.ts`)

`MacOSAgent` extends `EventEmitter3` and emits typed events: `stream:delta`, `tool:call`, `tool:result`, `reasoning:delta`, `thinking:start/end`, `message:assistant`, `message:user`, `stream:end`, `error`.

Key design decisions:
- Tools are defined by the `Tool` interface (name, description, JSON Schema parameters, async execute function) and registered in a `Map<string, Tool>`.
- `send()` runs a streaming loop with up to `maxToolRounds` (default 10) iterations — model response → execute tools → feed tool results back → repeat until the model produces text without tool calls.
- `sendSync()` does the same with non-streaming API calls.
- System instructions are prepended to every API call (not stored in conversation history), so they can be changed at any time via `setInstructions()`.
- The agent stores `ChatCompletionMessageParam[]` internally; `getMessages()` returns a simplified `Message[]` copy for UIs.
- DeepSeek-specific `reasoning_content` (for R1/reasoner models) is captured and emitted as `reasoning:delta`.

### Tools (`src/tools.ts`)

All tools use `execSync` with a 30s timeout and 1MB buffer. The `run()` helper catches errors and returns stderr/stdout as a string. Tools defined in `macOSDefaultTools`:

| Tool | What it does |
|---|---|
| `run_command` | Arbitrary shell command execution |
| `get_system_info` | OS version, hardware, memory pressure, disk usage |
| `list_processes` | `ps` with filtering and sorting by cpu/mem/name |
| `disk_usage` | `df` + `du` on a given path |
| `get_network_info` | interfaces, Wi-Fi, listening ports, DNS |
| `find_files` | `mdfind` (Spotlight) or `find` with result limit |
| `read_file` | `cat` or `tail -n` with file metadata |

### TUI (`src/cli.tsx`)

Ink 5 + React 18. Components:
- `ChatMessage` — renders a single message (user cyan, assistant green)
- `ToolCallLine` — yellow tool call display with truncated args
- `InputField` — captures keyboard input via `useInput`, shows cursor
- `StreamingText` — live-updating assistant response with blinking indicator
- `App` — wires agent events to React state (`useState` + `useEffect`)

The TUI subscribes to agent events in a `useEffect` and updates state accordingly. Escape or Ctrl+C exits.

### Headless (`src/headless.ts`)

Readline loop that calls `agent.send()` on each input line. Events are printed directly to stdout with ANSI color codes. Type `exit` or `quit` to stop.

## Tool execution safety

`run_command` has a programmatic safety gate (`checkCommand()` in `tools.ts`). Before execution, the command string is matched against a list of dangerous patterns. Matches return `{ blocked: true, reason }` without executing. Blocked categories: `rm -rf/r`, `rmdir`, `dd`, `mkfs`/`newfs`, `diskutil erase*`, `sudo`, `csrutil disable`, `nvram -d`, `launchctl unload/remove`, `curl|sh`. To add a pattern, append to the `DANGEROUS_PATTERNS` array.
