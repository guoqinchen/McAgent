#!/usr/bin/env tsx
/**
 * McAgent — Headless CLI
 *
 * Usage:
 *   DEEPSEEK_API_KEY=sk-... npx tsx src/headless.ts
 */

import { createMacOSAgent } from './agent.js';

import { macOSDefaultTools } from './tools.js';
import { createInterface } from 'node:readline';
import { logger } from './logging/structured-logger.js';

// ─── Configuration ───────────────────────────────────────────────────────────

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error('❌  DEEPSEEK_API_KEY environment variable is required.');
  console.error('   Get one at: https://platform.deepseek.com/api-docs');
  process.exit(1);
}

// ─── Agent setup ─────────────────────────────────────────────────────────────

logger.info('Headless CLI starting', {
  model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
  thinkingEnabled: process.env.DEEPSEEK_THINKING_ENABLED !== 'false',
  logDir: `${process.env.HOME}/.mcagent/logs/`,
});

const agent = createMacOSAgent({
  apiKey,
  model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
  thinkingEnabled: process.env.DEEPSEEK_THINKING_ENABLED !== 'false',
  reasoningEffort: (process.env.DEEPSEEK_REASONING_EFFORT as 'high' | 'max') || 'high',
  maxContextTokens: Number(process.env.DEEPSEEK_MAX_TOKENS) || undefined,
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
  tools: macOSDefaultTools,
});

// ─── Event hooks ─────────────────────────────────────────────────────────────

const color = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
};

agent.on('thinking:start', function onThinkingStart() {
  process.stdout.write(`${color.magenta}⏳  Processing...${color.reset}\n`);
});

agent.on('tool:call', function onToolCall(name, args) {
  process.stdout.write(
    `  ${color.yellow}🔧 ${name}${color.reset}(${JSON.stringify(args, null, 2)})\n`
  );
});

agent.on('stream:delta', function onStreamDelta(delta) {
  process.stdout.write(delta);
});

agent.on('stream:end', function onStreamEnd() {
  process.stdout.write('\n');
});

agent.on('reasoning:delta', function onReasoningDelta(text) {
  process.stdout.write(`${color.dim}${text}${color.reset}`);
});

agent.on('error', function onError(err) {
  logger.error('Agent error in headless CLI', err);
  console.error(`\n${color.red}❌  Error:${color.reset} ${err.message}`);
});

// ─── Interactive loop ────────────────────────────────────────────────────────

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const welcome = `
${color.magenta}╔══════════════════════════════════════════╗
║           🍏  McAgent                  ║
║  Your AI-powered macOS CLI assistant    ║
╚══════════════════════════════════════════╝${color.reset}
${color.gray}Model: ${agent.model}${color.reset}
${color.gray}Type your macOS question or 'exit' to quit.${color.reset}
`;

console.log(welcome);
console.log(`${color.gray}Logs: ~/.mcagent/logs/${color.reset}`);

function prompt(): void {
  rl.question(`${color.cyan}macOS>${color.reset} `, async (input) => {
    const trimmed = input.trim();
    if (!trimmed) return prompt();
    if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
      console.log(`${color.gray}Goodbye!${color.reset}`);
      rl.close();
      return;
    }

    try {
      await agent.send(trimmed);
    } catch (_err) {
      // Error already emitted via 'error' event
    }
    prompt();
  });
}

prompt();
