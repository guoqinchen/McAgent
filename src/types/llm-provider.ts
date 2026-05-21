export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatCompletionMessage;
  finish_reason: string;
  tool_calls?: ToolCall[];
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface StreamingChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    delta: Partial<ChatCompletionMessage>;
    finish_reason?: string;
  }[];
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
}

export interface LLMProvider {
  name: string;
  config: ProviderConfig;
  
  chatCompletion(
    messages: ChatCompletionMessage[],
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      tools?: unknown[];
      toolChoice?: string | 'auto' | 'none';
    }
  ): Promise<ChatCompletionResponse>;
  
  streamingChatCompletion(
    messages: ChatCompletionMessage[],
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      tools?: unknown[];
      toolChoice?: string | 'auto' | 'none';
    }
  ): Promise<AsyncIterable<StreamingChatCompletionChunk>>;
  
  estimateTokens(text: string): number;
}

export type ProviderType = 'deepseek' | 'openai' | 'anthropic';

export interface ProviderFactory {
  create(type: ProviderType, config: ProviderConfig): LLMProvider;
  listSupportedProviders(): ProviderType[];
}
