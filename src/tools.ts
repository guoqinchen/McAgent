/**
 * McAgent — macOS-specific tools.
 *
 * Each tool exports an object matching the `Tool` interface (name, description,
 * parameters as JSON Schema, execute function).
 */

import type { Tool } from './types/tool.js';
import { defaultExecutor } from './shell/executor.js';

// ─── Helper: safe shell execution ───────────────────────────────────────────

/** @deprecated Use defaultExecutor.run() instead. */
const run = (cmd: string, timeout?: number): Promise<string> => defaultExecutor.run(cmd, timeout);

// ─── Tool: execute a shell command ──────────────────────────────────────────

// ─── Dangerous command detection ──────────────────────────────────────────

interface SafetyCheck {
  safe: boolean;
  reason: string;
}

const DANGEROUS_PATTERNS: { pattern: RegExp; reason: string }[] = [
  // Destructive file operations
  {
    pattern: /\brm\s+(-[a-z]*r[a-z]*[f]?|-[a-z]*f[a-z]*[r]?)\b/i,
    reason: 'recursive force delete (rm -rf) can irreversibly destroy data',
  },
  {
    pattern: /\brm\s+(-[a-z]*r[a-z]*)\b/i,
    reason: 'recursive delete (rm -r) can destroy directories without confirmation',
  },
  {
    pattern: /\brmdir\b/i,
    reason: 'rmdir removes directories; prefer safer alternatives',
  },
  // Disk / device destruction
  {
    pattern: /\bdd\s+if=/i,
    reason: 'dd can overwrite disks and cause irreversible data loss',
  },
  {
    pattern: /\bmkfs\b/i,
    reason: 'mkfs creates filesystems and will erase existing data on the target',
  },
  {
    pattern: /\bnewfs_?\w*/i,
    reason: 'newfs creates filesystems and will erase existing data on the target',
  },
  {
    pattern: /\bdiskutil\s+(eraseDisk|partitionDisk|zeroDisk|randomDisk|secureErase)\b/i,
    reason: 'diskutil erase/partition operations destroy all data on the target disk',
  },
  // Privilege escalation
  {
    pattern: /\bsudo\b/i,
    reason: 'sudo grants root privileges — this bypasses all system safeguards',
  },
  // System integrity & firmware
  {
    pattern: /\bcsrutil\s+(disable|clear)\b/i,
    reason: 'csrutil disable turns off System Integrity Protection, weakening macOS security',
  },
  {
    pattern: /\bnvram\s+-[a-z]*[d]\b/i,
    reason: 'nvram -d deletes firmware variables and can cause boot issues',
  },
  // System service tampering
  {
    pattern: /\blaunchctl\s+(unload|remove)\b/i,
    reason: 'launchctl unload/remove can disable critical system services',
  },
  // Pipe to shell (RCE vector)
  {
    pattern: /\b(curl|wget)\s+.*\|\s*(ba)?sh\b/i,
    reason: 'piping curl/wget output into sh is a remote code execution risk',
  },
];

/**
 * Configure the command allowlist. Commands matching these prefixes bypass the dangerous pattern check.
 */
let commandAllowlist: string[] = ['git', 'npm', 'brew', 'ls', 'cat', 'echo', 'mkdir', 'touch'];
let skipDangerousCheck = false;

export function setCommandAllowlist(list: string[]): void {
  commandAllowlist = list;
}

export function setSkipDangerousCheck(skip: boolean): void {
  skipDangerousCheck = skip;
}

export function isCommandAllowlisted(command: string): boolean {
  const trimmed = command.trim();
  return commandAllowlist.some((prefix) => trimmed.startsWith(prefix + ' ') || trimmed === prefix);
}

export function checkCommand(command: string): SafetyCheck {
  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { safe: false, reason };
    }
  }
  return { safe: true, reason: '' };
}

