/**
 * McAgent event types for UI integration.
 *
 * The agent emits these events so any UI (Ink TUI, headless CLI, HTTP, etc.)
 * can subscribe without coupling to agent internals.
 */

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
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
  /** A tool was called */
  'tool:call': (name: string, args: unknown) => void;
  /** A tool returned a result */
  'tool:result': (name: string, result: unknown) => void;
  /** The model produced reasoning / thinking text (from DeepSeek's reasoning_content) */
  'reasoning:delta': (text: string) => void;
  /** Agent started processing */
  'thinking:start': () => void;
  /** Agent finished processing */
  'thinking:end': () => void;
  /** Error occurred */
  error: (error: Error) => void;
}
