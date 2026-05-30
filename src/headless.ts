#!/usr/bin/env tsx
/**
 * McAgent — Headless CLI
 *
 * Usage:
 *   DEEPSEEK_API_KEY=sk-... npx tsx src/headless.ts
 */

import { createMacOSAgent } from './agent.js';

import { macOSDefaultTools } from './tools.js';
import { macOSExtendedTools } from './tools-extended.js';
import { macOSProTools } from './tools-pro.js';
import { createInterface } from 'node:readline';
import { logger } from './logging/structured-logger.js';
import { createAnsiTheme } from './ui/ansi-theme.js';
import { resolveConfig } from './config/resolver.js';

// ─── Configuration ───────────────────────────────────────────────────────────

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error('❌  DEEPSEEK_API_KEY environment variable is required.');
  console.error('   Get one at: https://platform.deepseek.com/api-docs');
  process.exit(1);
}

// ─── Agent setup ─────────────────────────────────────────────────────────────

const config = resolveConfig();

logger.info('Headless CLI starting', {
  model: config.model ?? 'deepseek-v4-flash',
  thinkingEnabled: config.thinkingEnabled ?? true,
  logDir: `${process.env.HOME}/.mcagent/logs/`,
});

const agent = createMacOSAgent({
  apiKey,
  ...config,
  instructions: [
    `You are a macOS expert assistant. Help the user operate their Mac efficiently `,
    `using CLI commands, system utilities, and automation.`,
    ``,
    `Rules:`,
    `- Always explain what a command will do before executing it.`,
    `- For destructive/write operations (rm, kill -9, sudo, diskutil, etc.), ask the user to confirm.`,
    `- Prefer read-only flags by default.`,
    `- If a command fails, suggest alternatives.`,
    `- Keep explanations concise but informative.`,
  ].join('\n'),
  tools: [...macOSDefaultTools, ...macOSExtendedTools, ...macOSProTools],
});

// ─── Event hooks ─────────────────────────────────────────────────────────────

const c = createAnsiTheme();

let isStreaming = false;

agent.on('thinking:start', function onThinkingStart() {
  isStreaming = true;
  process.stdout.write(`${c.header}⏳  Processing...${c.reset}\n`);
});

agent.on('thinking:end', function onThinkingEnd() {
  isStreaming = false;
});

agent.on('tool:call', function onToolCall(name, args) {
  process.stdout.write(`  ${c.toolCall}🔧 ${name}${c.reset}(${JSON.stringify(args)}\n`);
});

agent.on('tool:result', function onToolResult(name, result) {
  const preview =
    typeof result === 'string' && result.length > 120 ? result.slice(0, 120) + '…' : String(result);
  process.stdout.write(`  ${c.success}✓ ${name}${c.reset}: ${preview}\n`);
});

agent.on('stream:delta', function onStreamDelta(delta) {
  process.stdout.write(delta);
});

agent.on('stream:end', function onStreamEnd() {
  process.stdout.write('\n');
});

agent.on('reasoning:delta', function onReasoningDelta(text) {
  process.stdout.write(`${c.dim}${text}${c.reset}`);
});

agent.on('error', function onError(err) {
  logger.error('Agent error in headless CLI', err);
  console.error(`\n${c.error}❌  Error:${c.reset} ${err.message}`);
});

// ─── Interactive loop ────────────────────────────────────────────────────────

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const welcome = `
${c.header}╔══════════════════════════════════════════╗
║           🍏  McAgent                  ║
║  Your AI-powered macOS CLI assistant    ║
╚══════════════════════════════════════════╝${c.reset}
${c.muted}Model: ${agent.model}${c.reset}
${c.muted}Type your macOS question or 'exit' to quit.${c.reset}
`;

console.log(welcome);
console.log(`${c.muted}Logs: ~/.mcagent/logs/${c.reset}`);

function prompt(): void {
  rl.question(`${c.userLabel}macOS>${c.reset} `, async (input) => {
    const trimmed = input.trim();
    if (!trimmed) return prompt();
    if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
      console.log(`${c.muted}Goodbye!${c.reset}`);
      rl.close();
      return;
    }

    try {
      await agent.send(trimmed);
    } catch (err) {
      // Fallback: log error (primary handling is via 'error' event)
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Headless send failed', error);
      console.error(`\n${c.error}❌  Error:${c.reset} ${error.message}`);
    }
    prompt();
  });
}

prompt();