export const runCommandTool: Tool = {
  readonly: false,
  name: 'run_command',
  description:
    'Execute a macOS shell command (bash/zsh). Returns stdout and stderr. ' +
    'Use this to inspect the system, run diagnostics, or perform actions. ' +
    'Prefer `-r` (read-only) flags where available. ' +
    'For destructive operations, explain the command and ask the user to confirm. ' +
    'Dangerous commands (rm -rf, sudo, dd, diskutil erase, etc.) are blocked and will not execute.',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Shell command to execute',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds (default 30000)',
      },
    },
    required: ['command'],
  },
  execute: async ({ command, timeout }) => {
    const cmd = String(command ?? '');

    // Auto mode: skip all safety checks
    if (skipDangerousCheck) {
      const t = typeof timeout === 'number' ? timeout : undefined;
      return {
        exitCode: 0,
        stdout: await run(cmd, t),
        command: cmd,
        mode: 'auto',
      };
    }

    const isAllowlisted = isCommandAllowlisted(cmd);

    // ─── Safety Check ────────────────────────────────────────────────────────
    // Always check dangerous patterns unless explicitly skipped in 'auto' mode.
    // This prevents command injection like "ls; rm -rf /" even if "ls" is allowlisted.
    const check = checkCommand(cmd);
    if (!check.safe) {
      return {
        exitCode: -1,
        blocked: true,
        reason: check.reason,
        command: cmd,
        message:
          `⚠️  Command BLOCKED: ${check.reason}. ` +
          `Explain this to the user and suggest a safer alternative.`,
      };
    }

    const t = typeof timeout === 'number' ? timeout : undefined;
    return {
      exitCode: 0,
      stdout: await run(cmd, t),
      command: cmd,
    };
  },
};

// ─── Tool: macOS system information ─────────────────────────────────────────

export const systemInfoTool: Tool = {
  readonly: true,
  name: 'get_system_info',
  description:
    'Get detailed macOS system information: hardware, OS version, uptime, memory, CPU, and more.',
  parameters: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['overview', 'hardware', 'software', 'memory', 'disk', 'all'],
        description: 'Which category of system info to retrieve',
      },
    },
  },
  execute: async ({ category }) => {
    const cat = String(category ?? 'all');
    const info: Record<string, string> = {};

    if (!cat || cat === 'overview' || cat === 'all') {
      info.osVersion = await run('sw_vers -productVersion');
      info.build = await run('sw_vers -buildVersion');
      info.hostname = await run('scutil --get ComputerName');
      info.kernel = await run('uname -a');
      info.uptime = await run('uptime');
    }

    if (cat === 'hardware' || cat === 'all') {
      info.chip = await run('sysctl -n machdep.cpu.brand_string');
      info.cores = await run('sysctl -n hw.ncpu');
      info.ram = await run('sysctl -n hw.memsize 2>/dev/null');
      if (info.ram) {
        info.ram = `${(Number(info.ram) / 1024 ** 3).toFixed(1)} GB`;
      }
    }

    if (cat === 'memory' || cat === 'all') {
      info.memoryPressure = await run('memory_pressure 2>/dev/null | head -5');
    }

    if (cat === 'disk' || cat === 'all') {
      info.diskUsage = await run('df -h /');
    }

    return info;
  },
};

// ─── Tool: list running processes ────────────────────────────────────────────

export const processListTool: Tool = {
  readonly: true,
  name: 'list_processes',
  description:
    'List running processes on macOS. Filter by name, user, or sort by resource usage. ' +
    'Also supports process sampling (CPU/call stack analysis) via the "sample" action.',
  parameters: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        description: 'Filter by process name (case-insensitive substring match)',
      },
      sortBy: {
        type: 'string',
        enum: ['cpu', 'mem', 'pid', 'name'],
        description: 'Sort processes by column',
      },
      limit: {
        type: 'number',
        description: 'Number of processes to show (default 20)',
      },
      sample: {
        type: 'number',
        description:
          'If set, sample the top process by CPU for N seconds and show its call stack. ' +
          'Max: 10 seconds. Uses the macOS `sample` command.',
      },
    },
  },
  execute: async ({ filter, sortBy, limit, sample }) => {
    const lim = typeof limit === 'number' ? limit : 20;
    const s = String(sortBy ?? 'cpu');
    const f = filter ? String(filter) : undefined;

    // Use headerless format (col=) to avoid sort + head cutting the header line
    let cmd = `ps -eo pid=,comm=,%cpu=,%mem=,user= -r | sort -k${s === 'mem' ? 4 : 3} -rn | head -${lim}`;
    if (s === 'name') {
      cmd = `ps -eo pid=,comm=,%cpu=,%mem=,user= -k comm | head -${lim}`;
    }

    const raw = await run(cmd);

    if (f) {
      const lines = raw.split('\n').filter((l) => l.toLowerCase().includes(f.toLowerCase()));
      return { count: lines.length, processes: lines };
    }

    const lines = raw.split('\n');

    // If sample is requested, sample the highest-CPU process
    const sam = typeof sample === 'number' ? Math.min(Math.max(sample, 1), 10) : 0;
    if (sam > 0 && lines.length > 1) {
      // The first data line (after potential header) has the highest CPU process
      // Headerless ps output: all lines start with a numeric PID
      const topLine = lines.find(
        (l) => l.trim().length > 0 && !l.startsWith('#') && !isNaN(Number(l.trim().split(/\s+/)[0]))
      );
      // Actually the headerless ps output: first line = top CPU process, format: "PID COMM %CPU %MEM USER"
      const topParts = topLine?.trim().split(/\s+/) ?? [];
      if (topParts.length >= 2) {
        const topPid = parseInt(topParts[0], 10);
        const topName = topParts[1];
        if (topPid && !isNaN(topPid)) {
          const sampleOut = await run(
            `sample ${topPid} ${sam} 2>&1 | head -60`,
            sam * 2000 + 10_000
          );
          const sampleLines = sampleOut.split('\n').filter(Boolean);
          return {
            count: lines.length,
            processes: lines,
            sampled: {
              pid: topPid,
              name: topName,
              duration: sam,
              topStacks: sampleLines.filter((l) => l.match(/^\s+\d+/)).slice(0, 10),
              raw: sampleLines.slice(0, 50),
            },
          };
        }
      }
    }

    return { count: lines.length, processes: lines };
  },
};

