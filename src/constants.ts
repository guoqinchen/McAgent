/**
 * Shared timeout constants for shell commands and API calls.
 *
 * Centralized here so timeout values can be audited and tuned in one place
 * rather than scattered as magic numbers across tool implementations.
 */

/** Default timeout for general shell commands. */
export const DEFAULT_CMD_TIMEOUT_MS = 30_000;

/** Timeout for network diagnostic commands (ping, DNS, port check). */
export const NETWORK_CMD_TIMEOUT_MS = 10_000;

/** Timeout for system diagnostic commands (sysctl, memory_pressure, disk I/O). */
export const DIAGNOSTIC_CMD_TIMEOUT_MS = 15_000;

/** Timeout for long-running operations (traceroute, sysdiagnose). */
export const LONG_CMD_TIMEOUT_MS = 60_000;

/** Timeout for quick operations (process sampling, log streaming). */
export const SHORT_CMD_TIMEOUT_MS = 5_000;

/** Timeout for external API calls (OpenAI/DeepSeek HTTP requests). */
export const API_TIMEOUT_MS = 60_000;
