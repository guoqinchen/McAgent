import { LLMProvider, ChatCompletionMessage } from '../types/llm-provider.js';

export type ReasoningStrategy = 'direct' | 'reasoned' | 'explorative' | 'critical';

export interface ReasoningContext {
  taskType: string;
  complexity: 'low' | 'medium' | 'high';
  uncertainty: 'low' | 'medium' | 'high';
  riskLevel: 'low' | 'medium' | 'high';
  toolsAvailable: boolean;
}

export interface ReasoningResult {
  strategy: ReasoningStrategy;
  response: string;
  thoughts?: string[];
  confidence: number;
  toolCalls?: unknown[];
}

export class ReasoningEngine {
  constructor(private provider: LLMProvider) {}

  determineStrategy(context: ReasoningContext): ReasoningStrategy {
    if (context.complexity === 'high' || context.uncertainty === 'high') {
      if (context.riskLevel === 'high') {
        return 'critical';
      }
      return 'explorative';
    }
    
    if (context.complexity === 'medium' || context.uncertainty === 'medium') {
      return 'reasoned';
    }
    
    return 'direct';
  }

  async reason(
    messages: ChatCompletionMessage[],
    context: ReasoningContext
  ): Promise<ReasoningResult> {
    const strategy = this.determineStrategy(context);
    const systemPrompt = this.buildSystemPrompt(strategy);
    
    const fullMessages: ChatCompletionMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    const result = await this.provider.chatCompletion(fullMessages);
    const response = result.choices[0]?.message.content || '';
    
    return {
      strategy,
      response,
      confidence: this.estimateConfidence(response),
      toolCalls: result.choices[0]?.tool_calls,
    };
  }

  async streamReason(
    messages: ChatCompletionMessage[],
    context: ReasoningContext
  ): Promise<AsyncIterable<string>> {
    const strategy = this.determineStrategy(context);
    const systemPrompt = this.buildSystemPrompt(strategy);
    
    const fullMessages: ChatCompletionMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    const stream = await this.provider.streamingChatCompletion(fullMessages);
    
    return {
      [Symbol.asyncIterator]: async function* () {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta.content || '';
          if (content) {
            yield content;
          }
        }
      },
    };
  }

  private buildSystemPrompt(strategy: ReasoningStrategy): string {
    switch (strategy) {
      case 'direct':
        return `You are a helpful assistant. Provide direct, concise answers.`;
      
      case 'reasoned':
        return `You are a helpful assistant. Think step by step before answering. 
Provide a clear reasoning process followed by your final answer.`;
      
      case 'explorative':
        return `You are an expert problem solver. Explore multiple approaches before deciding.
Consider pros and cons of different solutions.
Provide detailed analysis and recommendations.`;
      
      case 'critical':
        return `You are a critical thinker. Approach this problem with extreme caution.
Identify potential risks and pitfalls.
Challenge assumptions.
Provide conservative, well-justified recommendations.
Consider worst-case scenarios.`;
      
      default:
        return `You are a helpful assistant.`;
    }
  }

  private estimateConfidence(response: string): number {
    const length = response.length;
    
    if (length < 50) return 0.6;
    if (length < 150) return 0.7;
    if (length < 300) return 0.8;
    if (length < 500) return 0.85;
    return 0.9;
  }

  async analyzeAndDecide(
    messages: ChatCompletionMessage[],
    context: ReasoningContext
  ): Promise<{ decision: string; justification: string; confidence: number }> {
    const strategy = this.determineStrategy(context);
    const analysisPrompt = `
      Analyze the following conversation and provide a clear decision with justification.
      
      Context: ${JSON.stringify(context)}
      
      Decision Options:
      1. Direct answer - provide a straightforward response
      2. Request clarification - ask for more information
      3. Use tool - invoke an available tool
      4. Defer to human - escalate to human operator
      
      Provide your decision and detailed justification.
    `;

    const fullMessages: ChatCompletionMessage[] = [
      { role: 'system', content: this.buildSystemPrompt(strategy) },
      { role: 'user', content: analysisPrompt },
      ...messages,
    ];

    const result = await this.provider.chatCompletion(fullMessages);
    const content = result.choices[0]?.message.content || '';
    
    return {
      decision: content.split('\n')[0] || 'direct',
      justification: content,
      confidence: this.estimateConfidence(content),
    };
  }
}
