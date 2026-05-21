# McAgent Usage Guide / 使用指南

---

<a name="english"></a>
## 🎮 Getting Started

### Launching McAgent

```bash
# TUI mode — interactive terminal UI with real-time streaming
npm start

# Headless mode — simple readline prompt
npm run start:headless
```

### First Interaction

Once launched, simply type your question or task. McAgent will:

1. Analyze your request
2. Choose appropriate tools
3. Execute them and explain the results
4. Ask for confirmation before dangerous operations

```text
> show me my system info
◀ Assistant
  🔧 get_system_info()
I'll check your system information...

Here's your Mac's current state:
- OS: macOS 14.5 (23F79)
- Chip: Apple M2 Pro
- Cores: 12
- RAM: 32.0 GB
- Disk: 465 GB available of 1 TB
```

---

## 🛠 Tool Reference / 工具参考

### Base Tools (`src/tools.ts`)

| Tool | Description | Safety | Readonly |
|------|-------------|--------|:--------:|
| `run_command` | Execute any macOS shell command | ⚠️ Checked against 14 dangerous patterns | — |
| `get_system_info` | OS version, hardware, memory, disk | ✅ Read-only | ✅ |
| `list_processes` | Running processes with sorting & sampling | ✅ Read-only | ✅ |
| `disk_usage` | Volume overview or directory breakdown | ✅ Read-only | ✅ |
| `get_network_info` | Interfaces, Wi-Fi, connections, DNS | ✅ Read-only | ✅ |
| `find_files` | Spotlight (`mdfind`) or `find` search | ✅ Read-only | ✅ |
| `read_file` | Read file content with metadata | ✅ Read-only | ✅ |
| `system_logs` | Query Unified Logging (`log show/stream`) | ✅ Read-only | ✅ |

#### `system_logs` Examples / 示例

```text
# Find errors in the last 5 minutes
system_logs predicate: "eventMessage contains 'error'" last: "5m"

# Watch kernel logs live
system_logs process: "kernel" stream: true

# Debug-level logs for a specific subsystem
system_logs level: "debug" predicate: "subsystem == 'com.apple.wifi'"
```

#### `list_processes` Examples / 示例

```text
# Top 10 CPU-consuming processes
list_processes sortBy: "cpu" limit: 10

# Filter by name
list_processes filter: "chrome"

# Sample the highest-CPU process for 5 seconds
list_processes sample: 5
```

---

### Extended Tools (`src/tools-extended.ts`)

| Tool | Description | Safety | Readonly |
|------|-------------|--------|:--------:|
| `write_file` | Write content to a file | ⚠️ Path restricted to `$HOME` | — |
| `edit_file` | Literal string replacement in a file | ⚠️ Path restricted to `$HOME` | — |
| `open_app` | Launch a macOS application | ⚠️ Modifies system state | — |
| `clipboard` | Read/write system clipboard | ⚠️ Modifies clipboard state | — |
| `brew_info` | Query Homebrew packages | ✅ Read-only | ✅ |
| `software_update` | Check for macOS updates | ✅ Read-only | ✅ |
| `battery` | Battery status, cycle count, health | ✅ Read-only | ✅ |
| `screenshot` | Take a screenshot | ✅ Read-only | ✅ |

#### `battery` Examples / 示例

```text
# Check battery status
battery

# Response includes:
# - percentage: 85
# - status: "charging"
# - cycleCount: 342
# - health: "Normal"
# - maxCapacityPercent: 89
# - temperature: "32°C"
```

---

### Pro Diagnostic Tools (`src/tools-pro.ts`)

| Tool | Description | Safety | Readonly |
|------|-------------|--------|:--------:|
| `network_diagnostics` | Ping, traceroute, DNS, port check, quality test | ✅ Read-only | ✅ |
| `system_diagnostics` | Process sample, thermal, I/O, memory, sysdiagnose | ✅ Read-only | ✅ |
| `security_check` | SIP, FileVault, Gatekeeper, code signing | ✅ Read-only | ✅ |
| `power_management` | Power settings, battery health, sleep assertions | ✅ Read-only | ✅ |

