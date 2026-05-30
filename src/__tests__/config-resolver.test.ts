import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

// Mock fs to control config file existence and content
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import { resolveConfig, getConfigDir, getConfigPath } from '../config/resolver.js';

describe('config/resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset relevant env vars before each test
    delete process.env.DEEPSEEK_MODEL;
    delete process.env.DEEPSEEK_BASE_URL;
    delete process.env.DEEPSEEK_THINKING_ENABLED;
    delete process.env.DEEPSEEK_REASONING_EFFORT;
    delete process.env.DEEPSEEK_MAX_TOKENS;
  });

  describe('getConfigDir', () => {
    it('returns ~/.mcagent path', () => {
      const dir = getConfigDir();
      expect(dir).toContain('.mcagent');
    });
  });

  describe('getConfigPath', () => {
    it('returns ~/.mcagent/config.yaml path', () => {
      const path = getConfigPath();
      expect(path).toContain('.mcagent/config.yaml');
    });
  });

  describe('resolveConfig', () => {
    it('returns defaults when no config file or env vars exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const config = resolveConfig();
      expect(config.model).toBe('deepseek-v4-flash');
      expect(config.thinkingEnabled).toBe(true);
      expect(config.reasoningEffort).toBe('high');
      expect(config.permissionMode).toBe('approve');
    });

    it('merges YAML config on top of defaults', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(`
model: deepseek-v4-pro
thinking:
  enabled: false
  reasoningEffort: max
permission:
  mode: auto
`);

      const config = resolveConfig();
      expect(config.model).toBe('deepseek-v4-pro');
      expect(config.thinkingEnabled).toBe(false);
      expect(config.reasoningEffort).toBe('max');
      expect(config.permissionMode).toBe('auto');
    });

    it('gives env vars highest priority', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(`
model: from-yaml
`);

      process.env.DEEPSEEK_MODEL = 'from-env';

      const config = resolveConfig();
      expect(config.model).toBe('from-env');
    });

    it('correctly parses DEEPSEEK_THINKING_ENABLED=false', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      process.env.DEEPSEEK_THINKING_ENABLED = 'false';

      const config = resolveConfig();
      expect(config.thinkingEnabled).toBe(false);
    });

    it('validates DEEPSEEK_REASONING_EFFORT only accepts high or max', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      process.env.DEEPSEEK_REASONING_EFFORT = 'invalid_value';

      const config = resolveConfig();
      // Should fall back to default 'high'
      expect(config.reasoningEffort).toBe('high');
    });

    it('gracefully handles invalid YAML by falling back to defaults', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue('invalid: [yaml: {{{');

      const config = resolveConfig();
      // Should return defaults when YAML parse fails
      expect(config.model).toBe('deepseek-v4-flash');
    });

    it('parses DEEPSEEK_MAX_TOKENS as number', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      process.env.DEEPSEEK_MAX_TOKENS = '500000';

      const config = resolveConfig();
      expect(config.maxContextTokens).toBe(500000);
    });

    it('ignores non-numeric DEEPSEEK_MAX_TOKENS', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      process.env.DEEPSEEK_MAX_TOKENS = 'not-a-number';

      const config = resolveConfig();
      // Should fall back to default
      expect(config.maxContextTokens).toBe(900_000);
    });
  });
});
