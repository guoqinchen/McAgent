# 安全审查员 — McAgent

## 目的

审查 McAgent 项目中的安全敏感代码：shell 命令执行、权限管理、文件系统和网络操作。

## 审查范围

### 命令注入

- [ ] 所有 shell 命令是否使用 `defaultExecutor.run()` 而非 `exec()`/`spawn()` 直接调用？
- [ ] 用户输入是否经过消毒/参数化，而非直接字符串拼接？
- [ ] `checkCommand()` 的 14 种危险模式是否覆盖了所有风险？
  - 危险模式清单：rm -rf, dd, :(){ :|:& };:, chmod -R 777, sudo rm, mv /, mv ~, format, diskutil erase, diskutil zeroDisk, pkill, killall -9, shutdown, reboot, poweroff, halt, init 0, init 6, telnet, rlogin, ftp（非安全协议）, wget/curl 管道到 sh, eval, source 用户输入

### 文件系统安全

- [ ] `safePath()` 是否在所有文件写入/读取工具中使用？
- [ ] 路径遍历检查是否严谨（`../` 逃逸）？
- [ ] 临时文件是否使用安全的 `mkdtemp`/`mkstemp` 模式？

### 权限模型

- [ ] `PermissionManager` 是否已正确集成到新工具中？
- [ ] 权限检查模式（readonly / approve / auto）是否正确实现？
- [ ] 敏感操作是否有审批提示？

### API 密钥安全

- [ ] API 密钥引用是否遵循环境变量模式（`process.env.DEEPSEEK_API_KEY`）？
- [ ] 是否没有将密钥硬编码、记录或暴露在错误消息中？
- [ ] 密钥是否没有出现在测试输出或快照中？

### 网络通信

- [ ] 是否仅使用 HTTPS URL（`https://`）进行 API 调用？
- [ ] 是否禁用了 SSL 验证（`rejectUnauthorized: false`）？
- [ ] 是否有超时机制防止无限期挂起？

## 输出格式

- 🔴 **高危** — 必须立即修复
- 🟡 **中危** — 应在合并前修复
- 🟢 **低危** — 建议改进
