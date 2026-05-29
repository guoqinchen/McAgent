# McAgent Installation Guide / 安装指南

---

<a name="english"></a>

## 📦 Installation

### Prerequisites

| Requirement          | Version                                                                    |
| -------------------- | -------------------------------------------------------------------------- |
| **Node.js**          | 18.x or later (LTS recommended)                                            |
| **npm**              | 9.x or later (comes with Node.js)                                          |
| **macOS**            | 13.0 (Ventura) or later                                                    |
| **DeepSeek API Key** | Get one at [platform.deepseek.com](https://platform.deepseek.com/api-docs) |

### Step-by-Step

**1. Clone the repository / 克隆仓库**

```bash
git clone https://github.com/guoqinchen/McAgent.git
cd McAgent
```

**2. Install dependencies / 安装依赖**

```bash
npm install
```

This installs the core dependencies (`openai`, `eventemitter3`) and optional TUI dependencies (`ink`, `react`). If you only plan to use the headless CLI, optional dependencies are not required.

**3. Configure your API key / 配置 API 密钥**

```bash
export DEEPSEEK_API_KEY=sk-your-key-here
```

For permanent configuration, add the key to your shell profile (`~/.zshrc`, `~/.bashrc`):

```bash
echo 'export DEEPSEEK_API_KEY=sk-your-key-here' >> ~/.zshrc
```

Or copy and edit the environment file:

```bash
cp .env.example .env
# Then edit .env with your key
```

Or use the interactive setup wizard (recommended):

```bash
npm run init
```

This walks you through model selection, thinking mode, permission mode, and more — then saves a `~/.mcagent/config.yaml` file.

**4. Verify / 验证**

```bash
npm test
```

Expected output: `100 passed` across 4 test files.

**5. Build / 编译**

```bash
npm run build
```

Verifies TypeScript compilation succeeds.

### Run for the First Time / 首次运行

```bash
# TUI mode (recommended) / TUI 模式（推荐）
npm start

# Headless mode / 纯文本模式
npm run start:headless
```

---

<a name="chinese"></a>

## 📦 安装指南

### 系统要求

| 项目                  | 最低版本                                                                |
| --------------------- | ----------------------------------------------------------------------- |
| **Node.js**           | 18.x 或更新版本（推荐 LTS）                                             |
| **npm**               | 9.x 或更新版本（随 Node.js 安装）                                       |
| **macOS**             | 13.0 (Ventura) 或更新版本                                               |
| **DeepSeek API 密钥** | 在 [platform.deepseek.com](https://platform.deepseek.com/api-docs) 获取 |

### 分步安装

**1. 克隆仓库**

```bash
git clone https://github.com/guoqinchen/McAgent.git
cd McAgent
```

**2. 安装依赖**

```bash
npm install
```

这会安装核心依赖（`openai`、`eventemitter3`）和可选的 TUI 依赖（`ink`、`react`）。如果只使用 headless CLI，可选依赖不是必须的。

**3. 配置 API 密钥**

```bash
export DEEPSEEK_API_KEY=sk-your-key-here
```

永久配置（添加到 shell 配置文件）：

```bash
echo 'export DEEPSEEK_API_KEY=sk-your-key-here' >> ~/.zshrc
```

或复制环境文件并编辑：

```bash
cp .env.example .env
# 编辑 .env 文件填入你的密钥
```

或使用交互式配置向导（推荐）：

```bash
npm run init
```

向导会引导你选择模型、启用以太模式、设置权限模式等，最终生成 `~/.mcagent/config.yaml` 配置文件。

**4. 验证安装**

```bash
npm test
```

预期输出：4 个测试文件全部通过（`100 passed`）。

**5. 编译**

```bash
npm run build
```

验证 TypeScript 编译是否成功。

### 首次运行

```bash
# TUI 模式（推荐）
npm start

# 纯文本模式
npm run start:headless
```

---

## 🐛 Troubleshooting / 故障排除

| Problem / 问题                       | Solution / 解决方案                                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `command not found: tsx`             | Run `npm install` again, or install tsx globally: `npm install -g tsx`                                |
| `DEEPSEEK_API_KEY is required`       | Set the environment variable before running (see step 3)                                              |
| `Cannot find module 'ink'`           | Optional dependency not installed. Run `npm install ink react` manually, or use headless mode instead |
| TUI display broken / 界面显示异常    | Use headless mode: `npm run start:headless`                                                           |
| Tests fail with `306 passed` expected | Make sure you're running `npm test` from the project root                                             |
| Config not being applied              | Run `npm run init` to regenerate `~/.mcagent/config.yaml`. Env vars always take precedence over file   |
