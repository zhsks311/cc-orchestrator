/**
 * Anthropic Claude API Provider
 */

import Anthropic from '@anthropic-ai/sdk';
import { ModelResponse } from '../../../types/model.js';
import { ModelAPIError, ConfigurationError } from '../../../types/errors.js';
import {
  ToolDefinition,
  ToolCall,
  ToolUseResponse,
  ExecuteWithToolsParams,
  Message,
} from '../../../types/tool.js';

export interface AnthropicProviderConfig {
  apiKey?: string;
  baseURL?: string;
  timeout?: number;
}

export class AnthropicProvider {
  private client: Anthropic;

  constructor(config: AnthropicProviderConfig = {}) {
    const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new ConfigurationError('ANTHROPIC_API_KEY is required');
    }

    this.client = new Anthropic({
      apiKey,
      baseURL: config.baseURL,
      timeout: config.timeout ?? 60000,
    });
  }

  async execute(params: {
    model: string;
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<ModelResponse> {
    try {
      const response = await this.client.messages.create({
        model: params.model,
        max_tokens: params.maxTokens ?? 4000,
        system: params.systemPrompt,
        messages: [{ role: 'user', content: params.userPrompt }],
      });

      const textContent = response.content.find((block) => block.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new ModelAPIError('Empty response from Anthropic', 'anthropic');
      }

      return {
        content: textContent.text,
        tokensUsed: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
        },
        model: response.model,
        finishReason: response.stop_reason ?? 'unknown',
        metadata: {
          id: response.id,
          type: response.type,
        },
      };
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new ModelAPIError(`Anthropic API error: ${error.message}`, 'anthropic');
      }
      throw error;
    }
  }

  /**
   * Execute with tool use capability
   */
  async executeWithTools(params: ExecuteWithToolsParams): Promise<ToolUseResponse> {
    try {
      const model = params.model ?? 'claude-sonnet-4-20250514';

      // Convert messages to Anthropic format
      const anthropicMessages = this.convertMessages(params.messages);

      // Convert tools to Anthropic format
      const anthropicTools = this.convertTools(params.tools);

      const response = await this.client.messages.create({
        model,
        max_tokens: params.maxTokens ?? 4000,
        system: params.systemPrompt,
        messages: anthropicMessages,
        tools: anthropicTools.length > 0 ? anthropicTools : undefined,
      });

      // Parse response content
      let textContent: string | null = null;
      const toolCalls: ToolCall[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          textContent = block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input as Record<string, unknown>,
          });
        }
      }

      return {
        content: textContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : null,
        finishReason: this.mapStopReason(response.stop_reason),
        model: response.model,
        tokensUsed: {
          input: response.usage.input_tokens,
          output: response.usage.output_tokens,
        },
      };
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new ModelAPIError(`Anthropic API error: ${error.message}`, 'anthropic');
      }
      throw error;
    }
  }

  private convertMessages(messages: Message[]): Anthropic.MessageParam[] {
    const result: Anthropic.MessageParam[] = [];

    for (const msg of messages) {
      if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          const content: Anthropic.ContentBlockParam[] = [];
          if (msg.content) {
            content.push({ type: 'text', text: msg.content });
          }
          for (const tc of msg.toolCalls) {
            content.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.arguments,
            });
          }
          result.push({ role: 'assistant', content });
        } else {
          result.push({ role: 'assistant', content: msg.content });
        }
      } else if (msg.role === 'tool') {
        result.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.toolCallId!,
              content: msg.content,
            },
          ],
        });
      }
    }

    return result;
  }

  private convertTools(tools: ToolDefinition[]): Anthropic.Tool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters as Anthropic.Tool.InputSchema,
    }));
  }

  private mapStopReason(reason: string | null): ToolUseResponse['finishReason'] {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'tool_use':
        return 'tool_calls';
      case 'max_tokens':
        return 'length';
      default:
        return 'unknown';
    }
  }
}
