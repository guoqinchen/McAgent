#!/usr/bin/env tsx
/**
 * McAgent — Interactive Setup Wizard
 *
 * Usage:
 *   npm run init
 */

import { createInterface, type Interface } from 'node:readline';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { stringify as stringifyYaml } from 'yaml';
import { ensureConfigDir, getConfigPath } from './config/resolver.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function question(rl: Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer: string) => resolve(answer.trim()));
  });
}

function header(text: string): void {
  console.log(`\n\x1b[1;36m${text}\x1b[0m`);
}

function info(text: string): void {
  console.log(`\x1b[90m${text}\x1b[0m`);
}

function success(text: string): void {
  console.log(`\x1b[32m${text}\x1b[0m`);
}

function warn(text: string): void {
  console.log(`\x1b[33m${text}\x1b[0m\n`);
}

// ─── Wizard ─────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const configPath = getConfigPath();

  console.log(`\n\x1b[1;36m  🔧  McAgent Setup Wizard\x1b[0m\n`);
  info('  Configure your McAgent installation. Press Enter to accept defaults.\n');

  // ── Model ─────────────────────────────────────────────────────────────────

  header('🔹 Model Selection');
  console.log('  1. deepseek-v4-flash (fast, economical — recommended)');
  console.log('  2. deepseek-v4-pro (premium, deeper reasoning)');

  const modelChoice = await question(rl, '\n  Choose model [1]: ');
  const model = modelChoice === '2' ? 'deepseek-v4-pro' : 'deepseek-v4-flash';

  // ── Thinking ──────────────────────────────────────────────────────────────

  header('🔹 Thinking Mode');
  const thinkingInput = await question(rl, '  Enable thinking mode? [Y/n]: ');
  const thinkingEnabled = thinkingInput.toLowerCase() !== 'n';

  let reasoningEffort: string = 'high';
  if (thinkingEnabled) {
    console.log('\n  1. high — general tasks (recommended)');
    console.log('  2. max — complex agent/coding (deeper reasoning)');
    const effortChoice = await question(rl, '\n  Choose reasoning effort [1]: ');
    reasoningEffort = effortChoice === '2' ? 'max' : 'high';
  }

  // ── Permission ────────────────────────────────────────────────────────────

  header('🔹 Permission Mode');
  console.log('  1. approve — ask before destructive operations (recommended)');
  console.log('  2. readonly — no write operations allowed');
  console.log('  3. auto — run everything automatically');

  const permChoice = await question(rl, '\n  Choose permission mode [1]: ');
  let permissionMode: string;
  if (permChoice === '2') permissionMode = 'readonly';
  else if (permChoice === '3') permissionMode = 'auto';
  else permissionMode = 'approve';

  // ── Allowlist ─────────────────────────────────────────────────────────────

  header('🔹 Command Allowlist');
  info('  Commands prefixed with these are auto-approved (comma-separated)');
  const allowlistInput = await question(rl, '  [git, npm, brew, ls, cat, find, npx, node, tsx]: ');
  const autoAllowlist =
    allowlistInput.length > 0
      ? allowlistInput
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : ['git', 'npm', 'brew', 'ls', 'cat', 'find', 'npx', 'node', 'tsx'];

  // ── API Key ──────────────────────────────────────────────────────────────

  header('🔹 API Key');
  info('  Your DeepSeek API key (stored as DEEPSEEK_API_KEY env var is recommended)');
  info('  Get one at: https://platform.deepseek.com/api-docs');

  if (process.env.DEEPSEEK_API_KEY) {
    success('  ✓ Found DEEPSEEK_API_KEY in environment');
  } else {
    warn(`  ⚠  No DEEPSEEK_API_KEY found in environment.
  Set it via: export DEEPSEEK_API_KEY=sk-...\n`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────

  header('🔹 Review');
  console.log(`  Model:             ${model}`);
  console.log(`  Thinking:          ${thinkingEnabled ? 'enabled' : 'disabled'}`);
  if (thinkingEnabled) console.log(`  Reasoning Effort:  ${reasoningEffort}`);
  console.log(`  Permission:        ${permissionMode}`);
  console.log(`  Allowlist:         ${autoAllowlist.join(', ')}`);
  console.log(`  Config path:       ${configPath}`);

  const confirm = await question(rl, '\n  Save configuration? [Y/n]: ');
  if (confirm.toLowerCase() === 'n') {
    console.log('\n  Cancelled. No files written.\n');
    rl.close();
    return;
  }

  // ── Write ────────────────────────────────────────────────────────────────

  ensureConfigDir();
  const yamlContent = stringifyYaml({
    model,
    thinking: {
      enabled: thinkingEnabled,
      reasoningEffort,
    },
    permission: {
      mode: permissionMode,
      autoAllowlist: autoAllowlist,
    },
  });

  if (existsSync(configPath)) {
    info(`\n  Backing up existing config to ${configPath}.bak`);
    const oldContent = readFileSync(configPath, 'utf-8');
    writeFileSync(`${configPath}.bak`, oldContent, 'utf-8');
  }

  writeFileSync(configPath, yamlContent, 'utf-8');
  success(`\n✅  Config saved to ${configPath}\n`);

  rl.close();
}

run().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
