# McAgent v2.x Comprehensive Improvement Plan

## 📋 Document Info

| Field       | Value                                       |
| ----------- | ------------------------------------------- |
| **Title**   | McAgent v2.x Comprehensive Improvement Plan |
| **Date**    | 2026-05-21                                  |
| **Version** | 1.0                                         |
| **Status**  | Approved                                    |
| **Author**  | Agent                                       |

---

## 🔍 Executive Summary

This document outlines a comprehensive 10-week improvement plan for McAgent, the CLI-first macOS AI assistant. The plan follows a **capability-first strategy** with three phases:

| Phase       | Duration  | Focus                | Key Deliverables                                                                 |
| ----------- | --------- | -------------------- | -------------------------------------------------------------------------------- |
| **Phase 1** | 3-4 weeks | Core Capabilities    | LLM Provider Abstraction, Enhanced Tool System, Reasoning Engine, Error Recovery |
| **Phase 2** | 2-3 weeks | User Experience      | Enhanced TUI, Session Management, Streaming Optimization                         |
| **Phase 3** | 2-3 weeks | Stability & Security | Structured Logging, Performance Monitoring, Fine-grained Permissions             |

**Success Criteria:**

- Tool call accuracy: +20%
- Error recovery success rate: +40%
- User satisfaction: +30%
- Response perceived speed: +25%
- Maintainability: +50%
- Security compliance: +40%

---

## 🏗️ Architecture Overview

### Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Interface Layer                      │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
│  │   Ink/React     │  │   Headless CLI   │  │   HTTP API     │ │
│  │   TUI (增强版)   │  │   (现有)          │  │   (新增)        │ │
│  └────────┬────────┘  └────────┬─────────┘  └───────┬────────┘ │
└───────────┼────────────────────┼────────────────────┼───────────┘
            │                    │                    │
            └────────────────────┼────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Agent Core Layer                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    MacOSAgent (重构)                        │ │
│  │  ┌──────────┐  ┌────────────┐  ┌──────────────┐          │ │
│  │  │ Executor │  │ ToolSystem │  │ ErrorHandler │          │ │
│  │  │  (增强)  │  │   (新增)    │  │   (新增)      │          │ │
│  │  └──────────┘  └────────────┘  └──────────────┘          │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                 ConversationManager (增强)                    │ │
│  │  ┌────────────┐  ┌──────────────┐  ┌────────────────┐      │ │
│  │  │ SessionMgr │  │ TokenBudget  │  │  HistoryCache │      │ │
│  │  │   (新增)   │  │   (新增)     │  │    (新增)      │      │ │
│  │  └────────────┘  └──────────────┘  └────────────────┘      │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Provider Layer (新增)                        │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                   LLMProvider (接口)                        │ │
│  │  - chat(): Promise<ChatResponse>                          │ │
│  │  - stream(): AsyncGenerator<StreamDelta>                   │ │
│  │  - getCapabilities(): LLMCapabilities                      │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ DeepSeek    │  │ OpenAI      │  │ Local/Anthropic/etc.    │ │
│  │ Provider    │  │ Provider    │  │ (Future)               │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Backward Compatibility**: All existing APIs remain unchanged
2. **Progressive Refactoring**: Each change maintains functional completeness
3. **Separation of Concerns**: Clear layer boundaries
4. **Interface-Driven Design**: Abstractions for testability and extensibility
5. **Type Safety**: Full TypeScript support with strict mode

---

## 🎯 Phase 1: Core Capabilities

### 1.1 LLM Provider Abstraction

#### Objective

Create a unified interface for LLM providers, enabling future support for OpenAI, Anthropic, and local models while maintaining DeepSeek as the default.

#### Interface Definition

**File:** `src/providers/base.ts`

```typescript
export interface LLMCapabilities {
  streaming: boolean;
  toolCalling: boolean;
  reasoning: boolean;
  maxContextTokens: number;
  strictToolMode: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatResponse {
  content: string | null;
  toolCalls?: ToolCall[];
  reasoning?: string;
  finishReason: 'stop' | 'tool_calls' | 'length';
}

export interface StreamDelta {
  content?: string;
  reasoning?: string;
  toolCall?: {
    index: number;
    id?: string;
    name?: string;
    arguments?: string;
  };
  finishReason?: string;
}

export interface LLMProvider {
  readonly id: string;
  getCapabilities(): LLMCapabilities;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  stream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<StreamDelta>;
  validate(): Promise<boolean>;
}

export interface ChatOptions {
  model?: string;
  tools?: ToolDefinition[];
  reasoningEffort?: 'high' | 'max';
  thinkingEnabled?: boolean;
  strictMode?: boolean;
  maxTokens?: number;
  temperature?: number;
}
```

