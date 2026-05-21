/**
 * McAgent tool definition.
 *
 * A tool is a function the AI model can invoke.
 * Each tool has a name, description, JSON Schema for parameters,
 * and an async execute function.
 */

/**
 * A tool the agent can use.
 * `parameters` is a JSON Schema object (OpenAI-compatible).
 * `execute` is called when the model requests this tool.
 */
export interface Tool {
  name: string;
  description: string;
  /** JSON Schema for the tool's input parameters. */
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
  /** If true, this tool performs no destructive/write operations. In readonly mode only these tools are available. */
  readonly?: boolean;
}
