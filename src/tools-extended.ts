/**
 * Extended macOS tools for McAgent.
 *
 * Add these alongside the default tools for expanded capability.
 *
 *   import { macOSDefaultTools } from './tools.js';
 *   import { macOSExtendedTools } from './tools-extended.js';
 *   const agent = createMacOSAgent({ ..., tools: [...macOSDefaultTools, ...macOSExtendedTools] });
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, normalize, dirname } from 'node:path';
import { homedir } from 'node:os';
import type { Tool } from './types/tool.js';
import { defaultExecutor } from './shell/executor.js';

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** @deprecated Use defaultExecutor.run() instead. */
const run = (cmd: string, timeout?: number) => defaultExecutor.run(cmd, timeout);

// (removed escapeSed — edit_file now uses Node.js native replaceAll instead of sed)

function safePath(p: string): string {
  const home = process.env.HOME ?? homedir();
  const expanded = p.startsWith('~') ? p.replace(/^~/, home) : p;
  const absPath = resolve(normalize(expanded));
  if (!absPath.startsWith(home)) return '';
  return absPath;
}

// ─── Tool 1: write_file ────────────────────────────────────────────────────────

export const writeFileTool: Tool = {
  readonly: false,
  name: 'write_file',
  description:
    'Write content to a file. Restricted to paths under the user home directory for safety.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute file path (must be under home directory)',
      },
      content: {
        type: 'string',
        description: 'Content to write to the file',
      },
    },
    required: ['path', 'content'],
  },
  execute: async ({ path, content }) => {
    const p = safePath(String(path ?? ''));
    if (!p) return { error: 'Path must be under home directory' };

    const text = String(content ?? '');
    try {
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, text, 'utf-8');
      return {
        success: true,
        path: p,
        bytesWritten: Buffer.byteLength(text, 'utf-8'),
      };
    } catch (err) {
      return { error: `Failed to write file: ${String(err)}` };
    }
  },
};

// ─── Tool 2: edit_file ─────────────────────────────────────────────────────────

export const editFileTool: Tool = {
  readonly: false,
  name: 'edit_file',
  description:
    'Replace all occurrences of a literal string in a file. Restricted to paths under home directory.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute file path (must be under home directory)',
      },
      old: {
        type: 'string',
        description: 'Exact text to find and replace',
      },
      new: {
        type: 'string',
        description: 'Replacement text',
      },
    },
    required: ['path', 'old', 'new'],
  },
  execute: async ({ path, old: oldStr, new: newStr }) => {
    const p = safePath(String(path ?? ''));
    if (!p) return { error: 'Path must be under home directory' };

    if (!existsSync(p)) return { error: `File not found: ${p}` };

    const oldText = String(oldStr ?? '');
    if (!oldText) return { error: 'Search text cannot be empty' };
    const newText = String(newStr ?? '');

    const content = readFileSync(p, 'utf-8');
    const replaced = content.replaceAll(oldText, newText);
    const diffChars = content.length - replaced.length;
    const occurrences = oldText.length > 0 ? Math.round(diffChars / oldText.length) : 0;

    writeFileSync(p, replaced, 'utf-8');

    return {
      success: true,
      path: p,
      linesAfter: replaced.split('\n').length,
      replacements: occurrences,
    };
  },
};

// ─── Tool 3: open_app ──────────────────────────────────────────────────────────

export const openAppTool: Tool = {
  readonly: false,
  name: 'open_app',
  description: 'Open a macOS application by name or path.',
  parameters: {
    type: 'object',
    properties: {
      app: {
        type: 'string',
        description: 'Application name (e.g. "Safari") or path to .app bundle',
      },
    },
    required: ['app'],
  },
  execute: async ({ app }) => {
    const name = String(app ?? '');
    const out = run(`open -a "${name}" 2>&1`);
    return { success: !out, app: name, error: out || null };
  },
};

// ─── Tool 4: clipboard ─────────────────────────────────────────────────────────

export const clipboardTool: Tool = {
  readonly: false,
  name: 'clipboard',
  description: 'Read from or write to the macOS system clipboard (pbpaste / pbcopy).',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['read', 'write'],
        description: 'Read clipboard content or write text to it',
      },
      text: {
        type: 'string',
        description: 'Text to copy to clipboard (only when action is "write")',
      },
    },
    required: ['action'],
  },
  execute: async ({ action, text }) => {
    if (action === 'read') {
      const content = run('pbpaste 2>/dev/null');
      return { action: 'read', content, length: content.length };
    }
    const t = String(text ?? '');
    const { execSync } = await import('node:child_process');
    execSync('pbcopy', { input: t });
    return { action: 'write', success: true, length: t.length };
  },
};

// ─── Tool 5: brew_info ─────────────────────────────────────────────────────────

