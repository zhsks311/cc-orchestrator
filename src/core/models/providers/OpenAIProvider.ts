/**
 * OpenAI API Provider
 */

import OpenAI from 'openai';
import { ModelResponse } from '../../../types/model.js';
import { ModelAPIError, ConfigurationError } from '../../../types/errors.js';
import {
  ToolDefinition,
  ToolCall,
  ToolUseResponse,
  ExecuteWithToolsParams,
  Message,
} from '../../../types/tool.js';

export interface OpenAIProviderConfig {
  apiKey?: string;
  baseURL?: string;
  timeout?: number;
}

export class OpenAIProvider {
  private client: OpenAI;

  constructor(config: OpenAIProviderConfig = {}) {
    const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ConfigurationError('OPENAI_API_KEY is required');
    }

    this.client = new OpenAI({
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
      // GPT-5+ 시리즈는 max_completion_tokens 사용
      const isGpt5Series = params.model.startsWith('gpt-5');
      const tokenParam = isGpt5Series
        ? { max_completion_tokens: params.maxTokens ?? 4000 }
        : { max_tokens: params.maxTokens ?? 4000 };

      const response = await this.client.chat.completions.create({
        model: params.model,
        messages: [
          { role: 'system', content: params.systemPrompt },
          { role: 'user', content: params.userPrompt },
        ],
        temperature: params.temperature ?? 0.7,
        ...tokenParam,
      });

      const message = response.choices[0]?.message;
      if (!message?.content) {
        throw new ModelAPIError('Empty response from OpenAI', 'openai');
      }

      return {
        content: message.content,
        tokensUsed: {
          input: response.usage?.prompt_tokens ?? 0,
          output: response.usage?.completion_tokens ?? 0,
        },
        model: response.model,
        finishReason: response.choices[0]?.finish_reason ?? 'unknown',
        metadata: {
          id: response.id,
          created: response.created,
        },
      };
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw new ModelAPIError(
          `OpenAI API error: ${error.message}`,
          'openai'
        );
      }
      throw error;
    }
  }

  /**
   * Execute with tool use capability
   */
  async executeWithTools(params: ExecuteWithToolsParams): Promise<ToolUseResponse> {
    try {
      const model = params.model ?? 'gpt-4o';
      const isGpt5Series = model.startsWith('gpt-5');
      const tokenParam = isGpt5Series
        ? { max_completion_tokens: params.maxTokens ?? 4000 }
        : { max_tokens: params.maxTokens ?? 4000 };

      // Convert messages to OpenAI format
      const openaiMessages = this.convertMessages(params.systemPrompt, params.messages);

      // Convert tools to OpenAI format
      const openaiTools = this.convertTools(params.tools);

      const response = await this.client.chat.completions.create({
        model,
        messages: openaiMessages,
        tools: openaiTools.length > 0 ? openaiTools : undefined,
        temperature: params.temperature ?? 0.7,
        ...tokenParam,
      });

      const choice = response.choices[0];
      const message = choice?.message;

      // Parse tool calls if present
      const toolCalls = message?.tool_calls
        ? message.tool_calls.map((tc): ToolCall => ({
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments || '{}'),
          }))
        : null;

      return {
        content: message?.content ?? null,
        toolCalls,
        finishReason: this.mapFinishReason(choice?.finish_reason),
        model: response.model,
        tokensUsed: {
          input: response.usage?.prompt_tokens ?? 0,
          output: response.usage?.completion_tokens ?? 0,
        },
      };
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw new ModelAPIError(
          `OpenAI API error: ${error.message}`,
          'openai'
        );
      }
      throw error;
    }
  }

  private convertMessages(
    systemPrompt: string,
    messages: Message[]
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const result: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];

    for (const msg of messages) {
      if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          result.push({
            role: 'assistant',
            content: msg.content || null,
            tool_calls: msg.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments),
              },
            })),
          });
        } else {
          result.push({ role: 'assistant', content: msg.content });
        }
      } else if (msg.role === 'tool') {
        result.push({
          role: 'tool',
          tool_call_id: msg.toolCallId!,
          content: msg.content,
        });
      }
    }

    return result;
  }

  private convertTools(tools: ToolDefinition[]): OpenAI.Chat.ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as unknown as Record<string, unknown>,
      },
    }));
  }

  private mapFinishReason(
    reason: string | undefined
  ): ToolUseResponse['finishReason'] {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'tool_calls':
        return 'tool_calls';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'unknown';
    }
  }
}
