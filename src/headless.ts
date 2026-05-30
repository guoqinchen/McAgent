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
import { resolveConfig } from './config/resolver.js';
import { HeadlessRenderer } from './ui/headless-renderer.js';
import type { ToolDisplayResult } from './ui/headless-renderer.js';

// ─── Configuration ───────────────────────────────────────────────────────────

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error('❌  DEEPSEEK_API_KEY environment variable is required.');
  console.error('   Get one at: https://platform.deepseek.com/api-docs');
  process.exit(1);
}

// ─── Agent setup ─────────────────────────────────────────────────────────────

const config = resolveConfig();

const render = new HeadlessRenderer();
const c = render.c;

logger.info('Headless CLI starting', {
  model: config.model ?? 'deepseek-v4-flash',
  thinkingEnabled: config.thinkingEnabled ?? true,
  logDir: `${process.env.HOME}/.mcagent/logs/`,
});

// ─── Startup banner ───────────────────────────────────────────────────────────

render.blank();
render.header('McAgent Headless', false);
render.blank();
render.rule({ label: 'Session Start', char: '━', color: 'header' });
render.badge(`Model: ${config.model ?? 'deepseek-v4-flash'}`, 'info');
render.badge(`Thinking: ${config.thinkingEnabled ?? true ? 'enabled' : 'disabled'}`, 'info');
render.badge(`Logs: ${process.env.HOME}/.mcagent/logs/`, 'info');
render.rule({ char: '━', color: 'muted' });
render.blank();

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

let toolStartTimes = new Map<string, number>();
const toolDisplays: ToolDisplayResult[] = [];

agent.on('thinking:start', function onThinkingStart() {
  toolDisplays.length = 0;
  toolStartTimes.clear();
  render.spinner.start('Processing…');
});

agent.on('thinking:end', function onThinkingEnd() {
  render.spinner.stop();
});

agent.on('tool:call', function onToolCall(name: string, args: unknown) {
  if (render.spinner.isRunning) {
    render.spinner.stop();
  }
  toolStartTimes.set(name, Date.now());
  const argsStr = JSON.stringify(args);
  const preview = argsStr.length > 80 ? argsStr.slice(0, 80) + '…' : argsStr;
  render.toolResult({ name, status: 'running', preview });
});

agent.on('tool:progress', function onToolProgress(progress) {
  const barWidth = 20;
  if (progress.progress !== null) {
    const filled = Math.round((progress.progress / 100) * barWidth);
    const empty = barWidth - filled;
    const bar = `${c.progressBar}${'━'.repeat(filled)}${c.progressBg}${'━'.repeat(empty)}${c.reset}`;
    process.stdout.write(`\r  ${bar} ${progress.progress}% ${c.muted}(${progress.status})${c.reset} `);
  } else {
    const elapsed = formatDuration(progress.elapsedMs);
    process.stdout.write(`\r  ${c.progressBar}⏳${c.reset} ${c.muted}${elapsed} — ${progress.status}${c.reset} `);
  }
});

agent.on('tool:result', function onToolResult(name: string, result: unknown) {
  if (render.spinner.isRunning) render.spinner.stop();

  const duration = toolStartTimes.has(name) ? Date.now() - toolStartTimes.get(name)! : undefined;
  const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
  const isSuccess =
    !resultStr.toLowerCase().startsWith('error') &&
    !resultStr.toLowerCase().includes('command not found') &&
    !resultStr.toLowerCase().includes('failed');
  const status = isSuccess ? 'success' : 'failure';
  const preview = resultStr.length > 60 ? resultStr.slice(0, 60) + '…' : resultStr;

  render.toolResult({ name, status, durationMs: duration, preview });

  const idx = toolDisplays.findIndex((t) => t.name === name && t.status === 'running');
  if (idx !== -1) {
    toolDisplays[idx] = { name, status, durationMs: duration, preview };
  }
});

agent.on('stream:delta', function onStreamDelta(delta: string) {
  if (render.spinner.isRunning) render.spinner.stop();
  process.stdout.write(delta);
});

agent.on('stream:end', function onStreamEnd() {
  process.stdout.write('\n');
  if (toolDisplays.length > 0) {
    render.rule({ char: '─', color: 'muted' });
  }
});

agent.on('reasoning:delta', function onReasoningDelta(text: string) {
  if (render.spinner.isRunning) render.spinner.stop();
  process.stdout.write(`${c.dim}${text}${c.reset}`);
});

agent.on('error', function onError(err: Error) {
  if (render.spinner.isRunning) render.spinner.stop();
  logger.error('Agent error in headless CLI', err);
  render.blank();
  render.error(err, 'Agent encountered an error');
});

agent.on('context:update', function onContextUpdate(ctx) {
  // Context updates are shown in the status line but we don't print them
  // in headless mode to avoid clutter — kept for extensibility
});

// ─── Helper ─────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

// ─── Interactive loop ────────────────────────────────────────────────────────

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Welcome screen
render.blank();
render.writeln(`${c.border}╔══════════════════════════════════════════╗${c.reset}`);
render.writeln(`${c.border}║${c.reset}           ${c.header}🍏  McAgent${c.reset}              ${c.border}║${c.reset}`);
render.writeln(`${c.border}║${c.reset}  ${c.dim}Your AI-powered macOS CLI assistant${c.reset}  ${c.border}║${c.reset}`);
render.writeln(`${c.border}╚══════════════════════════════════════════╝${c.reset}`);
render.writeln(`${c.muted}Type your macOS question or 'exit' to quit.${c.reset}`);
render.blank();

function prompt(): void {
  rl.question(`${c.userLabel}macOS>${c.reset} `, async (input) => {
    const trimmed = input.trim();
    if (!trimmed) return prompt();
    if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
      render.rule({ label: 'Session End', char: '━', color: 'muted' });
      render.writeln(`${c.muted}Goodbye!${c.reset}`);
      rl.close();
      return;
    }

    // Show user message with clear separator
    render.rule({ label: 'You', char: '─', color: 'userLabel' });
    render.writeln(`  ${c.userLabel}${trimmed}${c.reset}`);
    render.rule({ char: '─', color: 'muted' });

    try {
      await agent.send(trimmed);
    } catch (err) {
      // Fallback: log error (primary handling is via 'error' event)
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Headless send failed', error);
      render.blank();
      render.error(error, 'send() failed');
    }
    prompt();
  });
}

prompt();