export const brewInfoTool: Tool = {
  readonly: true,
  name: 'brew_info',
  description: 'Manage and inspect Homebrew packages (list installed, get info, check outdated).',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['list', 'info', 'outdated'],
        description:
          'list = installed formulae, info = details for a formula, outdated = stale packages',
      },
      formula: {
        type: 'string',
        description: 'Formula name for "info" action',
      },
    },
    required: ['action'],
  },
  execute: async ({ action, formula }) => {
    const a = String(action ?? 'list');
    if (a === 'list') {
      const list = run('brew list --versions 2>/dev/null | head -100');
      return { action: 'list', packages: list };
    }
    if (a === 'info') {
      const f = String(formula ?? '');
      if (!f) return { error: 'formula name required for "info" action' };
      const info = run(`brew info "${f}" 2>/dev/null`);
      return { action: 'info', formula: f, info };
    }
    if (a === 'outdated') {
      const outdated = run('brew outdated 2>/dev/null');
      return { action: 'outdated', packages: outdated || 'none' };
    }
    return { error: `Unknown action: ${a}` };
  },
};

// ─── Tool 6: software_update ───────────────────────────────────────────────────

export const softwareUpdateTool: Tool = {
  readonly: true,
  name: 'software_update',
  description: 'Check for available macOS software updates (may require sudo password).',
  parameters: {
    type: 'object',
    properties: {
      check: {
        type: 'string',
        enum: ['list', 'history'],
        description: 'list = available updates, history = past updates log. Default: list.',
      },
    },
  },
  execute: async ({ check }) => {
    const c = String(check ?? 'list');
    if (c === 'history') {
      const history = run('softwareupdate --history 2>/dev/null | head -30');
      return { action: 'history', history };
    }
    const list = run('softwareupdate -l 2>/dev/null | head -30');
    return { action: 'list', updates: list };
  },
};

// ─── Tool 7: battery ───────────────────────────────────────────────────────────

export const batteryTool: Tool = {
  readonly: true,
  name: 'battery',
  description: 'Get macOS battery and power status.',
  parameters: { type: 'object', properties: {} },
  execute: async () => {
    const batt = run('pmset -g batt 2>/dev/null');
    const ps = run('pmset -g ps 2>/dev/null');

    // Parse percentage from "NN%" pattern
    const pctMatch = batt.match(/(\d+)%/);
    const charging = /charging/i.test(batt);
    const discharging = /discharging/i.test(batt);
    const full = /charged/i.test(batt);

    let status = 'unknown';
    if (full) status = 'fully charged';
    else if (charging) status = 'charging';
    else if (discharging) status = 'discharging';

    // Fetch cycle count and health from system_profiler
    const powerData = run(
      'system_profiler SPPowerDataType 2>/dev/null | grep -E "Cycle Count|Condition|Maximum Capacity|Temperature" | head -5'
    );
    const cycleMatch = powerData.match(/Cycle Count:\s*(\d+)/);
    const healthMatch = powerData.match(/Condition:\s*(\w+)/);
    const capacityMatch = powerData.match(/Maximum Capacity:\s*(\d+)%/);
    const tempMatch = powerData.match(/Temperature.*?:\s*(\d+)/);

    return {
      percentage: pctMatch ? Number(pctMatch[1]) : null,
      status,
      cycleCount: cycleMatch ? Number(cycleMatch[1]) : null,
      health: healthMatch ? healthMatch[1] : null,
      maxCapacityPercent: capacityMatch ? Number(capacityMatch[1]) : null,
      temperature: tempMatch ? `${tempMatch[1]}°C` : null,
      raw: batt,
      powerSources: ps,
    };
  },
};

// ─── Tool 8: screenshot ────────────────────────────────────────────────────────

export const screenshotTool: Tool = {
  readonly: true,
  name: 'screenshot',
  description: 'Take a screenshot on macOS using screencapture.',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['interactive', 'window', 'fullscreen'],
        description: 'Screenshot mode: interactive (select area), window, or fullscreen',
      },
      path: {
        type: 'string',
        description: 'Save path (default: ~/Desktop/screenshot-<timestamp>.png)',
      },
    },
  },
  execute: async ({ type, path }) => {
    const t = String(type ?? 'fullscreen');
    let p = path ? safePath(String(path)) : '';
    if (!p) {
      const ts = Date.now();
      p = `${process.env.HOME ?? homedir()}/Desktop/screenshot-${ts}.png`;
    }

    // screencapture with no flags defaults to fullscreen capture
    const flags: Record<string, string> = {
      interactive: '-i',
      window: '-W',
      fullscreen: '',
    };
    const flag = flags[t] ?? '';

    run(`screencapture ${flag} "${p}" 2>/dev/null`);
    const exists = run(`test -f "${p}" && echo yes || echo no`);
    const size = exists === 'yes' ? run(`wc -c < "${p}"`) : '0';

    return {
      success: exists === 'yes',
      path: p,
      sizeBytes: Number(size),
      mode: t,
    };
  },
};

// ─── Export all extended tools ─────────────────────────────────────────────────

export const macOSExtendedTools: Tool[] = [
  writeFileTool,
  editFileTool,
  openAppTool,
  clipboardTool,
  brewInfoTool,
  softwareUpdateTool,
  batteryTool,
  screenshotTool,
];