#### DeepSeek Provider Implementation

**File:** `src/providers/deepseek.ts`

```typescript
export class DeepSeekProvider implements LLMProvider {
  readonly id = 'deepseek';

  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey: string, baseURL?: string, defaultModel = 'deepseek-v4-flash') {
    this.client = new OpenAI({ apiKey, baseURL: baseURL || 'https://api.deepseek.com' });
    this.defaultModel = defaultModel;
  }

  getCapabilities(): LLMCapabilities {
    return {
      streaming: true,
      toolCalling: true,
      reasoning: true,
      maxContextTokens: 1_000_000,
      strictToolMode: true,
    };
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  async *stream(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<StreamDelta>;
  async validate(): Promise<boolean>;
}
```

#### Agent Integration

**File:** `src/agent.ts` (modified)

- Replace `private client: OpenAIClient` with `private provider: LLMProvider`
- Create factory function `createProvider(config)`
- Update `runLoop()` to use provider interface

---

### 1.2 Tool System Enhancement

#### Objective

Build a scalable tool registry with metadata management, caching, and rate limiting.

#### Tool Registry

**File:** `src/tools/registry.ts`

```typescript
export interface ToolMetadata {
  name: string;
  description: string;
  category: ToolCategory;
  readonly: boolean;
  experimental?: boolean;
  dependencies?: string[];
  retryable?: boolean;
}

export type ToolCategory =
  | 'system'
  | 'process'
  | 'file'
  | 'network'
  | 'security'
  | 'development'
  | 'custom';

export class ToolRegistry {
  private tools = new Map<string, Tool>();
  private metadata = new Map<string, ToolMetadata>();

  register(tool: Tool, metadata?: Partial<ToolMetadata>): void;
  get(name: string): Tool | undefined;
  getByCategory(category: ToolCategory): Tool[];
  getAll(): Tool[];
  getMetadata(name: string): ToolMetadata | undefined;
}
```

#### Enhanced Tool Executor

**File:** `src/tools/executor.ts`

```typescript
export interface ToolExecutionContext {
  sessionId: string;
  userId?: string;
  permissions: PermissionMode;
  allowedPaths?: string[];
  rateLimit?: RateLimitConfig;
}

export interface ToolExecutionResult {
  success: boolean;
  output?: unknown;
  error?: string;
  duration: number;
  cached?: boolean;
}

export class EnhancedToolExecutor {
  async execute(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult>;
}
```

---

### 1.3 Reasoning Engine

#### Objective

Implement strategy-based reasoning to improve tool selection and task planning.

**File:** `src/agent/reasoning.ts`

```typescript
export type ReasoningStrategy = 'direct' | 'reasoned' | 'explorative' | 'critical';

export interface ReasoningConfig {
  strategy: ReasoningStrategy;
  maxSteps: number;
  confidenceThreshold: number;
  allowRevise: boolean;
}

export class ReasoningEngine {
  selectStrategy(task: string): ReasoningStrategy;
  async reason(task: string, context: Message[]): Promise<ReasoningResult>;
}
```

#### Tool Selector

**File:** `src/agent/tool-selector.ts`

```typescript
export interface ToolSelectionResult {
  selectedTools: string[];
  reasoning: string;
  confidence: number;
}

export class ToolSelector {
  async selectTools(
    task: string,
    context: Message[],
    availableTools: Tool[]
  ): Promise<ToolSelectionResult>;
}
```

---

### 1.4 Error Recovery Engine

#### Objective

Implement robust error handling with retry strategies, fallback tools, and graceful degradation.

**File:** `src/agent/error-handler.ts`

```typescript
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';
export type RecoveryStrategy = 'retry' | 'fallback' | 'skip' | 'abort' | 'escalate';

export class ErrorRecoveryEngine {
  determineRecoveryStrategy(error: Error, context: ErrorContext): RecoveryStrategy;
  async recover(
    error: Error,
    context: ErrorContext,
    executor: EnhancedToolExecutor
  ): Promise<RecoveryResult>;
  calculateDelay(context: ErrorContext): number; // Exponential backoff
}
```

---

## 🎯 Phase 2: User Experience

### 2.1 Enhanced TUI

#### Objective

Improve visual presentation with reasoning visualization, code highlighting, and smooth animations.

**Files:** `src/cli/components/EnhancedChat.tsx`, `src/cli/components/Collapsible.tsx`, `src/cli/components/TypewriterText.tsx`

**Key Features:**

- Reasoning visualization (collapsible)
- Tool call status animations
- Markdown/Code syntax highlighting
- Smooth streaming animations (configurable speed)
- Interactive confirmation dialogs

