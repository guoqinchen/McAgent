import { Tool } from '../types/tool.js';
import { toolRegistry } from './tool-registry.js';

interface CacheEntry {
  timestamp: number;
  result: unknown;
}

interface RateLimit {
  calls: number;
  timestamp: number;
}

export class EnhancedToolExecutor {
  private cache: Map<string, CacheEntry> = new Map();
  private rateLimits: Map<string, RateLimit> = new Map();
  private readonly cacheTtl = 60000;
  private readonly defaultRateLimit = 10;
  private readonly rateLimitWindow = 60000;

  async execute(
    toolName: string,
    args: Record<string, unknown>,
    options?: {
      useCache?: boolean;
      cacheTtl?: number;
    }
  ): Promise<unknown> {
    const tool = toolRegistry.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    await this.checkRateLimit(toolName);

    const useCache = options?.useCache !== false;
    if (useCache) {
      const cached = this.getCachedResult(toolName, args);
      if (cached !== undefined) {
        return cached;
      }
    }

    const result = await tool.execute(args);

    if (useCache) {
      this.cacheResult(toolName, args, result, options?.cacheTtl);
    }

    this.updateRateLimit(toolName);

    return result;
  }

  async executeTool(tool: Tool, args: Record<string, unknown>): Promise<unknown> {
    return this.execute(tool.name, args);
  }

  private getCacheKey(toolName: string, args: Record<string, unknown>): string {
    return `${toolName}:${JSON.stringify(args)}`;
  }

  private getCachedResult(toolName: string, args: Record<string, unknown>): unknown | undefined {
    const key = this.getCacheKey(toolName, args);
    const entry = this.cache.get(key);
    
    if (!entry) {
      return undefined;
    }

    const ttl = this.cacheTtl;
    if (Date.now() - entry.timestamp > ttl) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.result;
  }

  private cacheResult(
    toolName: string,
    args: Record<string, unknown>,
    result: unknown,
    ttl?: number
  ): void {
    const key = this.getCacheKey(toolName, args);
    this.cache.set(key, {
      timestamp: Date.now(),
      result,
    });

    const actualTtl = ttl || this.cacheTtl;
    setTimeout(() => {
      this.cache.delete(key);
    }, actualTtl);
  }

  private async checkRateLimit(toolName: string): Promise<void> {
    const now = Date.now();
    const rateLimit = this.rateLimits.get(toolName) || { calls: 0, timestamp: now };

    if (now - rateLimit.timestamp > this.rateLimitWindow) {
      this.rateLimits.set(toolName, { calls: 1, timestamp: now });
      return;
    }

    if (rateLimit.calls >= this.defaultRateLimit) {
      const waitTime = this.rateLimitWindow - (now - rateLimit.timestamp);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.rateLimits.set(toolName, { calls: 1, timestamp: Date.now() });
    } else {
      rateLimit.calls++;
      this.rateLimits.set(toolName, rateLimit);
    }
  }

  private updateRateLimit(toolName: string): void {
    const rateLimit = this.rateLimits.get(toolName);
    if (rateLimit) {
      rateLimit.calls++;
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  clearCacheForTool(toolName: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${toolName}:`)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

export const enhancedToolExecutor = new EnhancedToolExecutor();