// ─── Tool: disk usage analysis ───────────────────────────────────────────────

export const diskUsageTool: Tool = {
  readonly: true,
  name: 'disk_usage',
  description: 'Analyze disk usage on macOS — volume overview or directory breakdown.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path to analyze (default: /)',
      },
      depth: {
        type: 'number',
        description: 'Directory depth for du output (default 1, max 3)',
      },
    },
  },
  execute: async ({ path, depth }) => {
    const p = String(path ?? '/');
    const d = typeof depth === 'number' ? Math.min(depth, 3) : 1;

    const volumes = await run('df -h | head -20');
    const usage = await run(`du -shx "${p}" 2>/dev/null || echo "permission denied"`);

    let topDirs = '';
    if (d > 0) {
      const n = Math.min(15, Math.max(5, 30 / d));
      topDirs = await run(
        `du -shx "${p}"/* 2>/dev/null | sort -rh | head -${n} || echo "permission denied"`
      );
    }

    return { volumes, path: p, totalUsage: usage, topDirectories: topDirs };
  },
};

// ─── Tool: network information ───────────────────────────────────────────────

export const networkInfoTool: Tool = {
  readonly: true,
  name: 'get_network_info',
  description: 'Get macOS network information: interfaces, Wi-Fi status, active connections.',
  parameters: {
    type: 'object',
    properties: {
      detail: {
        type: 'string',
        enum: ['interfaces', 'wifi', 'connections', 'dns', 'all'],
        description: 'What network detail to retrieve',
      },
    },
  },
  execute: async ({ detail }) => {
    const d = String(detail ?? 'all');
    const info: Record<string, string> = {};

    if (d === 'interfaces' || d === 'all') {
      info.interfaces = await run('ifconfig -l');
      info.ip = await run(
        "ifconfig en0 2>/dev/null | grep 'inet ' | awk '{print $2}' || ifconfig en1 2>/dev/null | grep 'inet ' | awk '{print $2}' || echo 'not connected'"
      );
    }

    if (d === 'wifi' || d === 'all') {
      info.wifiStatus = await run(
        "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I 2>/dev/null | head -10 || networksetup -getairportnetwork en0 2>/dev/null || echo 'Wi-Fi info unavailable'"
      );
    }

    if (d === 'connections' || d === 'all') {
      info.listenPorts = await run(
        "lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | head -30 || echo 'permission denied'"
      );
    }

    if (d === 'dns' || d === 'all') {
      info.dns = await run('scutil --dns | head -20');
    }

    return info;
  },
};

// ─── Tool: file search ───────────────────────────────────────────────────────

export const fileSearchTool: Tool = {
  readonly: true,
  name: 'find_files',
  description:
    'Search for files on macOS using Spotlight (mdfind) or find. ' +
    'Faster: use mdfind (Spotlight) for name/content search. Use find for path-based patterns.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query (filename pattern or content)',
      },
      path: {
        type: 'string',
        description: 'Directory to search in (default: home directory)',
      },
      useFind: {
        type: 'boolean',
        description: 'Use Unix find instead of mdfind (for non-indexed locations)',
      },
      limit: {
        type: 'number',
        description: 'Max results (default 30)',
      },
    },
    required: ['query'],
  },
  execute: async ({ query, path, useFind, limit }) => {
    const q = String(query ?? '');
    const p = String(path ?? (process.env.HOME || '/'));
    const uf = useFind === true;
    const lim = typeof limit === 'number' ? limit : 30;

    let output: string;
    if (uf) {
      output = await run(`find "${p}" -maxdepth 5 -iname "*${q}*" 2>/dev/null | head -${lim}`);
    } else {
      output = await run(`mdfind -onlyin "${p}" "${q}" 2>/dev/null | head -${lim}`);
    }

    const lines = output.split('\n').filter(Boolean);
    return { count: lines.length, results: lines };
  },
};

