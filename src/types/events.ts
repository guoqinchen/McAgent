/**
 * McAgent event types for UI integration.
 *
 * The agent emits these events so any UI (Ink TUI, headless CLI, HTTP, etc.)
 * can subscribe without coupling to agent internals.
 */

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** ISO timestamp when the message was created (v2.5+) */
  timestamp?: string;
}

/** Permission request details emitted before a potentially destructive tool call. */
export interface PermissionRequest {
  /** The tool being requested. */
  toolName: string;
  /** Human-readable description of what the tool will do. */
  description: string;
  /** The arguments being passed to the tool. */
  args: Record<string, unknown>;
  /** Suggested command that would be run (for run_command tool). */
  command?: string;
  /** Danger level classification. */
  dangerLevel?: 'safe' | 'caution' | 'dangerous' | 'destructive';
}

/** Tool progress update for long-running operations. */
export interface ToolProgress {
  /** Tool name. */
  name: string;
  /** Elapsed time in milliseconds. */
  elapsedMs: number;
  /** Estimated remaining time in milliseconds (null if unknown). */
  estimatedRemainingMs: number | null;
  /** Progress percentage 0–100 (null if indeterminate). */
  progress: number | null;
  /** Current status message. */
  status: string;
}

/** Context snapshot displayed in the UI status bar. */
export interface AgentContext {
  /** Current working directory. */
  cwd: string;
  /** Current permission mode. */
  permissionMode: string;
  /** Active model name. */
  model: string;
  /** Whether the agent is currently processing. */
  isProcessing: boolean;
  /** Number of messages in conversation history. */
  messageCount: number;
  /** Estimated context usage percentage (0–100). */
  contextUsagePercent: number;
}

export interface McAgentEvents {
  /** User message was recorded */
  'message:user': (message: Message) => void;
  /** Full assistant message is complete */
  'message:assistant': (message: Message) => void;
  /** A text delta arrived during streaming */
  'stream:delta': (delta: string, accumulated: string) => void;
  /** Streaming finished */
  'stream:end': (fullText: string) => void;
  /** A tool was called — before execution begins */
  'tool:call': (name: string, args: unknown) => void;
  /** A tool returned a result */
  'tool:result': (name: string, result: unknown) => void;
  /** Progress update for a long-running tool. */
  'tool:progress': (progress: ToolProgress) => void;
  /** The model produced reasoning / thinking text (from DeepSeek's reasoning_content) */
  'reasoning:delta': (text: string) => void;
  /** Permission request — UI should prompt for approval before proceeding. */
  'permission:request': (request: PermissionRequest) => void;
  /** Agent started processing */
  'thinking:start': () => void;
  /** Agent finished processing */
  'thinking:end': () => void;
  /** Context snapshot update. */
  'context:update': (context: AgentContext) => void;
  /** Error occurred */
  error: (error: Error) => void;
}
