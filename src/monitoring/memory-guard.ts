import { logger } from '../logging/structured-logger.js';

export interface MemoryUsage {
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
  rssMB: number;
}

export class MemoryGuard {
  private static readonly HEAP_WARNING_MB = 3072;
  private static readonly HEAP_CRITICAL_MB = 3584;
  private static checkCount = 0;

  static check(): void {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    const heapTotalMB = usage.heapTotal / 1024 / 1024;

    MemoryGuard.checkCount++;

    if (heapUsedMB > MemoryGuard.HEAP_CRITICAL_MB) {
      logger.warn('Critical memory usage detected', {
        heapUsedMB: Math.round(heapUsedMB),
        heapTotalMB: Math.round(heapTotalMB),
        checkCount: MemoryGuard.checkCount,
      });

      if (typeof global.gc === 'function') {
        logger.info('Triggering manual garbage collection');
        global.gc();
      }
    } else if (heapUsedMB > MemoryGuard.HEAP_WARNING_MB) {
      logger.warn('High memory usage detected', {
        heapUsedMB: Math.round(heapUsedMB),
        heapTotalMB: Math.round(heapTotalMB),
        checkCount: MemoryGuard.checkCount,
      });
    }
  }

  static getUsage(): MemoryUsage {
    const usage = process.memoryUsage();
    return {
      heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(usage.heapTotal / 1024 / 1024),
      externalMB: Math.round(usage.external / 1024 / 1024),
      rssMB: Math.round(usage.rss / 1024 / 1024),
    };
  }

  static resetCheckCount(): void {
    MemoryGuard.checkCount = 0;
  }
}
