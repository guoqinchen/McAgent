export type RecoveryStrategy = 'retry' | 'fallback' | 'skip' | 'abort' | 'escalate';

export type ErrorType = 
  | 'network'
  | 'timeout'
  | 'api_error'
  | 'validation_error'
  | 'permission_error'
  | 'rate_limit'
  | 'resource_unavailable'
  | 'unknown';

export interface ErrorContext {
  error: Error;
  errorType: ErrorType;
  retryCount: number;
  maxRetries: number;
  operation: string;
  timestamp: Date;
}

export interface RecoveryResult {
  strategy: RecoveryStrategy;
  success: boolean;
  message: string;
  retryDelay?: number;
  fallbackValue?: unknown;
}

export class ErrorRecoveryEngine {
  private readonly maxRetries = 3;
  private readonly baseRetryDelay = 1000;

  determineStrategy(context: ErrorContext): RecoveryStrategy {
    const { errorType, retryCount } = context;
    
    if (retryCount >= this.maxRetries) {
      return 'fallback';
    }

    switch (errorType) {
      case 'network':
      case 'timeout':
      case 'rate_limit':
        return retryCount < this.maxRetries ? 'retry' : 'fallback';
      
      case 'api_error':
        return retryCount < this.maxRetries ? 'retry' : 'fallback';
      
      case 'permission_error':
        return 'escalate';
      
      case 'validation_error':
        return 'abort';
      
      case 'resource_unavailable':
        return retryCount < this.maxRetries ? 'retry' : 'skip';
      
      default:
        return retryCount < this.maxRetries ? 'retry' : 'fallback';
    }
  }

  async recover(context: ErrorContext): Promise<RecoveryResult> {
    const strategy = this.determineStrategy(context);
    
    switch (strategy) {
      case 'retry':
        return this.handleRetry(context);
      
      case 'fallback':
        return this.handleFallback(context);
      
      case 'skip':
        return this.handleSkip(context);
      
      case 'abort':
        return this.handleAbort(context);
      
      case 'escalate':
        return this.handleEscalate(context);
      
      default:
        return {
          strategy: 'abort',
          success: false,
          message: 'Unknown recovery strategy',
        };
    }
  }

  async executeWithRecovery<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T | undefined> {
    let retryCount = 0;
    
    while (retryCount <= this.maxRetries) {
      try {
        return await operation();
      } catch (error) {
        const errorType = this.classifyError(error);
        const context: ErrorContext = {
          error: error as Error,
          errorType,
          retryCount,
          maxRetries: this.maxRetries,
          operation: operationName,
          timestamp: new Date(),
        };

        const result = await this.recover(context);
        
        if (result.strategy === 'retry') {
          retryCount++;
          if (result.retryDelay) {
            await this.delay(result.retryDelay);
          }
          continue;
        }
        
        if (result.strategy === 'fallback' && result.fallbackValue !== undefined) {
          return result.fallbackValue as T;
        }
        
        if (result.strategy === 'skip') {
          return undefined;
        }
        
        throw error;
      }
    }
    
    return undefined;
  }

  private classifyError(error: unknown): ErrorType {
    if (!(error instanceof Error)) {
      return 'unknown';
    }

    const message = error.message.toLowerCase();
    
    if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
      return 'network';
    }
    
    if (message.includes('timeout') || message.includes('timed out')) {
      return 'timeout';
    }
    
    if (message.includes('rate') || message.includes('limit')) {
      return 'rate_limit';
    }
    
    if (message.includes('permission') || message.includes('denied')) {
      return 'permission_error';
    }
    
    if (message.includes('validation') || message.includes('invalid')) {
      return 'validation_error';
    }
    
    if (message.includes('api') || message.includes('status')) {
      return 'api_error';
    }
    
    if (message.includes('unavailable') || message.includes('service')) {
      return 'resource_unavailable';
    }
    
    return 'unknown';
  }

  private async handleRetry(context: ErrorContext): Promise<RecoveryResult> {
    const delay = this.calculateRetryDelay(context.retryCount);
    
    return {
      strategy: 'retry',
      success: true,
      message: `Retrying ${context.operation} (attempt ${context.retryCount + 1}/${context.maxRetries})`,
      retryDelay: delay,
    };
  }

  private handleFallback(context: ErrorContext): RecoveryResult {
    return {
      strategy: 'fallback',
      success: true,
      message: `Using fallback for ${context.operation}`,
      fallbackValue: this.getDefaultFallback(context.operation),
    };
  }

  private handleSkip(context: ErrorContext): RecoveryResult {
    return {
      strategy: 'skip',
      success: true,
      message: `Skipping ${context.operation} due to unrecoverable error`,
    };
  }

  private handleAbort(context: ErrorContext): RecoveryResult {
    return {
      strategy: 'abort',
      success: false,
      message: `Aborting ${context.operation}: ${context.error.message}`,
    };
  }

  private handleEscalate(context: ErrorContext): RecoveryResult {
    return {
      strategy: 'escalate',
      success: false,
      message: `Escalating ${context.operation} to human operator`,
    };
  }

  private calculateRetryDelay(attempt: number): number {
    return this.baseRetryDelay * Math.pow(2, attempt);
  }

  private getDefaultFallback(operation: string): unknown {
    if (operation.includes('fetch') || operation.includes('get')) {
      return null;
    }
    if (operation.includes('list') || operation.includes('search')) {
      return [];
    }
    if (operation.includes('create') || operation.includes('update')) {
      return null;
    }
    return null;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const errorRecoveryEngine = new ErrorRecoveryEngine();
