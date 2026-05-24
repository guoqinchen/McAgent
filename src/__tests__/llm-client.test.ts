import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMClient } from '../agent/llm-client.js';

function createMockClient() {
  return {
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  } as any;
}

describe('LLMClient', () => {
  let client: LLMClient;
  let mockOpenAI: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockOpenAI = createMockClient();
    client = new LLMClient(mockOpenAI);
  });

  const model = 'deepseek-v4-flash';
  const messages = [{ role: 'user', content: 'hello' }];
  const tools: any[] = [];
  const body = { reasoning_effort: 'high' as const };

  it('createSync calls the OpenAI client and returns response', async () => {
    const fakeResponse = { choices: [{ message: { content: 'hi' } }] };
    mockOpenAI.chat.completions.create.mockResolvedValue(fakeResponse);

    const result = await client.createSync(model, messages, tools, body);

    expect(result).toEqual(fakeResponse);
    expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
      model,
      messages,
      tools: undefined,
      extra_body: body,
      stream: false,
      signal: undefined,
    });
  });

  it('createSync passes tools array when non-empty', async () => {
    const toolList: any[] = [{ type: 'function', function: { name: 'test' } }];
    mockOpenAI.chat.completions.create.mockResolvedValue({ choices: [] });

    await client.createSync(model, messages, toolList, body);

    expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({ tools: toolList }),
    );
  });

  it('createSync passes AbortSignal', async () => {
    const ac = new AbortController();
    mockOpenAI.chat.completions.create.mockResolvedValue({ choices: [] });

    await client.createSync(model, messages, tools, body, ac.signal);

    expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({ signal: ac.signal }),
    );
  });

  it('createSync returns null when API call fails after retries (fallback)', async () => {
    mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API error'));

    const result = await client.createSync(model, messages, tools, body);

    // errorRecoveryEngine returns null as default fallback value
    expect(result).toBeNull();
  }, 30_000);

  it('createStream calls the OpenAI client with stream:true', async () => {
    const fakeStream = { [Symbol.asyncIterator]: async function* () {} };
    mockOpenAI.chat.completions.create.mockResolvedValue(fakeStream);

    const result = await client.createStream(model, messages, tools, body);

    expect(result).toBe(fakeStream);
    expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
      model,
      messages,
      tools: undefined,
      extra_body: body,
      stream: true,
      signal: undefined,
    });
  });
});
