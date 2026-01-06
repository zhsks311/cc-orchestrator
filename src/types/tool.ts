/**
 * Tool Use Types
 * Sisyphus 에이전트가 다른 에이전트를 호출하기 위한 Tool Use 타입 정의
 */

/**
 * JSON Schema for tool parameters
 */
export interface JSONSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array';
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  description?: string;
  items?: JSONSchemaProperty;
  enum?: string[];
}

export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
}

/**
 * Tool definition for LLM
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
}

/**
 * Tool call from LLM response
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Tool execution result to send back to LLM
 */
export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

/**
 * Message types for multi-turn tool use conversation
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface Message {
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string; // For tool result messages
}

/**
 * Response from LLM with tool use capability
 */
export interface ToolUseResponse {
  content: string | null;
  toolCalls: ToolCall[] | null;
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter' | 'unknown';
  model: string;
  tokensUsed: {
    input: number;
    output: number;
  };
}

/**
 * Parameters for executeWithTools
 */
export interface ExecuteWithToolsParams {
  systemPrompt: string;
  messages: Message[];
  tools: ToolDefinition[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}
