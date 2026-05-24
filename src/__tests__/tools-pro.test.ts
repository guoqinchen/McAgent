import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock executor directly — all tools use defaultExecutor.run()
vi.mock('../shell/executor.js', () => ({
  defaultExecutor: {
    run: vi.fn(),
  },
}));

// ─── networkDiagnosticsTool ─────────────────────────────────────────────────

describe('networkDiagnosticsTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ping action executes the correct command', async () => {
    const { defaultExecutor } = await import('../shell/executor.js');
    const runMock = vi.mocked(defaultExecutor.run);
    runMock.mockResolvedValue(
      'PING google.com (142.250.80.46): 56 data bytes\n' +
      '64 bytes from 142.250.80.46: icmp_seq=0 ttl=118 time=14.2ms\n' +
      '--- google.com ping statistics ---\n' +
      '1 packets transmitted, 1 packets received, 0.0% packet loss\n' +
      'round-trip min/avg/max/stddev = 14.2/14.2/14.2/0.0 ms'
    );

    const { networkDiagnosticsTool } = await import('../tools-pro.js');
    const result = await networkDiagnosticsTool.execute({ action: 'ping' }) as { action: string; latency: string };

    expect(result.action).toBe('ping');
    expect(result.latency).toContain('round-trip');
  });

  it('dns action executes dig command', async () => {
    const { defaultExecutor } = await import('../shell/executor.js');
    const runMock = vi.mocked(defaultExecutor.run);
    runMock
      .mockResolvedValueOnce('142.250.80.46')
      .mockResolvedValueOnce('resolver #1\n  nameserver[0] : 8.8.8.8\n');

    const { networkDiagnosticsTool } = await import('../tools-pro.js');
    const result = await networkDiagnosticsTool.execute({ action: 'dns', target: 'google.com' }) as { action: string; addresses: string[] };

    expect(result.action).toBe('dns');
    expect(result.addresses).toContain('142.250.80.46');
  });

  it('port action checks TCP connectivity', async () => {
    const { defaultExecutor } = await import('../shell/executor.js');
    const runMock = vi.mocked(defaultExecutor.run);
    runMock.mockResolvedValue('Connection to 8.8.8.8 port 443 [tcp/https] succeeded!');

    const { networkDiagnosticsTool } = await import('../tools-pro.js');
    const result = await networkDiagnosticsTool.execute({ action: 'port', target: '8.8.8.8', port: 443 }) as { action: string; open: boolean };

    expect(result.action).toBe('port');
    expect(result.open).toBe(true);
  });
});

// ─── systemDiagnosticsTool ──────────────────────────────────────────────────

describe('systemDiagnosticsTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('memory_pressure action returns vm stats', async () => {
    const { defaultExecutor } = await import('../shell/executor.js');
    const runMock = vi.mocked(defaultExecutor.run);
    runMock
      .mockResolvedValueOnce('Memory pressure: Normal\nPages free: 50000\n')
      .mockResolvedValueOnce('Pages free: 50000\nPages active: 100000\n');

    const { systemDiagnosticsTool } = await import('../tools-pro.js');
    const result = await systemDiagnosticsTool.execute({ action: 'memory_pressure' }) as { action: string; pressure: string[] };

    expect(result.action).toBe('memory_pressure');
    expect(result.pressure.length).toBeGreaterThan(0);
  });

  it('disk_io action returns iostat output', async () => {
    const { defaultExecutor } = await import('../shell/executor.js');
    const runMock = vi.mocked(defaultExecutor.run);
    runMock.mockResolvedValue('disk0 10.5 20.3 30.1\ndisk1 1.2 3.4 5.6\n');

    const { systemDiagnosticsTool } = await import('../tools-pro.js');
    const result = await systemDiagnosticsTool.execute({ action: 'disk_io' }) as { action: string; stats: string[] };

    expect(result.action).toBe('disk_io');
    expect(result.stats.length).toBeGreaterThan(0);
  });
});

// ─── securityCheckTool ──────────────────────────────────────────────────────

describe('securityCheckTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sip check returns SIP status', async () => {
    const { defaultExecutor } = await import('../shell/executor.js');
    const runMock = vi.mocked(defaultExecutor.run);
    runMock.mockResolvedValue('System Integrity Protection status: enabled.\n');

    const { securityCheckTool } = await import('../tools-pro.js');
    const result = await securityCheckTool.execute({ check: 'sip' }) as Record<string, unknown>;

    expect(result.sip).toContain('enabled');
  });

  it('gatekeeper check returns assessment status', async () => {
    const { defaultExecutor } = await import('../shell/executor.js');
    const runMock = vi.mocked(defaultExecutor.run);
    runMock
      .mockResolvedValueOnce('assessments enabled')
      .mockResolvedValueOnce('Global state: enabled');

    const { securityCheckTool } = await import('../tools-pro.js');
    const result = await securityCheckTool.execute({ check: 'gatekeeper' }) as Record<string, unknown>;

    expect(result.gatekeeper).toContain('enabled');
  });
});

// ─── powerManagementTool ────────────────────────────────────────────────────

describe('powerManagementTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('settings action returns pmset config', async () => {
    const { defaultExecutor } = await import('../shell/executor.js');
    const runMock = vi.mocked(defaultExecutor.run);
    runMock
      .mockResolvedValueOnce('Sleep: 30\nPower: 10\n')
      .mockResolvedValueOnce('');

    const { powerManagementTool } = await import('../tools-pro.js');
    const result = await powerManagementTool.execute({ action: 'settings' }) as { action: string; current: string[] };

    expect(result.action).toBe('settings');
    expect(result.current.length).toBeGreaterThan(0);
  });

  it('assertions action returns sleep preventers', async () => {
    const { defaultExecutor } = await import('../shell/executor.js');
    const runMock = vi.mocked(defaultExecutor.run);
    runMock.mockResolvedValue(
      '2025-07-17 10:00:00 +0800 ApplePushServiceTask\n' +
      '  PreventUserIdleSystemSleep: "com.apple.apsd"\n' +
      '2025-07-17 10:00:00 +0800 SomeApp\n' +
      '  PreventUserIdleDisplaySleep: "com.some.app"'
    );

    const { powerManagementTool } = await import('../tools-pro.js');
    const result = await powerManagementTool.execute({ action: 'assertions' }) as { action: string; preventSleep: string[] };

    expect(result.action).toBe('assertions');
    expect(result.preventSleep.length).toBeGreaterThan(0);
  });
});