// ─── Tool: read file content ─────────────────────────────────────────────────

export const readFileTool: Tool = {
  readonly: true,
  name: 'read_file',
  description:
    'Read the content of a file on the local filesystem. ' +
    'Useful for inspecting config files, logs, scripts, and text documents.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the file',
      },
      lines: {
        type: 'number',
        description: 'Number of lines to read from the end (default: all)',
      },
    },
    required: ['path'],
  },
  execute: async ({ path, lines }) => {
    const p = String(path ?? '');
    const l = typeof lines === 'number' ? lines : undefined;

    const exists = await run(`test -f "${p}" && echo 'yes' || echo 'no'`);
    if (exists !== 'yes') {
      return { error: `File not found: ${p}` };
    }

    const cmd = l ? `tail -n ${l} "${p}"` : `cat "${p}"`;
    const content = await run(cmd, 10_000);
    const byteCount = await run(`wc -c < "${p}"`);
    const lineCount = await run(`wc -l < "${p}"`);

    return {
      path: p,
      sizeBytes: Number(byteCount),
      totalLines: Number(lineCount),
      content,
    };
  },
};

// ─── Tool: system logs (Unified Logging) ────────────────────────────────────

export const systemLogsTool: Tool = {
  readonly: true,
  name: 'system_logs',
  description:
    'Query the macOS Unified Logging system. Supports filtering by time range, ' +
    'log level, process name, and NSPredicate. ' +
    'Examples: view kernel logs, find errors in the last 5 minutes, ' +
    'stream live logs from a specific process.',
  parameters: {
    type: 'object',
    properties: {
      predicate: {
        type: 'string',
        description:
          'NSPredicate query string, e.g. "eventMessage contains \\"error\\"", ' +
          '"process == \\"kernel\\"", "subsystem == \\"com.apple.wifi\\"". ' +
          'Default: no filter (shows all events).',
      },
      last: {
        type: 'string',
        description:
          'Time range shorthand, e.g. "5m", "1h", "1d". Default: "10m" for last 10 minutes. ' +
          'Use "stream" for live streaming mode.',
      },
      level: {
        type: 'string',
        enum: ['default', 'info', 'debug'],
        description:
          'Minimum log level. Default: "default" (errors + warnings). ' +
          '"info" adds informational messages. "debug" shows everything.',
      },
      process: {
        type: 'string',
        description: 'Filter by process name, e.g. "kernel", "WindowServer", "mds".',
      },
      stream: {
        type: 'boolean',
        description:
          'When true, streams live logs instead of showing historical. ' +
          'Returns a snapshot of recent log lines (streaming is interactive by nature).',
      },
    },
  },
  execute: async ({ predicate, last, level, process, stream }) => {
    const pr = predicate ? String(predicate) : '';
    const ls = String(last ?? '10m');
    const lv = String(level ?? 'default');
    const proc = process ? String(process) : '';
    const str = stream === true;

    // Build the command
    let cmd = 'log ';

    if (str) {
      cmd += 'stream --style compact';
    } else {
      cmd += `show --style compact --last "${ls}"`;
    }

    // Level
    if (lv === 'info') cmd += ' --info';
    else if (lv === 'debug') cmd += ' --debug';

    // Process filter
    if (proc) {
      cmd += ` --predicate 'process == "${proc}"'`;
    }

    // Custom predicate
    if (pr && !proc) {
      // Escape single quotes for shell safety
      const escaped = pr.replace(/'/g, "'\\''");
      cmd += ` --predicate '${escaped}'`;
    }

    // Limit output
    if (!str) cmd += ' | head -200';

    const output = await run(cmd, str ? 5_000 : 15_000);

    const lines = output.split('\n').filter(Boolean);
    return {
      count: lines.length,
      lines: lines.slice(0, 200),
      mode: str ? 'stream' : 'history',
      command: cmd.replace(/'[^']*'/g, "'...'"), // sanitize for display
    };
  },
};

// ─── Export all tools ────────────────────────────────────────────────────────

export const macOSDefaultTools: Tool[] = [
  runCommandTool,
  systemInfoTool,
  processListTool,
  diskUsageTool,
  networkInfoTool,
  fileSearchTool,
  readFileTool,
  systemLogsTool,
];
