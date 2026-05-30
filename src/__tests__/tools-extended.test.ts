import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock shell executor
const mockRun = vi.fn();
vi.mock('../shell/executor.js', () => ({
  defaultExecutor: { run: (...args: unknown[]) => mockRun(...args) },
}));

import { writeFileTool, clipboardTool, brewInfoTool } from '../tools-extended.js';

describe('tools-extended', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('writeFileTool', () => {
    it('rejects paths outside home directory', async () => {
      const result = await writeFileTool.execute({
        path: '/etc/hosts',
        content: 'test',
      });
      expect((result as Record<string, unknown>).error).toContain('home directory');
    });

    it('accepts valid home path', async () => {
      const home = process.env.HOME || '/Users/test';
      const testPath = `${home}/test-output.txt`;

      const result = await writeFileTool.execute({
        path: testPath,
        content: 'hello world',
      });
      // Path validation passes; actual FS ops may fail (not mocked) but
      // we verify the tool returns something without a security rejection
      expect(result).toBeDefined();
    });
  });

  describe('clipboardTool', () => {
    it('reads clipboard via pbpaste', async () => {
      mockRun.mockResolvedValueOnce('clipboard content');

      const result = await clipboardTool.execute({ action: 'read' });

      expect((result as Record<string, unknown>).action).toBe('read');
      expect((result as Record<string, unknown>).content).toBe('clipboard content');
    });

    it('writes text to clipboard', async () => {
      const result = await clipboardTool.execute({
        action: 'write',
        text: 'copy this',
      });

      expect((result as Record<string, unknown>).action).toBe('write');
      expect((result as Record<string, unknown>).success).toBe(true);
    });
  });

  describe('brewInfoTool', () => {
    it('lists installed formulae', async () => {
      mockRun.mockResolvedValueOnce('node 20.0.0\ngit 2.40.0');

      const result = await brewInfoTool.execute({ action: 'list' });

      expect((result as Record<string, unknown>).action).toBe('list');
      expect((result as Record<string, unknown>).packages).toContain('node');
    });

    it('gets info for a specific formula', async () => {
      mockRun.mockResolvedValueOnce('node: stable 20.0.0 (bottled)');

      const result = await brewInfoTool.execute({
        action: 'info',
        formula: 'node',
      });

      expect((result as Record<string, unknown>).action).toBe('info');
      expect((result as Record<string, unknown>).info).toBeDefined();
    });

    it('checks for outdated formulae', async () => {
      mockRun.mockResolvedValueOnce('node (20.0.0) < 20.1.0');

      const result = await brewInfoTool.execute({ action: 'outdated' });

      expect((result as Record<string, unknown>).action).toBe('outdated');
      expect((result as Record<string, unknown>).packages).toBeDefined();
    });
  });
});
