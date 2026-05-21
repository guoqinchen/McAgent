/**
 * McAgent configuration types.
 */

import type { Tool } from './tool.js';

/** Permission mode for tool execution */
export type PermissionMode = 'readonly' | 'approve' | 'auto';

export interface McAgentConfig {
  /** DeepSeek API key (required) */
  apiKey: string;
  /** API base URL (default: https://api.deepseek.com/v1) */
  baseURL?: string;
  /** Model ID (default: deepseek-chat) */
  model?: string;
  /** System instructions / prompt */
  instructions?: string;
  /** Array of tool definitions */
  tools?: Tool[];
  /** Max tool-calling iterations per user message (default: 10) */
  maxToolRounds?: number;
  /** Context window token limit (default: 96000, 0 = disabled) */
  maxContextTokens?: number;
  /** Permission mode (default: 'approve') */
  permissionMode?: PermissionMode;
  /** Command prefixes that bypass safety check (default: ['git','npm','brew',...]) */
  autoAllowlist?: string[];
}