#### `network_diagnostics` Examples / 示例

```text
# Ping test
network_diagnostics action: "ping" target: "google.com" count: 4

# DNS resolution
network_diagnostics action: "dns" target: "example.com"

# TCP port check
network_diagnostics action: "port" target: "github.com" port: 443

# Network quality test (takes ~30s)
network_diagnostics action: "quality"

# Traceroute path analysis
network_diagnostics action: "traceroute" target: "cloudflare.com"
```

#### `system_diagnostics` Examples / 示例

```text
# Sample a running process by PID
system_diagnostics action: "sample" pid: 1234 duration: 5

# Sample by process name
system_diagnostics action: "sample" processName: "WindowServer" duration: 3

# Thermal status (CPU temperature, fans)
system_diagnostics action: "thermal"

# Disk I/O statistics
system_diagnostics action: "disk_io"

# Memory pressure analysis
system_diagnostics action: "memory_pressure"

# Full diagnostic package (may take 2+ minutes)
system_diagnostics action: "sysdiagnose"
```

#### `security_check` Examples / 示例

```text
# Quick SIP check
security_check check: "sip"

# FileVault status
security_check check: "filevault"

# Comprehensive security overview
security_check check: "all"

# Code signing verification
security_check check: "codesign" path: "/Applications/Safari.app"
```

#### `power_management` Examples / 示例

```text
# Current power settings
power_management action: "settings"

# Detailed battery info with cycle count and health
power_management action: "battery"

# See what's preventing sleep
power_management action: "assertions"

# Recent power events log
power_management action: "log"
```

---

## 🔒 Safety Tips / 安全建议

### Understanding Permission Levels

McAgent has three permission modes:

- **`approve`** (default) — McAgent checks each command against 14 dangerous patterns. Blocked commands include `rm -rf`, `sudo`, `mkfs`, disk erase operations, and RCE vectors like `curl|sh`. Allowlisted commands (`git`, `brew`, `npm`, etc.) bypass this check.
- **`readonly`** — Only read-only tools are visible to the AI. `run_command`, `write_file`, `edit_file` are completely unavailable.
- **`auto`** — All commands execute without safety checks. For trusted environments only.

### Best Practices

1. **Review commands before approving** — McAgent asks for confirmation before executing blocked commands
2. **Use `readonly` mode for exploration** — When diagnosing issues, switch to readonly to avoid accidental changes:
   ```
   agent.setPermissionMode('readonly')
   ```
3. **Customize the allowlist** — Add safe commands to bypass repetitive prompts:
   ```
   agent.setAllowlist(['git', 'npm', 'brew', 'docker', 'kubectl'])
   ```
4. **Keep API keys secure** — Your `DEEPSEEK_API_KEY` grants access to the API. Store it in environment variables, not in code.

---

<a name="chinese"></a>
## 🎮 开始使用

### 启动 McAgent

```bash
# TUI 模式 — 交互式终端界面，支持实时流式输出
npm start

# 纯文本模式 — 简洁的 readline 提示
npm run start:headless
```

### 第一次交互

启动后，直接输入你的问题或任务。McAgent 会：

1. 分析你的请求
2. 选择合适的工具
3. 执行工具并解释结果
4. 在危险操作前请求确认

```text
> 查看我的系统信息
◀ Assistant
  🔧 get_system_info()
正在检查系统信息...

以下是你的 Mac 当前状态：
- 系统：macOS 14.5 (23F79)
- 芯片：Apple M2 Pro
- 核心：12
- 内存：32.0 GB
- 磁盘：465 GB 可用（共 1 TB）
```

---

## 🛠 工具参考

### 基础工具 (`src/tools.ts`)

