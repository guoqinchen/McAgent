import { LLMProvider, ProviderConfig, ProviderType, ProviderFactory as ProviderFactoryInterface } from '../types/llm-provider.js';
import { DeepSeekProvider } from './deepseek-provider.js';
import { OpenAIProvider } from './openai-provider.js';

export class ProviderFactory implements ProviderFactoryInterface {
  create(type: ProviderType, config: ProviderConfig): LLMProvider {
    switch (type) {
      case 'deepseek':
        return new DeepSeekProvider(config);
      case 'openai':
        return new OpenAIProvider(config);
      case 'anthropic':
        throw new Error('Anthropic provider not yet implemented');
      default:
        throw new Error(`Unsupported provider type: ${type}`);
    }
  }

  listSupportedProviders(): ProviderType[] {
    return ['deepseek', 'openai'];
  }
}

export const providerFactory = new ProviderFactory();
