/**
 * Shared battery output parser for macOS pmset and system_profiler.
 *
 * Both batteryTool (tools-extended) and powerManagementTool (tools-pro)
 * parse the same macOS commands. This shared parser eliminates the
 * duplication.
 */

export interface BatteryInfo {
  percentage: number | null;
  status: 'unknown' | 'charging' | 'discharging' | 'fully charged';
  cycleCount: number | null;
  health: string | null;
  maxCapacityPercent: number | null;
  temperature: string | null;
}

/**
 * Parse battery status from pmset -g batt output.
 */
export function parseBatteryStatus(battOutput: string): BatteryInfo['status'] {
  if (/charged/i.test(battOutput)) return 'fully charged';
  if (/charging/i.test(battOutput)) return 'charging';
  if (/discharging/i.test(battOutput)) return 'discharging';
  return 'unknown';
}

/**
 * Parse battery percentage from pmset output ("NN%" pattern).
 */
export function parseBatteryPercentage(battOutput: string): number | null {
  const match = battOutput.match(/(\d+)%/);
  return match ? Number(match[1]) : null;
}

/**
 * Parse detailed battery info from system_profiler SPPowerDataType output.
 */
export function parseBatteryDetails(powerData: string): {
  cycleCount: number | null;
  health: string | null;
  maxCapacityPercent: number | null;
  temperature: string | null;
} {
  const cycleMatch = powerData.match(/Cycle Count:\s*(\d+)/);
  const healthMatch = powerData.match(/Condition:\s*(\w+)/);
  const capacityMatch = powerData.match(/Maximum Capacity:\s*(\d+)%/);
  const tempMatch = powerData.match(/Temperature.*?:\s*(\d+)/);

  return {
    cycleCount: cycleMatch ? Number(cycleMatch[1]) : null,
    health: healthMatch ? healthMatch[1] : null,
    maxCapacityPercent: capacityMatch ? Number(capacityMatch[1]) : null,
    temperature: tempMatch ? `${tempMatch[1]}°C` : null,
  };
}

/**
 * Full battery parse: combines pmset and system_profiler into a single BatteryInfo.
 */
export function parseBatteryOutput(battOutput: string, powerData: string): BatteryInfo {
  return {
    percentage: parseBatteryPercentage(battOutput),
    status: parseBatteryStatus(battOutput),
    ...parseBatteryDetails(powerData),
  };
}