| 工具 | 说明 | 安全性 | 只读 |
|------|------|--------|:----:|
| `run_command` | 执行任意 macOS shell 命令 | ⚠️ 14 类危险模式检测 | — |
| `get_system_info` | OS 版本、硬件、内存、磁盘信息 | ✅ 只读 | ✅ |
| `list_processes` | 进程列表与采样分析 | ✅ 只读 | ✅ |
| `disk_usage` | 卷概览或目录细分 | ✅ 只读 | ✅ |
| `get_network_info` | 接口、Wi-Fi、连接、DNS | ✅ 只读 | ✅ |
| `find_files` | Spotlight (`mdfind`) 或 `find` 搜索 | ✅ 只读 | ✅ |
| `read_file` | 读取文件内容及元数据 | ✅ 只读 | ✅ |
| `system_logs` | 查询统一日志 (`log show/stream`) | ✅ 只读 | ✅ |

#### `system_logs` 示例

```text
# 查找最近 5 分钟的错误
system_logs predicate: "eventMessage contains 'error'" last: "5m"

# 实时查看内核日志
system_logs process: "kernel" stream: true

# 特定子系统的调试日志
system_logs level: "debug" predicate: "subsystem == 'com.apple.wifi'"
```

#### `list_processes` 示例

```text
# CPU 占用前 10 的进程
list_processes sortBy: "cpu" limit: 10

# 按名称过滤
list_processes filter: "chrome"

# 对最高 CPU 进程采样 5 秒
list_processes sample: 5
```

---

### 扩展工具 (`src/tools-extended.ts`)

| 工具 | 说明 | 安全性 | 只读 |
|------|------|--------|:----:|
| `write_file` | 写入文件内容 | ⚠️ 路径限制在 `$HOME` | — |
| `edit_file` | 文件中的字面字符串替换 | ⚠️ 路径限制在 `$HOME` | — |
| `open_app` | 启动 macOS 应用 | ⚠️ 修改系统状态 | — |
| `clipboard` | 读写系统剪贴板 | ⚠️ 修改剪贴板 | — |
| `brew_info` | 查询 Homebrew 包 | ✅ 只读 | ✅ |
| `software_update` | 检查系统更新 | ✅ 只读 | ✅ |
| `battery` | 电池状态、循环次数、健康度 | ✅ 只读 | ✅ |
| `screenshot` | 截图 | ✅ 只读 | ✅ |

#### `battery` 示例

```text
# 检查电池状态
battery

# 返回内容：
# - percentage: 85
# - status: "charging"
# - cycleCount: 342
# - health: "Normal"
# - maxCapacityPercent: 89
# - temperature: "32°C"
```

---

### 高阶诊断工具 (`src/tools-pro.ts`)

| 工具 | 说明 | 安全性 | 只读 |
|------|------|--------|:----:|
| `network_diagnostics` | Ping、traceroute、DNS、端口检测、质量测试 | ✅ 只读 | ✅ |
| `system_diagnostics` | 进程采样、热状态、I/O、内存、系统诊断包 | ✅ 只读 | ✅ |
| `security_check` | SIP、FileVault、Gatekeeper、代码签名 | ✅ 只读 | ✅ |
| `power_management` | 电源设置、电池健康、睡眠阻止者 | ✅ 只读 | ✅ |

#### `network_diagnostics` 示例

```text
# Ping 测试
network_diagnostics action: "ping" target: "google.com" count: 4

# DNS 解析
network_diagnostics action: "dns" target: "example.com"

# TCP 端口检测
network_diagnostics action: "port" target: "github.com" port: 443

# 网络质量测试（约需 30 秒）
network_diagnostics action: "quality"

# 路由追踪
network_diagnostics action: "traceroute" target: "cloudflare.com"
```

#### `system_diagnostics` 示例