### 2.2 Session Management

#### Objective

Enable persistent sessions with saving, loading, and exporting capabilities.

**File:** `src/agent/session-manager.ts`

```typescript
export interface Session {
  id: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  totalTokens: number;
  tags?: string[];
}

export interface SessionManager {
  createSession(name?: string): Session;
  saveSession(sessionId: string): Promise<void>;
  loadSession(sessionId: string): Promise<Session>;
  listSessions(filter?: SessionFilter): Session[];
  deleteSession(sessionId: string): void;
  exportSession(sessionId: string, format: 'json' | 'markdown'): string;
}

export class FileBasedSessionManager implements SessionManager {
  // Implementation with file-based storage
}
```

### 2.3 Streaming Optimization

#### Objective

Improve perceived responsiveness with buffering, debouncing, and Markdown-aware rendering.

**Files:** `src/streaming/optimizers.ts`, `src/streaming/markdown-renderer.ts`

```typescript
export class StreamingOptimizer {
  push(delta: string, onFlush: (text: string) => void): void;
}

export class MarkdownRenderer {
  detectAndRender(text: string): RenderedSegment[];
}
```

---

## 🎯 Phase 3: Stability & Security

### 3.1 Structured Logging

#### Objective

Implement comprehensive logging with multiple handlers, log rotation, and structured output.

**File:** `src/logging/logger.ts`

```typescript
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  context?: Record<string, unknown>;
  error?: { name: string; message: string; stack?: string };
  sessionId?: string;
  duration?: number;
}

export class StructuredLogger implements Logger {
  debug(message: string, context?: object): void;
  info(message: string, context?: object): void;
  warn(message: string, context?: object): void;
  error(message: string, error?: Error, context?: object): void;
  fatal(message: string, error?: Error, context?: object): void;
}

export class FileHandler implements LogHandler {
  write(entry: LogEntry): void;
}
```

### 3.2 Performance Monitoring

#### Objective

Track key metrics including latency, error rates, token usage, and tool usage patterns.

**File:** `src/monitoring/metrics.ts`

```typescript
export interface AgentMetrics {
  totalRequests: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  errorRate: number;
  tokensUsed: number;
  topTools: { tool: string; count: number }[];
}

export class MetricsCollector {
  recordLatency(operation: string, durationMs: number): void;
  getMetrics(): AgentMetrics;
}

export class PerformanceReporter {
  generateReport(): string;
}
```

### 3.3 Fine-Grained Permissions

#### Objective

Implement rule-based permission system with interactive confirmation and audit logging.

**File:** `src/security/permission-manager.ts`

```typescript
export interface PermissionRule {
  id: string;
  name: string;
  type: 'allow' | 'deny';
  target: PermissionTarget;
  conditions?: PermissionCondition[];
}

export type PermissionTarget =
  | { tool: string }
  | { category: ToolCategory }
  | { path: string | Pattern }
  | { command: Pattern }
  | { all: true };

export class PermissionManager {
  async checkPermission(context: PermissionContext): Promise<PermissionResult>;
  async requestConfirmation(toolName: string, action: string, details: string): Promise<boolean>;
}
```

---

## 🗺️ Implementation Roadmap

### Timeline Summary

```
Week 1-4:  Phase 1 - Core Capabilities
Week 5-7:  Phase 2 - User Experience
Week 8-10: Phase 3 - Stability & Security
```

### Detailed Plan

#### Week 1: LLM Provider Abstraction

- Define `LLMProvider` interface (`src/providers/base.ts`)
- Implement `DeepSeekProvider` (`src/providers/deepseek.ts`)
- Create provider factory (`src/providers/index.ts`)
- Refactor `agent.ts` to use provider interface
- Write unit tests

#### Week 2: Tool System Enhancement

- Implement `ToolRegistry` (`src/tools/registry.ts`)
- Implement `EnhancedToolExecutor` (`src/tools/executor.ts`)
- Add tool caching mechanism
- Extend tool metadata and categories
- Write integration tests

#### Week 3: Reasoning Engine

- Implement `ReasoningEngine` (`src/agent/reasoning.ts`)
- Implement `ToolSelector` (`src/agent/tool-selector.ts`)
- Integrate with agent loop
- Write tests

#### Week 4: Error Recovery

- Implement `ErrorRecoveryEngine` (`src/agent/error-handler.ts`)
- Add exponential backoff
- Implement fallback tool mapping
- End-to-end testing

#### Week 5: Enhanced TUI

- Refactor chat components (`src/cli/components/`)
- Add reasoning visualization
- Add code syntax highlighting
- Implement smooth streaming animations

#### Week 6: Session Management

