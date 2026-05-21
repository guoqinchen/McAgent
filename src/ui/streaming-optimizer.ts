export interface StreamingOptions {
  bufferSize?: number;
  debounceDelay?: number;
  enableMarkdown?: boolean;
}

export interface StreamingChunk {
  content: string;
  timestamp: number;
}

export class StreamingOptimizer {
  private buffer: string = '';
  private lastFlushTime: number = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<(content: string) => void> = new Set();
  
  private readonly bufferSize: number;
  private readonly debounceDelay: number;
  private readonly enableMarkdown: boolean;

  constructor(options?: StreamingOptions) {
    this.bufferSize = options?.bufferSize ?? 100;
    this.debounceDelay = options?.debounceDelay ?? 50;
    this.enableMarkdown = options?.enableMarkdown ?? true;
  }

  push(chunk: string): void {
    this.buffer += chunk;
    
    if (this.buffer.length >= this.bufferSize) {
      this.flush();
    } else {
      this.scheduleDebounce();
    }
  }

  private scheduleDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    this.debounceTimer = setTimeout(() => {
      this.flush();
    }, this.debounceDelay);
  }

  flush(): void {
    if (this.buffer.length === 0) return;
    
    const content = this.enableMarkdown 
      ? this.preprocessMarkdown(this.buffer)
      : this.buffer;
    
    this.lastFlushTime = Date.now();
    this.notifyListeners(content);
    this.buffer = '';
    
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private preprocessMarkdown(content: string): string {
    let result = content;
    
    result = this.fixIncompleteLinks(result);
    result = this.fixIncompleteCodeBlocks(result);
    result = this.fixIncompleteEmphasis(result);
    
    return result;
  }

  private fixIncompleteLinks(content: string): string {
    const linkPattern = /\[([^\]]*)$/;
    return content.replace(linkPattern, '[$1');
  }

  private fixIncompleteCodeBlocks(content: string): string {
    const backticks = (content.match(/`/g) || []).length;
    if (backticks % 2 !== 0) {
      return content + '`';
    }
    return content;
  }

  private fixIncompleteEmphasis(content: string): string {
    const asterisks = (content.match(/\*/g) || []).length;
    if (asterisks % 2 !== 0) {
      return content.replace(/\*$/, '');
    }
    return content;
  }

  subscribe(listener: (content: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(content: string): void {
    for (const listener of this.listeners) {
      listener(content);
    }
  }

  getBufferSize(): number {
    return this.buffer.length;
  }

  reset(): void {
    this.buffer = '';
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}
