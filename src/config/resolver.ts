/**
 * Configuration resolver for McAgent.
 *
 * Resolves config from three sources in priority order:
 *   1. Built-in defaults (lowest)
 *   2. ~/.mcagent/config.yaml
 *   3. Environment variables (highest)
 *
 * Returns a partial McAgentConfig — callers layer their
 * own programmatic overrides on top.
 */

import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import type { McAgentConfig, PermissionMode, ReasoningEffort } from '../types/config.js';

// ─── YAML file shape ───────────────────────────────────────────────────────

interface ConfigFile {
  model?: string;
  thinking?: {
    enabled?: boolean;
    reasoningEffort?: ReasoningEffort;
  };
  permission?: {
    mode?: PermissionMode;
    autoAllowlist?: string[];
  };
  context?: {
    maxTokens?: number;
  };
  api?: {
    baseURL?: string;
    provider?: string;
  };
}

// ─── Paths ─────────────────────────────────────────────────────────────────

const HOME = process.env.HOME ?? homedir();
const CONFIG_DIR = resolve(HOME, '.mcagent');
const CONFIG_PATH = resolve(CONFIG_DIR, 'config.yaml');

// ─── Built-in defaults ─────────────────────────────────────────────────────

const DEFAULTS: Partial<McAgentConfig> = {
  model: 'deepseek-v4-flash',
  baseURL: 'https://api.deepseek.com',
  thinkingEnabled: true,
  reasoningEffort: 'high',
  permissionMode: 'approve',
  maxContextTokens: 96_000,
};

// ─── YAML file loading ─────────────────────────────────────────────────────

function loadConfigFile(): ConfigFile | null {
  if (!existsSync(CONFIG_PATH)) return null;

  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = parseYaml(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as ConfigFile;
  } catch {
    // Silently skip invalid YAML — fall back to env vars / defaults
    return null;
  }
}

// ─── Env var overrides ─────────────────────────────────────────────────────

function envOverrides(): Partial<McAgentConfig> {
  const overrides: Partial<McAgentConfig> = {};

  if (process.env.DEEPSEEK_MODEL) overrides.model = process.env.DEEPSEEK_MODEL;
  if (process.env.DEEPSEEK_BASE_URL) overrides.baseURL = process.env.DEEPSEEK_BASE_URL;

  if (process.env.DEEPSEEK_THINKING_ENABLED) {
    overrides.thinkingEnabled = process.env.DEEPSEEK_THINKING_ENABLED !== 'false';
  }

  if (process.env.DEEPSEEK_REASONING_EFFORT) {
    const effort = process.env.DEEPSEEK_REASONING_EFFORT;
    if (effort === 'high' || effort === 'max') {
      overrides.reasoningEffort = effort;
    }
  }

  if (process.env.DEEPSEEK_MAX_TOKENS) {
    const tokens = Number(process.env.DEEPSEEK_MAX_TOKENS);
    if (Number.isFinite(tokens)) overrides.maxContextTokens = tokens;
  }

  return overrides;
}

// ─── Merge helper: YAML → config ───────────────────────────────────────────

function configFileToConfig(f: ConfigFile): Partial<McAgentConfig> {
  const partial: Partial<McAgentConfig> = {};

  if (f.model !== undefined) partial.model = f.model;

  if (f.thinking) {
    if (f.thinking.enabled !== undefined) partial.thinkingEnabled = f.thinking.enabled;
    if (f.thinking.reasoningEffort !== undefined) {
      partial.reasoningEffort = f.thinking.reasoningEffort;
    }
  }

  if (f.permission) {
    if (f.permission.mode !== undefined) partial.permissionMode = f.permission.mode;
    if (f.permission.autoAllowlist !== undefined) {
      partial.autoAllowlist = f.permission.autoAllowlist;
    }
  }

  if (f.context?.maxTokens !== undefined) {
    partial.maxContextTokens = f.context.maxTokens;
  }

  if (f.api?.baseURL !== undefined) partial.baseURL = f.api.baseURL;

  return partial;
}

// ─── Public API ────────────────────────────────────────────────────────────

/** Path to the config directory (~/.mcagent). */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/** Path to the config file (~/.mcagent/config.yaml). */
export function getConfigPath(): string {
  return CONFIG_PATH;
}

/**
 * Resolve resolved config from all sources.
 *
 * Priority: env vars > config.yaml > built-in defaults.
 *
 * Callers should spread this first, then layer their own overrides:
 *
 *   const agent = createMacOSAgent({ ...resolveConfig(), apiKey: 'sk-...' });
 */
export function resolveConfig(): Partial<McAgentConfig> {
  const file = loadConfigFile();
  const fromFile = file ? configFileToConfig(file) : {};
  const fromEnv = envOverrides();

  return {
    ...DEFAULTS,
    ...fromFile,
    ...fromEnv,
  };
}

/**
 * Ensure the config directory exists. Idempotent.
 */
export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}
