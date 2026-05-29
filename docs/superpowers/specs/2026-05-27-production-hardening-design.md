# 方向 C：产品化打磨 — 设计文档

> 日期：2026-05-27 · 状态：待实施 · 基于：McAgent v2.1.0

## 目标

补完 McAgent 作为 CLI 工具的基础设施缺口：
1. 自动化 CI/CD
2. 声明式配置文件
3. Headless 流式交互
4. 交互式初始化向导
5. 性能基准回归检测

所有工作纯增量，不破坏现有 API。

---

## ① CI/CD 流水线 — `.github/workflows/ci.yml`

### 目标

每次 `push` 和 `pull_request` 自动运行质量门禁。

### 设计

```yaml
name: CI
on: [push, pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check

  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - run: npm ci
      - run: npm test

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npx tsc --noEmit

  bench:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npx vitest bench run --compare .benchmark-baselines/roundtrip-test-output.json
```

### 文件

| 文件 | 操作 |
|------|------|
| `.github/workflows/ci.yml` | 新增 |

---

## ② 配置文件支持 — `src/config/resolver.ts`

### 目标

提供 `~/.mcagent/config.yaml` 声明式配置，env var 覆盖优先级最高。

### 设计

```
    默认值（内置）
       ↓ 覆写
  ~/.mcagent/config.yaml
       ↓ 覆写
   环境变量（最高优先级）
```

### 配置结构

```yaml
# ~/.mcagent/config.yaml
model: deepseek-v4-flash
thinking:
  enabled: true
  reasoningEffort: max
permission:
  mode: approve
  autoAllowlist: [git, npm, brew, ls, cat, find]
context:
  maxTokens: 96000
api:
  baseURL: https://api.deepseek.com
  provider: deepseek
```

对应的 TypeScript 类型：

```ts
interface McAgentConfigFile {
  model?: string;
  thinking?: {
    enabled?: boolean;
    reasoningEffort?: "high" | "max";
  };
  permission?: {
    mode?: "readonly" | "approve" | "auto";
    autoAllowlist?: string[];
  };
  context?: {
    maxTokens?: number;
  };
  api?: {
    baseURL?: string;
    provider?: "deepseek" | "openai";
  };
}
```

### 解析器接口

```ts
// src/config/resolver.ts
export function resolveConfig(): McAgentConfig;
```

内部逻辑：
1. 读取 `$HOME/.mcagent/config.yaml`（不存在则跳过）
2. YAML 解析（使用 `yaml` npm 包，新依赖）
3. 逐字段合并 env vars（DEEPSEEK_MODEL 等）
4. 返回完整配置对象

### 依赖

新增 `yaml` npm 包用于 YAML 解析。

### 调用点变更

- `src/cli.tsx`：`resolveConfig()` 替代手动 env 读取
- `src/headless.ts`：同上

### 文件

| 文件 | 操作 |
|------|------|
| `src/config/resolver.ts` | 新增 |
| `src/cli.tsx` | 修改 — 使用 resolver |
| `src/headless.ts` | 修改 — 使用 resolver |
| `package.json` | 新增依赖 `yaml` |

---

## ③ Headless 流式输出 — 修改 `src/headless.ts`

### 目标

headless 模式支持逐字实时打印，不再等待完整 assistant 回复。

### 当前状态

`src/headless.ts` 已监听 `stream:delta` 事件，使用 ANSI 主题。需确认：
- 当前是否已在流式输出（delta 逐 token 到达时 `process.stdout.write`）
- 是否需要 debounce（headless 无 React 渲染瓶颈，可直接 print）

### 改进方案

- 使用 `agent.on('stream:delta', (delta) => process.stdout.write(delta))` 逐 token 输出
- `stream:end` 时输出换行
- 保持现有的 ANSI 主题着色

### 文件

| 文件 | 操作 |
|------|------|
| `src/headless.ts` | 修改 |

---

## ④ 初始化向导 — `src/init.ts`

### 目标

`npm run init` 交互式生成 `~/.mcagent/config.yaml`。

### 交互流程

```
$ npm run init

🔧  McAgent Setup Wizard

? Model: (use arrow keys)
  ❯ deepseek-v4-flash (fast, economical)
    deepseek-v4-pro (premium, deeper reasoning)

? Enable thinking mode? (Y/n) Y

? Reasoning effort: (use arrow keys)
  ❯ high (general tasks)
    max (complex agent/coding)

? Permission mode: (use arrow keys)
  ❯ approve (ask before destructive operations)
    readonly (no write operations)
    auto (run everything automatically)

? Auto-allowlist commands (comma-separated): git, npm, brew, ls, cat, find

? Your DeepSeek API key: [hidden input]

✅  Config saved to ~/.mcagent/config.yaml
```

### 技术选型

使用 Node.js 内置 `readline` 模块（已在 headless.ts 中使用），无需额外依赖。通过 `readline.question` 实现逐步提问。

`API Key` 使用环境变量 `DEEPSEEK_API_KEY` 写入 `.env` 的说明而非配置文件本身（安全最佳实践）。

### 文件

| 文件 | 操作 |
|------|------|
| `src/init.ts` | 新增 |
| `package.json` | 添加 `"init"` script |

---

## ⑤ 基准回归检测

### 目标

CI 中的 `bench` job 比较当前运行与基线，超出阈值则 PR 评论告警。

### 方案

vitest bench 支持 `--compare` 参数，读取 JSON 基线文件。CI bench job 运行后：
- 退出码 != 0 时 PR 评论或 annotation
- 基线文件更新为手动操作（不在 CI 中自动更新）

### 当前清单

`.benchmark-baselines/` 已包含：
- `roundtrip-test-output.json`
- `roundtrip-test-output.md`
- `roundtrip-test.json`

### 文件

| 文件 | 操作 |
|------|------|
| `.github/workflows/ci.yml` | 在 bench job 中配置 |

---

## 实施顺序

```
① CI/CD   →  ② YAML 配置   →  ③ Headless 流式   →  ④ init 向导   →  ⑤ 基准追踪
 (基础)      (依赖 resolver)    (独立)             (独立)           (依赖 CI)
```

---

## 范围约束

- **不触及 `agent.ts`** 的核心循环逻辑
- **不引入新的外部平台依赖**（仅 `yaml` 解析）
- **不修改已有工具定义**
- **Env vars 保持向后兼容**（`DEEPSEEK_API_KEY` 等继续有效）
