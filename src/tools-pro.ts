/**
 * McAgent — pro/advanced macOS diagnostic tools.
 *
 * These tools provide deeper system introspection capabilities:
 * network diagnostics, process sampling, security auditing,
 * and power management analysis.
 *
 * Usage:
 *   import { macOSDefaultTools } from './tools.js';
 *   import { macOSExtendedTools } from './tools-extended.js';
 *   import { macOSProTools } from './tools-pro.js';
 *   const agent = createMacOSAgent({
 *     tools: [...macOSDefaultTools, ...macOSExtendedTools, ...macOSProTools],
 *   });
 */

import type { Tool } from './types/tool.js';
import { defaultExecutor } from './shell/executor.js';

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** @deprecated Use defaultExecutor.run() instead. */
const run = (cmd: string, timeout?: number) => defaultExecutor.run(cmd, timeout);

// ─── Tool 1: network_diagnostics ──────────────────────────────────────────────

export const networkDiagnosticsTool: Tool = {
  readonly: true,
  name: 'network_diagnostics',
  description:
    'Run network diagnostics: ping, traceroute, DNS lookup, port check, and ' +
    'Apple network quality test. All operations are read-only.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['ping', 'traceroute', 'dns', 'port', 'quality'],
        description:
          'Diagnostic action. "ping" = ICMP echo test, ' +
          '"traceroute" = path hop analysis, "dns" = DNS resolution, ' +
          '"port" = TCP port connectivity, "quality" = Apple networkQuality test.',
      },
      target: {
        type: 'string',
        description:
          'Target hostname or IP address. Used by ping, traceroute, dns, and port actions. ' +
          'Default: "google.com" for ping/traceroute/dns, "8.8.8.8" for port.',
      },
      port: {
        type: 'number',
        description: 'TCP port number for the "port" action. Default: 443.',
      },
      count: {
        type: 'number',
        description: 'Number of probes for ping. Default: 4.',
      },
    },
    required: ['action'],
  },
  execute: async ({ action, target, port, count }) => {
    const a = String(action ?? 'ping');
    const t = target ? String(target) : (a === 'port' ? '8.8.8.8' : 'google.com');
    const p = typeof port === 'number' ? port : 443;
    const c = typeof count === 'number' ? Math.min(count, 20) : 4;

    switch (a) {
      case 'ping': {
        const pingCmd = `ping -c ${c} -t 5 "${t}" 2>&1`;
        const pingOut = run(pingCmd, 15_000);
        // Parse summary line
        const summary = pingOut.split('\n').filter(l => l.includes('round-trip'));
        const stats = pingOut.split('\n').filter(l => l.includes('packets'));
        return {
          action: 'ping',
          target: t,
          packets: stats.join(' | '),
          latency: summary.join(' | ') || 'no data',
          raw: pingOut.split('\n').slice(-4).join('\n'),
        };
      }
      case 'traceroute': {
        const traceCmd = `traceroute -m 15 -q 1 "${t}" 2>&1 | head -20`;
        const traceOut = run(traceCmd, 30_000);
        const hops = traceOut.split('\n').filter(Boolean);
        return {
          action: 'traceroute',
          target: t,
          hops: hops.length,
          path: hops,
        };
      }
      case 'dns': {
        // Try dig first, fall back to host
        const cmd = `dig +short "${t}" 2>/dev/null || host "${t}" 2>/dev/null || echo 'DNS resolution failed'`;
        const output = run(cmd, 10_000);
        const results = output.split('\n').filter(Boolean);
        // Also show system DNS config
        const dnsConfig = run('scutil --dns | head -10');
        return {
          action: 'dns',
          target: t,
          addresses: results,
          systemDns: dnsConfig.split('\n').slice(0, 5),
        };
      }
      case 'port': {
        const cmd = `nc -zv -w 3 "${t}" ${p} 2>&1`;
        const output = run(cmd, 10_000);
        const succeeded = output.includes('succeeded') || !output.includes('refused') && !output.includes('failed');
        return {
          action: 'port',
          target: t,
          port: p,
          open: succeeded,
          raw: output,
        };
      }
      case 'quality': {
        const cmd = 'networkQuality -v 2>/dev/null | head -20';
        const output = run(cmd, 60_000);
        const lines = output.split('\n').filter(Boolean);
        return {
          action: 'quality',
          results: lines,
        };
      }
      default:
        return { error: `Unknown action: ${a}` };
    }
  },
};

// ─── Tool 2: system_diagnostics ──────────────────────────────────────────────

