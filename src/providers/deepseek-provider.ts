import {
  LLMProvider,
  ProviderConfig,
  ChatCompletionMessage,
  ChatCompletionResponse,
  StreamingChatCompletionChunk,
} from '../types/llm-provider.js';

export class DeepSeekProvider implements LLMProvider {
  name = 'deepseek';
  config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl || 'https://api.deepseek.com',
      model: config.model || 'deepseek-v4-flash',
      maxTokens: config.maxTokens || 1048576,
      temperature: config.temperature || 0.7,
      timeout: config.timeout || 60000,
    };
  }

  async chatCompletion(
    messages: ChatCompletionMessage[],
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      tools?: unknown[];
      toolChoice?: string | 'auto' | 'none';
    }
  ): Promise<ChatCompletionResponse> {
    const url = `${this.config.baseUrl}/chat/completions`;
    const body = {
      model: options?.model || this.config.model,
      messages,
      max_tokens: options?.maxTokens || this.config.maxTokens,
      temperature: options?.temperature || this.config.temperature,
      tools: options?.tools,
      tool_choice: options?.toolChoice,
      stream: false,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`DeepSeek API error: ${response.status} ${errorBody}`);
      }

      return response.json() as Promise<ChatCompletionResponse>;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async streamingChatCompletion(
    messages: ChatCompletionMessage[],
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      tools?: unknown[];
      toolChoice?: string | 'auto' | 'none';
    }
  ): Promise<AsyncIterable<StreamingChatCompletionChunk>> {
    const url = `${this.config.baseUrl}/chat/completions`;
    const body = {
      model: options?.model || this.config.model,
      messages,
      max_tokens: options?.maxTokens || this.config.maxTokens,
      temperature: options?.temperature || this.config.temperature,
      tools: options?.tools,
      tool_choice: options?.toolChoice,
      stream: true,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      clearTimeout(timeoutId);
      const errorBody = await response.text();
      throw new Error(`DeepSeek API error: ${response.status} ${errorBody}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      clearTimeout(timeoutId);
      throw new Error('Failed to get response reader');
    }

    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    return {
      [Symbol.asyncIterator]: async function* () {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;

              const dataStr = trimmed.slice(6);
              if (dataStr === '[DONE]') return;

              try {
                const chunk = JSON.parse(dataStr) as StreamingChatCompletionChunk;
                yield chunk;
              } catch (e) {
                continue;
              }
            }
          }
        } finally {
          clearTimeout(timeoutId);
        }
      },
    };
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
