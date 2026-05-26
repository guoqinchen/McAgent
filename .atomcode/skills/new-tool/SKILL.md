# 新工具技能 — McAgent

## 用途

McAgent 项目中创建一个新的工具，包含类型定义、逻辑实现和工具注册。

## 架构概览

```
Tool 接口 (types/tool.ts):
  { name, description, parameters: JSONSchema, execute(args, ctx), readonly?: boolean }

注册流程:
  ToolRegistry.register(tool)  →  tools/tool-registry.ts
  ToolExecutor 自动发现已注册的工具
```

## 步骤

### 1. 确定工具类别

- **基础工具** — 添加到 `src/tools.ts`（8 个基础命令 + 诊断工具）
- **扩展工具** — 添加到 `src/tools-extended.ts`（写文件、编辑、剪贴板等）
- **专业工具** — 添加到 `src/tools-pro.ts`（网络、安全、电源诊断）

### 2. 创建工具实现

```typescript
import type { Tool, ToolContext } from '../types/tool.js';

export const myNewTool: Tool = {
  name: 'my_new_tool',
  description: '清晰的单行描述，说明此工具的作用',
  parameters: {
    type: 'object',
    properties: {
      param1: {
        type: 'string',
        description: '参数说明',
      },
    },
    required: ['param1'],
  },
  readonly: true, // false 用于会修改系统的工具
  execute: async (args: Record<string, unknown>, ctx: ToolContext) => {
    // 实现逻辑
    // 使用 ctx.executor.run(cmd) 执行 shell 命令
    // 使用 ctx.logger 进行日志记录
    return {
      success: true,
      stdout: '输出内容',
    };
  },
};
```

### 3. 在对应的工具文件中导出

### 4. 注册工具

在 `src/tools/tool-registry.ts` 中将新工具添加到 `registerBuiltinTools()` 或通过 `ToolRegistry.register()` 手动注册。

### 5. 添加测试

在 `src/__tests__/` 中创建对应的测试文件，遵循项目现有的 Vitest 模式。

## 约定

- 工具名称使用 `snake_case`
- `readonly: true` 用于只读操作（信息查询、诊断）
- `readonly: false`（默认）用于写入操作（修改文件、执行命令）
- 始终检查参数的存在性和类型
- 危险 shell 命令通过 `checkCommand()` 检查（在 `tools.ts` 中定义）
- 文件路径通过 `safePath()` 限制在 `$HOME` 范围内
- 导出时添加 `export default` 用于批量注册