export const systemDiagnosticsTool: Tool = {
  readonly: true,
  name: 'system_diagnostics',
  description:
    'Deep system diagnostics: process sampling, thermal/power metrics, ' +
    'and system diagnostic packages. ' +
    'Some operations require sudo and may prompt for a password.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['sample', 'thermal', 'disk_io', 'memory_pressure', 'sysdiagnose'],
        description:
          '"sample" = sample a process for N seconds (CPU/call stack). ' +
          '"thermal" = CPU temperature, fan speed, thermal pressure. ' +
          '"disk_io" = I/O statistics per disk. ' +
          '"memory_pressure" = memory pressure and paging stats. ' +
          '"sysdiagnose" = generate full diagnostic package (may be large).',
      },
      pid: {
        type: 'number',
        description: 'Process ID for "sample" action.',
      },
      duration: {
        type: 'number',
        description: 'Sampling duration in seconds for "sample". Default: 5, max: 30.',
      },
      processName: {
        type: 'string',
        description: 'Process name for "sample" when pid is not available.',
      },
    },
    required: ['action'],
  },
  execute: async ({ action, pid, duration, processName }) => {
    const a = String(action ?? 'memory_pressure');
    const dur = typeof duration === 'number' ? Math.min(duration, 30) : 5;

    switch (a) {
      case 'sample': {
        let targetPid = typeof pid === 'number' ? pid : 0;
        if (!targetPid && processName) {
          const pidStr = run(`pgrep -x "${processName}" | head -1`);
          targetPid = parseInt(pidStr, 10) || 0;
        }
        if (!targetPid) return { error: 'No process specified: provide pid or processName' };
        const cmd = `sample ${targetPid} ${dur} 2>&1 | head -100`;
        const output = run(cmd, dur * 2000 + 10_000);
        const lines = output.split('\n').filter(Boolean);
        // Parse the top call weight
        const heavyStack = lines.filter(l => l.match(/^\s+\d+/));
        return {
          action: 'sample',
          pid: targetPid,
          duration: dur,
          totalLines: lines.length,
          topStacks: heavyStack.slice(0, 15),
          raw: lines.slice(0, 80),
        };
      }
      case 'thermal': {
        const cmd = 'pmset -g therm 2>/dev/null';
        const output = run(cmd);
        const thermalPressure = output;
        // Try powermetrics for temperature (requires sudo, may fail)
        const temp = run("sudo powermetrics --samplers smc -i 500 -n 1 2>/dev/null | grep -i 'temperature\\|fan' | head -5 || echo '(requires sudo for thermal data)'");
        return {
          action: 'thermal',
          thermalPressure: thermalPressure || 'no thermal data',
          sensors: temp.split('\n').filter(Boolean),
        };
      }
      case 'disk_io': {
        const cmd = 'iostat -Id 2 2 2>/dev/null | tail -20';
        const output = run(cmd, 5_000);
        const lines = output.split('\n').filter(Boolean);
        return {
          action: 'disk_io',
          stats: lines,
        };
      }
      case 'memory_pressure': {
        const pressure = run('memory_pressure 2>/dev/null | head -10');
        const vm = run('vm_stat 2>/dev/null | head -20');
        return {
          action: 'memory_pressure',
          pressure: pressure.split('\n').filter(Boolean),
          vmStats: vm.split('\n').filter(Boolean),
        };
      }
      case 'sysdiagnose': {
        const cmd = 'sudo sysdiagnose -f /tmp -b 2>&1 | tail -5';
        const output = run(cmd, 120_000);
        return {
          action: 'sysdiagnose',
          result: output || 'sysdiagnose started — check /var/tmp for .tar.gz',
        };
      }
      default:
        return { error: `Unknown action: ${a}` };
    }
  },
};

// ─── Tool 3: security_check ─────────────────────────────────────────────────

