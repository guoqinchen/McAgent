# Changelog

All notable changes to McAgent will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **CI/CD pipeline**: GitHub Actions workflow with lint, test matrix (Node 18/20/22), type-check, and benchmark regression jobs ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).
- **YAML config resolver**: `~/.mcagent/config.yaml` declarative configuration with env var override priority ([`src/config/resolver.ts`](src/config/resolver.ts)).
- **Interactive init wizard**: `npm run init` walks through model, thinking mode, permission, allowlist, and API key setup ([`src/init.ts`](src/init.ts)).
- **Tool result display (headless)**: headless CLI now shows tool execution results with preview and success indicator.

### Changed

- **CLI entry points migrated to config resolver**: `src/cli.tsx` and `src/headless.ts` now use `resolveConfig()` instead of raw env var reads — env vars remain fully backward-compatible.
- **`.reasonix/` added to `.gitignore`**: prevents internal tool artifacts from leaking into commits.

## [2.1.0] — 2026-05-27

### Added

- **Terminal UX conventions**: line editing, scrollback management, theme system, and keyboard shortcuts for improved interactive experience.
- **Error recovery engine**: configurable retry policies, backoff strategies, and recovery hooks ([`src/engine/error-recovery-engine.ts`](src/engine/error-recovery-engine.ts)).
- **Tool call accumulator**: deduplication and batching of tool calls within the agent loop ([`src/agent/tool-accumulator.ts`](src/agent/tool-accumulator.ts)).
- **Cancellation support**: abort controller integration for interruptible agent runs.
- **Metrics collector**: instrumentation for agent performance monitoring ([`src/monitoring/metrics-collector.ts`](src/monitoring/metrics-collector.ts)).
- **Structured logger**: JSON-format logger for machine-parseable agent traces ([`src/logging/structured-logger.ts`](src/logging/structured-logger.ts)).
- **Shell execution guardrails**: security validation for shell commands, limiting dangerous operations.
- **Benchmark infrastructure**: baseline configs and performance test suite with vitest benchmarks.
- **`src/tools-pro.ts`** and **`src/tools-extended.ts`**: expanded tool registries with Pro-tier capabilities.
- **`src/headless.ts`**: non-interactive headless mode entry point.
- **`AGENTS.md`**: agent configuration guide for multi-agent orchestration.
- **`CODE_WIKI.md`**: comprehensive codebase wiki with architecture documentation and RCE vector analysis.
- **`docs/ui-ux-optimization-report.md`**: detailed report on UI/UX improvements.
- **Prettier + ESLint config**: project-wide formatting and linting via `.prettierrc` and `eslint.config.js`.

### Changed

- **Architecture overhaul**: split monolithic agent into modular components — `types/`, `shell/`, `agent/`, `ui/`, `engine/`, `logging/`, `monitoring/`.
- **Agent loop refactored**: extracted `ConversationHistory`, `ToolAccumulator`, `ToolExecutor` from the core agent class.
- **Conversation history**: improved caching, message validation, and preservation of unfiltered `tool_calls` in history.
- **Upgraded to DeepSeek-V4 API**: thinking mode support, strict tool calling, and 1M token context window as default across all profiles.
- **Normalized naming**: consistent use of `McAgent`/`mcagent` across all source files, docs, and package metadata.
- **Dead code removed**: cleaned up unused utilities, types, and stale implementation paths.
- **Code style**: applied Prettier and ESLint formatting across all source and test files.
- **Docs refreshed**: bilingual README, INSTALL, CONFIG, USAGE, and LICENSE updated for current architecture.
- **`src/agent/conversation.ts`**: refactored dialog history management with caching and message validation.
- **UI/UX optimization pass**: improved terminal interaction ergonomics and visual polish.

### Fixed

- **Agent hang/freeze**: resolved blocking issue via async execution model, timeout safeguards, and enhanced logging.
- **Terminal input**: fixed backspace and delete key handling in the line editor.
- **Shell execution limits**: refined security checks to prevent command injection while allowing legitimate use.
- **CODE_WIKI.md rendering**: escaped pipe characters in RCE vector table to prevent Markdown column split.
- **Performance tests**: corrected async execution and benchmark configuration in the test suite.
- **Benchmark calls**: optimized to avoid unnecessary return value allocations skewing results.
- **Two systematic bugs**: resolved via structured debugging approach.

## [2.0.0] — 2026-05-21

### Added

- Initial release of McAgent — a CLI-first macOS AI assistant powered by DeepSeek.
- 20 built-in tools covering file operations, shell execution, web search, and knowledge management.
- Context management with configurable window sizes and history trimming.
- Three permission modes: auto-approve, ask, and deny.
- Event-driven architecture via `EventEmitter3`.
- Conversation history with message deduplication and token-aware truncation.
- Streaming LLM responses with incremental tool call parsing.
- 99 unit and integration tests.
- Bilingual documentation (Chinese/English): README, INSTALL, CONFIG, USAGE, LICENSE.

[Unreleased]: https://github.com/guoqinchen/mcagent/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/guoqinchen/mcagent/releases/tag/v2.1.0
[2.0.0]: https://github.com/guoqinchen/mcagent/releases/tag/v2.0.0
