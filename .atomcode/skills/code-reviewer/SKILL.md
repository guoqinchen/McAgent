# 代码审查员 — McAgent

## 目的

审查 McAgent 项目的 Pull Request 或变更集，确保代码质量、架构一致性和类型安全。

## 审查清单

### 类型安全（高优先级）

- [ ] 新类型是否在 `src/types/` 中有正确的定义？
- [ ] `LLMProvider` 接口实现是否匹配 `types/llm-provider.ts` 中的签名？
- [ ] `Tool` 接口是否完全实现（name, description, parameters, execute）？
- [ ] 是否使用了 `tsconfig.json` 中配置的 NodeNext 模块解析（带 `.js` 扩展名）？

### 架构一致性

- [ ] 代码是否放置到了正确的子目录中？
  - 工具 → `src/tools/`
  - 提供者 → `src/providers/`
  - 引擎逻辑 → `src/engine/`
  - 会话管理 → `src/session/`
- [ ] 工具是否已在 `ToolRegistry` 中注册？
- [ ] 新功能是否有对应的 `McAgentEvents` 事件？

### Shell 安全

- [ ] 所有 shell 执行是否通过 `defaultExecutor`（来自 `shell/executor.ts`）？
- [ ] 危险命令是否被 `checkCommand()` 正确拦截？
- [ ] 文件路径是否通过 `safePath()` 得到保护？

### 测试覆盖

- [ ] 新工具是否有对应的测试文件？
- [ ] 新提供者是否已在 provider-factory 的测试中得到覆盖？
- [ ] 边界情况和错误路径是否已测试？

### 文档

- [ ] 用户可见的工具是否需要更新 README/USAGE？
- [ ] 配置变更是否需要更新 CONFIG.md？

## 输出格式

对每个审查项给出：

- ✅ 通过
- ⚠️ 警告（非阻塞，但建议改进）
- ❌ 不通过（必须修复）