export const securityCheckTool: Tool = {
  readonly: true,
  name: 'security_check',
  description:
    'Check macOS security posture: SIP status, FileVault, Gatekeeper, ' +
    'code signing, and system integrity. All operations are read-only.',
  parameters: {
    type: 'object',
    properties: {
      check: {
        type: 'string',
        enum: ['sip', 'filevault', 'gatekeeper', 'codesign', 'all'],
        description:
          '"sip" = System Integrity Protection status. ' +
          '"filevault" = FileVault encryption status. ' +
          '"gatekeeper" = Gatekeeper assessment policy. ' +
          '"codesign" = verify code signing of a specified app. ' +
          '"all" = comprehensive security overview.',
      },
      path: {
        type: 'string',
        description:
          'Path to an application or binary for "codesign" check. ' +
          'Example: "/Applications/Safari.app".',
      },
    },
    required: ['check'],
  },
  execute: async ({ check, path }) => {
    const c = String(check ?? 'all');
    const p = path ? String(path) : '';

    const results: Record<string, unknown> = {};

    if (c === 'sip' || c === 'all') {
      const sipStatus = run('csrutil status 2>/dev/null');
      results.sip = sipStatus;
    }

    if (c === 'filevault' || c === 'all') {
      const fvStatus = run('fdesetup status 2>/dev/null');
      results.fileVault = fvStatus;
      if (fvStatus.includes('On')) {
        const fvUsers = run('fdesetup list 2>/dev/null');
        results.fileVaultUsers = fvUsers.split('\n').filter(Boolean);
      }
    }

    if (c === 'gatekeeper' || c === 'all') {
      const gkStatus = run('spctl --status 2>/dev/null');
      results.gatekeeper = gkStatus;
      // macOS 14+ also has
      const gkAssess = run('spctl --global-state 2>/dev/null || echo "(not available on this version)"');
      results.gatekeeperDetail = gkAssess;
    }

    if (c === 'codesign' || (c === 'all' && p)) {
      if (p) {
        const csInfo = run(`codesign -dvvv "${p}" 2>&1 | head -20`);
        const csValid = run(`codesign -v "${p}" 2>&1 || echo 'INVALID'`);
        results.codesign = {
          path: p,
          info: csInfo.split('\n').filter(Boolean),
          valid: !csValid.includes('INVALID'),
        };
      } else {
        results.codesign = { error: 'No path provided for codesign check' };
      }
    }

    // Additional security info for 'all'
    if (c === 'all') {
      const secureBoot = run('sysctl kern.secureboot 2>/dev/null');
      results.secureBoot = secureBoot;

      // XProtect version (macOS built-in malware protection)
      const xprotect = run('system_profiler SPInstallHistoryDataType 2>/dev/null | grep -A2 XProtect | head -5');
      results.xprotectInfo = xprotect.split('\n').filter(Boolean);

      // Firewall status
      const fw = run('/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null');
      results.firewall = fw;
    }

    return results;
  },
};

// ─── Tool 4: power_management ────────────────────────────────────────────────

export const powerManagementTool: Tool = {
  readonly: true,
  name: 'power_management',
  description:
    'Query macOS power management settings and status. ' +
    'Read-only: reports current configuration, battery health, ' +
    'sleep assertions, and power event logs without making changes.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['settings', 'battery', 'assertions', 'log'],
        description:
          '"settings" = current power management settings (pmset -g). ' +
          '"battery" = detailed battery info including cycle count and health. ' +
          '"assertions" = processes preventing sleep. ' +
          '"log" = recent power events.',
      },
    },
    required: ['action'],
  },
  execute: async ({ action }) => {
    const a = String(action ?? 'settings');

    switch (a) {
      case 'settings': {
        const settings = run('pmset -g 2>/dev/null');
        const custom = run('pmset -g custom 2>/dev/null');
        const lines = settings.split('\n').filter(Boolean);
        return {
          action: 'settings',
          current: lines,
          perProfile: custom ? custom.split('\n').filter(Boolean) : [],
        };
      }
      case 'battery': {
        const batt = run('pmset -g batt 2>/dev/null');

        // Parse percentage
        const pctMatch = batt.match(/(\d+)%/);
        // Parse cycle count from system_profiler
        const cycleInfo = run(
          `system_profiler SPPowerDataType 2>/dev/null | grep -E "Cycle Count|Health Information|Condition|Temperature" | head -10`
        );
        const cycles = cycleInfo.split('\n').filter(Boolean);

        let status = 'unknown';
        if (/charged/i.test(batt)) status = 'fully charged';
        else if (/charging/i.test(batt)) status = 'charging';
        else if (/discharging/i.test(batt)) status = 'discharging';

        return {
          action: 'battery',
          percentage: pctMatch ? Number(pctMatch[1]) : null,
          status,
          cycles: cycles.length > 0 ? cycles : 'No detailed battery data (may require SIP permissive)',
          raw: batt,
        };
      }
      case 'assertions': {
        const asserts = run('pmset -g assertions 2>/dev/null | head -40');
        const lines = asserts.split('\n').filter(Boolean);
        // Extract processes that are preventing sleep
        const preventers = lines.filter(l =>
          l.includes('PreventUserIdle') || l.includes('PreventSystemSleep')
        );
        return {
          action: 'assertions',
          total: lines.length,
          preventSleep: preventers,
          details: lines,
        };
      }
      case 'log': {
        const log = run('pmset -g log 2>/dev/null | tail -30');
        const lines = log.split('\n').filter(Boolean);
        return {
          action: 'log',
          events: lines.slice(-20),
        };
      }
      default:
        return { error: `Unknown action: ${a}` };
    }
  },
};

// ─── Export all pro tools ────────────────────────────────────────────────────

export const macOSProTools: Tool[] = [
  networkDiagnosticsTool,
  systemDiagnosticsTool,
  securityCheckTool,
  powerManagementTool,
];