```text
# 按 PID 采样进程
system_diagnostics action: "sample" pid: 1234 duration: 5

# 按进程名采样
system_diagnostics action: "sample" processName: "WindowServer" duration: 3

# 热状态（CPU 温度、风扇）
system_diagnostics action: "thermal"

# 磁盘 I/O 统计
system_diagnostics action: "disk_io"

# 内存压力分析
system_diagnostics action: "memory_pressure"

# 完整诊断包（可能需要 2 分钟以上）
system_diagnostics action: "sysdiagnose"
```

#### `security_check` 示例

```text
# 快速 SIP 检查
security_check check: "sip"

# FileVault 状态
security_check check: "filevault"

# 全面安全概览
security_check check: "all"

# 代码签名验证
security_check check: "codesign" path: "/Applications/Safari.app"
```

#### `power_management` 示例

```text
# 当前电源设置
power_management action: "settings"

# 详细电池信息（含循环次数和健康度）
power_management action: "battery"

# 查看阻止睡眠的进程
power_management action: "assertions"

# 最近电源事件
power_management action: "log"
```

---

## 🔒 安全建议

### 理解权限级别

McAgent 有三种权限模式：

- **`approve`**（默认）— 每条命令经过 14 类危险模式检测。被拦截的命令包括 `rm -rf`、`sudo`、`mkfs`、磁盘擦除操作、`curl|sh` 等 RCE 向量。白名单命令（`git`、`brew`、`npm` 等）绕过此检查。
- **`readonly`** — 仅只读工具对 AI 可见。`run_command`、`write_file`、`edit_file` 完全不可用。
- **`auto`** — 所有命令不经安全检查直接执行。仅限受信任环境使用。

### 最佳实践

1. **批准前审查命令** — McAgent 在执行被拦截命令前会请求确认
2. **探索时使用 `readonly` 模式** — 诊断问题时切换到只读模式以避免意外变更：
   ```
   agent.setPermissionMode('readonly')
   ```
3. **自定义白名单** — 添加安全命令以减少重复提示：
   ```
   agent.setAllowlist(['git', 'npm', 'brew', 'docker', 'kubectl'])
   ```
4. **保护 API 密钥** — 你的 `DEEPSEEK_API_KEY` 授权 API 访问。存入环境变量而非代码中。

---

## 📊 Tips & Tricks / 进阶技巧

### Combining Tools / 组合工具

McAgent automatically chains tools. For example, to diagnose a slow network:

```text
1. network_diagnostics action: "quality"
2. get_network_info detail: "wifi"
3. system_logs predicate: "subsystem == 'com.apple.wifi'" last: "1h"
```

The agent will reason through this sequence itself — just describe your problem.

### Session Persistence

McAgent can save and load conversation sessions:

```typescript
// Save session to file
agent.saveSession('./sessions/debug-session.json');

// Load session later
agent.loadSession('./sessions/debug-session.json');
```

### Context Window

McAgent automatically manages context with a 96K token limit (leaving headroom for DeepSeek's 128K context). When approaching the limit, the system removes the oldest user/assistant exchanges first. You can adjust this:

```typescript
// Disable automatic eviction
const agent = createMacOSAgent({ maxContextTokens: 0 });

// Or set a custom limit
const agent = createMacOSAgent({ maxContextTokens: 64000 });

// Clear history manually
agent.clearHistory();
```

### Adding Custom Tools

Tools implement a simple interface:

```typescript
const myTool = {
  name: 'my_custom_tool',
  description: 'What this tool does',
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'First parameter' },
    },
    required: ['param1'],
  },
  readonly: true, // mark as safe for readonly mode
  execute: async ({ param1 }) => {
    // Your logic here
    return { result: 'success' };
  },
};

agent.addTool(myTool);
```

---

## 🚨 Keyboard Shortcuts / 快捷键

### TUI Mode

| Key | Action |
|-----|--------|
| `Enter` | Send message |
| `↑` / `↓` | Navigate input history |
| `Esc` | Exit |
| `Ctrl+C` | Exit |
| Backspace | Delete character |

---

<div align="center">
  <p><a href="README.md">← Back to README / 返回 README</a></p>
</div>
