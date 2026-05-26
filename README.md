<div align="center">
  <h1>🍏 McAgent</h1>
  <p><strong>CLI-first macOS AI assistant powered by DeepSeek</strong></p>
  <p>
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License">
    <img src="https://img.shields.io/badge/macOS-13.0%2B-brightgreen" alt="macOS 13.0+">
    <img src="https://img.shields.io/badge/TypeScript-5.6%2B-3178C6" alt="TypeScript">
    <img src="https://img.shields.io/badge/tests-100%20passed-brightgreen" alt="100 tests">
    <img src="https://img.shields.io/badge/version-2.0.0-blue" alt="Version 2.0.0">
  </p>
  <p>
    <a href="#english">English</a> ·
    <a href="#chinese">中文</a>
  </p>
</div>

---

<a name="english"></a>

## 📖 Overview

**McAgent** is a CLI-first macOS AI assistant that connects DeepSeek's language model to your Mac's operating system. It understands macOS internals, executes shell commands, inspects system state, and helps you troubleshoot — all from your terminal.

### Features

- **20+ built-in tools** — system info, process management, disk analysis, network diagnostics, unified logging, security auditing, power management, and more
- **Two interfaces** — Ink/React TUI (interactive) and headless CLI (scriptable)
- **Safety-first** — 14-class dangerous command detection, path-scoped write restrictions, configurable permission modes
- **Context-aware** — automatic message eviction prevents context window overflow
- **Extensible** — simple `Tool` interface for adding custom tools
- **DeepSeek-powered** — supports streaming, reasoning (R1), and configurable models

### Tools Overview

| Category           | Tools                                                          |
| ------------------ | -------------------------------------------------------------- |
| **System**         | `get_system_info`, `system_diagnostics`, `system_logs`         |
| **Process**        | `list_processes`, `power_management`                           |
| **Disk**           | `disk_usage`, `read_file`, `write_file`, `edit_file`           |
| **Network**        | `get_network_info`, `network_diagnostics`                      |
| **Security**       | `security_check`, `software_update`                            |
| **File**           | `find_files`, `screenshot`                                     |
| **System Control** | `run_command`, `open_app`, `clipboard`, `brew_info`, `battery` |

---

<a name="chinese"></a>

## 📖 项目简介

**McAgent** 是一款 CLI 优先的 macOS AI 助手，将 DeepSeek 语言模型与你的 Mac 操作系统深度集成。它理解 macOS 内部机制，可执行 shell 命令、检查系统状态、帮助排错——全都在终端中完成。

### 功能特性

- **20+ 内置工具** — 系统信息、进程管理、磁盘分析、网络诊断、统一日志、安全审计、电源管理等
- **双界面** — Ink/React TUI（交互式）和 headless CLI（可脚本化）
- **安全优先** — 14 类危险命令检测、路径限定写权限、可配置权限模式
- **上下文感知** — 自动消息驱逐防止上下文窗口溢出
- **可扩展** — 简洁的 `Tool` 接口支持添加自定义工具
- **DeepSeek 驱动** — 支持流式输出、推理能力 (R1)、可配置模型

### 工具概览

| 类别         | 工具                                                           |
| ------------ | -------------------------------------------------------------- |
| **系统**     | `get_system_info`, `system_diagnostics`, `system_logs`         |
| **进程**     | `list_processes`, `power_management`                           |
| **磁盘**     | `disk_usage`, `read_file`, `write_file`, `edit_file`           |
| **网络**     | `get_network_info`, `network_diagnostics`                      |
| **安全**     | `security_check`, `software_update`                            |
| **文件**     | `find_files`, `screenshot`                                     |
| **系统控制** | `run_command`, `open_app`, `clipboard`, `brew_info`, `battery` |

---

## 🚀 Quick Start / 快速开始

```bash
# Prerequisites / 前提条件
# Node.js 18+ and a DeepSeek API key
# Node.js 18+ 和 DeepSeek API 密钥

# Install / 安装
git clone https://github.com/guoqinchen/McAgent.git
cd McAgent
npm install

# Configure / 配置
export DEEPSEEK_API_KEY=sk-your-key-here

# Launch TUI / 启动 TUI 界面
npm start

# Or headless mode / 或纯文本模式
npm run start:headless
```

---

## 📚 Documentation / 文档

| Doc                      | Description                             |
| ------------------------ | --------------------------------------- |
| [INSTALL.md](INSTALL.md) | Installation guide / 安装指南           |
| [CONFIG.md](CONFIG.md)   | Configuration reference / 配置参考      |
| [USAGE.md](USAGE.md)     | Usage guide & tool reference / 使用指南 |

---

## 🧪 Test Suite / 测试套件

```bash
npm test            # 99 tests across 4 files
npm run test:watch  # Watch mode / 监听模式
npm run lint        # ESLint / 代码检查
npm run format      # Prettier / 格式化
```

---

## 🏗 Architecture / 架构

```
src/
├── agent.ts                 # Core — conversation loop + tool execution
├── tools.ts                 # 8 base macOS tools (run_command, system_info, etc.)
├── tools-extended.ts        # 8 extended tools (write_file, clipboard, etc.)
├── tools-pro.ts             # 4 pro diagnostic tools (network, security, etc.)
├── context-manager.ts       # Context window management (token estimation + eviction)
├── cli.tsx                  # Ink/React TUI
├── headless.ts              # Readline headless CLI
├── agent/                   # Agent submodules
│   ├── conversation.ts       # Conversation history management
│   ├── llm-client.ts         # OpenAI SDK wrapper with error recovery
│   └── tool-executor.ts      # Tool execution with metrics
├── engine/
│   └── error-recovery-engine.ts # Error recovery with retry & fallback
├── shell/
│   └── executor.ts           # Shell execution abstraction
├── logging/
│   └── structured-logger.ts  # Multi-handler logging
├── monitoring/
│   └── metrics-collector.ts  # Performance metrics collection
├── types/                    # Shared type definitions
└── __tests__/                # Vitest tests (126 tests)
```

---

## 🔒 Safety / 安全机制

| Layer                           | Description                                                        |
| ------------------------------- | ------------------------------------------------------------------ |
| **Dangerous command detection** | 14 patterns blocked: `rm -rf`, `sudo`, `dd`, disk erase, RCE pipes |
| **Path restriction**            | File writes limited to `$HOME` directory                           |
| **Permission modes**            | `readonly` / `approve` (default) / `auto` — switchable at runtime  |
| **Command allowlist**           | `git`, `brew`, `npm` etc. bypass safety gate                       |
| **Consecutive error guard**     | Breaks tool loop after 3 consecutive failures                      |

---

## 📄 License / 许可证

MIT — see [LICENSE](LICENSE).

---

<div align="center">
  <p>Built with 🍏 by <a href="https://github.com/guoqinchen">guoqinchen</a></p>
</div>
