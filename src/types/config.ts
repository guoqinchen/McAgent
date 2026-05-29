/**
 * McAgent configuration types — optimized for DeepSeek-V4.
 *
 * See: https://api-docs.deepseek.com/zh-cn/
 */

import type { Tool } from './tool.js';

/** Permission mode for tool execution */
export type PermissionMode = 'readonly' | 'approve' | 'auto';

/** Thinking mode setting */
export interface ThinkingConfig {
  type: 'enabled' | 'disabled';
  /** Optional: budget_tokens for thinking (DeepSeek ignores this but kept for API compat) */
  budget_tokens?: number;
}

/** Reasoning effort level */
export type ReasoningEffort = 'high' | 'max';

export interface McAgentConfig {
  /** DeepSeek API key (required) */
  apiKey: string;
  /** API base URL (default: https://api.deepseek.com) */
  baseURL?: string;
  /**
   * Model ID.
   * Recommended: 'deepseek-v4-flash' (fast/economical) or 'deepseek-v4-pro' (premium).
   * Legacy 'deepseek-chat' and 'deepseek-reasoner' deprecated 2026/07/24.
   * Default: 'deepseek-v4-flash'
   */
  model?: string;
  /** System instructions / prompt */
  instructions?: string;
  /** Array of tool definitions */
  tools?: Tool[];
  /** Max tool-calling iterations per user message (default: 10) */
  maxToolRounds?: number;
  /**
   * Context window token limit.
   * DeepSeek-V4 supports up to 1,048,576 (1M) tokens.
   * Default: 900_000 (leaves ~148K headroom for response + thinking tokens).
   * Set to 0 to disable automatic eviction.
   */
  maxContextTokens?: number;
  /** Permission mode (default: 'approve') */
  permissionMode?: PermissionMode;
  /** Command prefixes that bypass safety check (default: ['git','npm','brew',...]) */
  autoAllowlist?: string[];
  /**
   * Enable thinking mode (default: true).
   * When enabled, the model outputs a chain-of-thought (reasoning_content)
   * before the final answer, improving accuracy for complex tasks.
   */
  thinkingEnabled?: boolean;
  /**
   * Reasoning effort level.
   * - 'high': default, suitable for general requests
   * - 'max': for complex Agent/coding scenarios, yields deeper reasoning
   * Default: 'high'. For Agent scenarios, 'max' is recommended.
   */
  reasoningEffort?: ReasoningEffort;
  /**
   * Use strict mode for tool calls (Beta).
   * When enabled, model output strictly follows the JSON Schema.
   * Requires useBetaEndpoint: true.
   * See: https://api-docs.deepseek.com/zh-cn/guides/tool_calls#strict-%E6%A8%A1%E5%BC%8Fbeta
   */
  toolStrictMode?: boolean;
  /**
   * Use the beta API endpoint (https://api.deepseek.com/beta).
   * Required for strict mode tool calls and other beta features.
   */
  useBetaEndpoint?: boolean;
}