- Implement `FileBasedSessionManager` (`src/agent/session-manager.ts`)
- Add session CRUD operations
- Implement session export (JSON/Markdown)
- Add TUI session management UI

#### Week 7: Streaming Optimization

- Implement `StreamingOptimizer` (`src/streaming/optimizers.ts`)
- Implement `MarkdownRenderer` (`src/streaming/markdown-renderer.ts`)
- Add history command completion
- Add interactive confirmation dialogs

#### Week 8: Structured Logging

- Implement `StructuredLogger` (`src/logging/logger.ts`)
- Add `ConsoleHandler` and `FileHandler`
- Implement log rotation
- Integrate logging into agent and tools

#### Week 9: Performance Monitoring

- Implement `MetricsCollector` (`src/monitoring/metrics.ts`)
- Add request latency tracking
- Add token usage statistics
- Implement `PerformanceReporter`

#### Week 10: Permission System

- Implement `PermissionManager` (`src/security/permission-manager.ts`)
- Add rule engine
- Implement interactive confirmation flow
- Add security audit logging

---

## ✅ Success Criteria & Metrics

### Core Capabilities

| Metric                      | Target | Baseline |
| --------------------------- | ------ | -------- |
| Tool call accuracy          | +20%   | TBD      |
| Error recovery success rate | +40%   | TBD      |
| Average reasoning steps     | 3-5    | TBD      |

### User Experience

| Metric                     | Target |
| -------------------------- | ------ |
| User satisfaction (survey) | +30%   |
| Response perceived speed   | +25%   |
| Session retention rate     | 75%+   |

### Stability

| Metric                       | Target |
| ---------------------------- | ------ |
| Mean Time to Recovery (MTTR) | < 5s   |
| Error rate                   | < 1%   |
| Uptime                       | 99.9%  |

### Security

| Metric                      | Target |
| --------------------------- | ------ |
| Permission violation blocks | 100%   |
| Audit log completeness      | 100%   |
| Security scan pass rate     | 100%   |

---

## 🔄 Backward Compatibility

### API Compatibility

- `createMacOSAgent()` signature unchanged
- All existing tool interfaces unchanged
- All event types unchanged
- Configuration options remain compatible (additive only)

### Session Compatibility

- Existing session files remain readable
- Export format compatible with previous versions

### Migration Path

- No breaking changes
- In-place upgrade supported
- `DEEPSEEK_API_KEY` environment variable still required

---

## 🔒 Security Considerations

### Threat Model

- **Command injection**: Blocked by dangerous command detection
- **Path traversal**: Restricted to `$HOME` directory
- **Data exfiltration**: Audit logging enabled
- **Denial of service**: Rate limiting implemented
- **Unauthorized access**: Permission system with explicit confirmation

### Security Controls

1. Dangerous command detection (14 patterns)
2. Path restriction to `$HOME`
3. Three permission modes (readonly/approve/auto)
4. Command allowlist
5. Interactive confirmation for sensitive operations
6. Comprehensive audit logging

---

## 📝 Test Plan

### Unit Tests

- Provider layer: Mock providers, API validation
- Tool system: Registry, executor, caching
- Reasoning engine: Strategy selection, tool matching
- Error recovery: Retry logic, fallback selection

### Integration Tests

- Agent loop: Message flow, tool execution, streaming
- Session management: Save/load/export
- Permission system: Rule evaluation, confirmation flow

### End-to-End Tests

- Full conversation flow with tool calls
- Error scenarios and recovery
- Performance benchmarks

---

## 📚 Documentation Plan

| Document                | Status |
| ----------------------- | ------ |
| API Reference           | Update |
| Tool Development Guide  | New    |
| Configuration Reference | Update |
| Security Guide          | New    |
| Migration Guide         | New    |

---

## 📋 Checklist

### Phase 1

- [ ] LLM Provider interface defined
- [ ] DeepSeek Provider implemented
- [ ] Agent refactored to use provider
- [ ] ToolRegistry implemented
- [ ] EnhancedToolExecutor implemented
- [ ] ReasoningEngine implemented
- [ ] ErrorRecoveryEngine implemented
- [ ] All unit tests passing

### Phase 2

- [ ] Enhanced TUI components
- [ ] SessionManager implemented
- [ ] StreamingOptimizer implemented
- [ ] MarkdownRenderer implemented
- [ ] All integration tests passing

### Phase 3

- [ ] StructuredLogger implemented
- [ ] MetricsCollector implemented
- [ ] PerformanceReporter implemented
- [ ] PermissionManager implemented
- [ ] Security audit logging
- [ ] All end-to-end tests passing

---

## 📞 Contact & Support

For questions or issues, please refer to the project repository or contact the maintainers.
