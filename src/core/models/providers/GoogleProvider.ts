/**
 * Google Gemini API Provider
 */

import {
  GoogleGenerativeAI,
  GenerativeModel,
  Content,
  Part,
  FunctionDeclaration,
  SchemaType,
  Tool as GeminiTool,
} from '@google/generative-ai';
import { ModelResponse } from '../../../types/model.js';
import { ModelAPIError, ConfigurationError } from '../../../types/errors.js';
import {
  ToolDefinition,
  ToolCall,
  ToolUseResponse,
  ExecuteWithToolsParams,
  Message,
} from '../../../types/tool.js';

export interface GoogleProviderConfig {
  apiKey?: string;
}

export class GoogleProvider {
  private genAI: GoogleGenerativeAI;

  constructor(config: GoogleProviderConfig = {}) {
    const apiKey = config.apiKey ?? process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new ConfigurationError('GOOGLE_API_KEY is required');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async execute(params: {
    model: string;
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<ModelResponse> {
    try {
      const generativeModel: GenerativeModel = this.genAI.getGenerativeModel({
        model: params.model,
        systemInstruction: params.systemPrompt,
        generationConfig: {
          temperature: params.temperature ?? 0.7,
          maxOutputTokens: params.maxTokens ?? 4000,
        },
      });

      const result = await generativeModel.generateContent(params.userPrompt);
      const response = result.response;
      const text = response.text();

      if (!text) {
        throw new ModelAPIError('Empty response from Google Gemini', 'google');
      }

      const usageMetadata = response.usageMetadata;

      return {
        content: text,
        tokensUsed: {
          input: usageMetadata?.promptTokenCount ?? 0,
          output: usageMetadata?.candidatesTokenCount ?? 0,
        },
        model: params.model,
        finishReason: response.candidates?.[0]?.finishReason ?? 'unknown',
        metadata: {
          totalTokenCount: usageMetadata?.totalTokenCount,
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new ModelAPIError(
          `Google Gemini API error: ${error.message}`,
          'google'
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
      const modelName = params.model ?? 'gemini-2.5-flash';

      // Convert tools to Gemini format
      const geminiTools = this.convertTools(params.tools);

      const generativeModel: GenerativeModel = this.genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: params.systemPrompt,
        generationConfig: {
          temperature: params.temperature ?? 0.7,
          maxOutputTokens: params.maxTokens ?? 4000,
        },
        tools: geminiTools.length > 0 ? geminiTools : undefined,
      });

      // Convert messages to Gemini format
      const geminiContents = this.convertMessages(params.messages);

      const result = await generativeModel.generateContent({
        contents: geminiContents,
      });

      const response = result.response;
      const candidate = response.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];

      // Parse response parts
      let textContent: string | null = null;
      const toolCalls: ToolCall[] = [];

      for (const part of parts) {
        if ('text' in part && part.text) {
          textContent = part.text;
        } else if ('functionCall' in part && part.functionCall) {
          toolCalls.push({
            id: `gemini-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: part.functionCall.name,
            arguments: (part.functionCall.args ?? {}) as Record<string, unknown>,
          });
        }
      }

      const usageMetadata = response.usageMetadata;

      return {
        content: textContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : null,
        finishReason: this.mapFinishReason(candidate?.finishReason),
        model: modelName,
        tokensUsed: {
          input: usageMetadata?.promptTokenCount ?? 0,
          output: usageMetadata?.candidatesTokenCount ?? 0,
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new ModelAPIError(
          `Google Gemini API error: ${error.message}`,
          'google'
        );
      }
      throw error;
    }
  }

  private convertMessages(messages: Message[]): Content[] {
    const result: Content[] = [];

    for (const msg of messages) {
      if (msg.role === 'user') {
        result.push({
          role: 'user',
          parts: [{ text: msg.content }],
        });
      } else if (msg.role === 'assistant') {
        const parts: Part[] = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.arguments,
              },
            });
          }
        }
        result.push({ role: 'model', parts });
      } else if (msg.role === 'tool') {
        // Gemini expects function responses in a specific format
        result.push({
          role: 'function',
          parts: [
            {
              functionResponse: {
                name: msg.toolCallId ?? 'unknown',
                response: { result: msg.content },
              },
            },
          ],
        });
      }
    }

    return result;
  }

  private convertTools(tools: ToolDefinition[]): GeminiTool[] {
    if (tools.length === 0) return [];

    const functionDeclarations: FunctionDeclaration[] = tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: this.convertParameters(tool.parameters),
    }));

    return [{ functionDeclarations }];
  }

  private convertParameters(params: ToolDefinition['parameters']): FunctionDeclaration['parameters'] {
    return {
      type: SchemaType.OBJECT,
      properties: this.convertProperties(params.properties ?? {}),
      required: params.required ?? [],
    };
  }

  private convertProperties(
    props: Record<string, unknown>
  ): Record<string, { type: SchemaType; description?: string; enum?: string[] }> {
    const result: Record<string, { type: SchemaType; description?: string; enum?: string[] }> = {};
    for (const [key, value] of Object.entries(props)) {
      const prop = value as { type: string; description?: string; enum?: string[] };
      result[key] = {
        type: this.mapType(prop.type),
        description: prop.description,
        enum: prop.enum,
      };
    }
    return result;
  }

  private mapType(type: string): SchemaType {
    switch (type) {
      case 'string':
        return SchemaType.STRING;
      case 'number':
        return SchemaType.NUMBER;
      case 'boolean':
        return SchemaType.BOOLEAN;
      case 'array':
        return SchemaType.ARRAY;
      case 'object':
        return SchemaType.OBJECT;
      default:
        return SchemaType.STRING;
    }
  }

  private mapFinishReason(
    reason: string | undefined
  ): ToolUseResponse['finishReason'] {
    switch (reason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
        return 'content_filter';
      case 'RECITATION':
        return 'content_filter';
      default:
        // Gemini returns undefined for function calls
        return 'unknown';
    }
  }
}
