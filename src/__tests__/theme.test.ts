import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { detectThemeMode } from '../ui/hooks/use-theme.js';

describe('detectThemeMode', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env vars
    delete process.env.MCAGENT_THEME;
    delete process.env.COLORFGBG;
  });

  afterEach(() => {
    // Restore
    process.env = { ...originalEnv };
  });

  it('returns dark when MCAGENT_THEME=dark', () => {
    process.env.MCAGENT_THEME = 'dark';
    expect(detectThemeMode()).toBe('dark');
  });

  it('returns light when MCAGENT_THEME=light', () => {
    process.env.MCAGENT_THEME = 'light';
    expect(detectThemeMode()).toBe('light');
  });

  it('returns dark when COLORFGBG indicates dark background (0-7 bg)', () => {
    process.env.COLORFGBG = '15;0'; // light fg (15), dark bg (0)
    expect(detectThemeMode()).toBe('dark');
  });

  it('returns light when COLORFGBG indicates light background (8-15 bg)', () => {
    process.env.COLORFGBG = '0;15'; // dark fg (0), light bg (15)
    expect(detectThemeMode()).toBe('light');
  });

  it('returns dark when COLORFGBG bg=7 (dark)', () => {
    process.env.COLORFGBG = '15;7';
    expect(detectThemeMode()).toBe('dark');
  });

  it('returns light when COLORFGBG bg=8 (light)', () => {
    process.env.COLORFGBG = '0;8';
    expect(detectThemeMode()).toBe('light');
  });

  it('defaults to dark when no env vars set', () => {
    expect(detectThemeMode()).toBe('dark');
  });

  it('MCAGENT_THEME overrides COLORFGBG', () => {
    process.env.MCAGENT_THEME = 'light';
    process.env.COLORFGBG = '15;0'; // dark bg
    expect(detectThemeMode()).toBe('light');
  });
});
