/**
 * Shared types for tools: an Anthropic-compatible JSON schema plus a
 * dispatch function that executes the tool.
 */

export interface ToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolFn = (input: any) => Promise<unknown> | unknown;

export interface ToolModule {
  schemas: ToolSchema[];
  dispatch: Record<string, ToolFn>;
}
