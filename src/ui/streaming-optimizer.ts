export interface StreamingOptions {
  bufferSize?: number;
  debounceDelay?: number;
  enableMarkdown?: boolean;
}

export interface StreamingChunk {
  content: string;
  timestamp: number;
}

/** Minimum buffer size to bother with markdown preprocessing — smaller buffers won't have meaningful structures. */
const MIN_MARKDOWN_CHARS = 50;

export class StreamingOptimizer {
  private buffer: string = '';
  private flushScheduled = false;
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
      // Buffer full — flush immediately and cancel any pending timer
      if (this.flushScheduled) {
        this.flushScheduled = false;
      }
      this.flush();
    } else if (!this.flushScheduled) {
      // Schedule a single lazy timer instead of churning timers per chunk
      this.flushScheduled = true;
      setTimeout(() => {
        this.flushScheduled = false;
        this.flush();
      }, this.debounceDelay);
    }
    // If flush is already scheduled, we don't need to do anything — the
    // timer will fire with whatever buffer has accumulated.
  }

  flush(): void {
    if (this.buffer.length === 0) return;
    
    const content = this.enableMarkdown && this.buffer.length >= MIN_MARKDOWN_CHARS
      ? this.preprocessMarkdown(this.buffer)
      : this.buffer;
    
    this.notifyListeners(content);
    this.buffer = '';
    this.flushScheduled = false;
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
    // Fast inline count: iterate once instead of creating match array
    let count = 0;
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '`') count++;
    }
    if (count % 2 !== 0) return content + '`';
    return content;
  }

  private fixIncompleteEmphasis(content: string): string {
    // Fast inline count: iterate once instead of creating match array
    let count = 0;
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '*') count++;
    }
    if (count % 2 !== 0) return content.replace(/\*$/, '');
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
    this.flushScheduled = false;
  }
}
