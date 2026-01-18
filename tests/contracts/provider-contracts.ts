/**
 * Provider API Contract Definitions
 *
 * These schemas define the expected structure of requests and responses
 * for each LLM provider. They serve as the source of truth for mocking
 * and help catch API changes early.
 */

import { z } from 'zod';

// ============================================================================
// OpenAI Contracts
// ============================================================================

export const OpenAIMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.union([
    z.string(),
    z.array(z.object({
      type: z.string(),
      text: z.string().optional(),
    })),
  ]),
  name: z.string().optional(),
  tool_calls: z.array(z.object({
    id: z.string(),
    type: z.literal('function'),
    function: z.object({
      name: z.string(),
      arguments: z.string(),
    }),
  })).optional(),
});

export const OpenAIRequestSchema = z.object({
  model: z.string(),
  messages: z.array(OpenAIMessageSchema),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().positive().optional(),
  tools: z.array(z.object({
    type: z.literal('function'),
    function: z.object({
      name: z.string(),
      description: z.string().optional(),
      parameters: z.record(z.any()).optional(),
    }),
  })).optional(),
  stream: z.boolean().optional(),
  top_p: z.number().min(0).max(1).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
});

export const OpenAIResponseSchema = z.object({
  id: z.string(),
  object: z.literal('chat.completion'),
  created: z.number(),
  model: z.string(),
  choices: z.array(z.object({
    index: z.number(),
    message: z.object({
      role: z.literal('assistant'),
      content: z.string().nullable(),
      tool_calls: z.array(z.object({
        id: z.string(),
        type: z.literal('function'),
        function: z.object({
          name: z.string(),
          arguments: z.string(),
        }),
      })).optional(),
    }),
    finish_reason: z.enum(['stop', 'length', 'tool_calls', 'content_filter', 'function_call']),
    logprobs: z.any().nullable().optional(),
  })),
  usage: z.object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    total_tokens: z.number(),
  }),
  system_fingerprint: z.string().optional(),
});

export const OpenAIErrorSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string(),
    param: z.string().nullable().optional(),
    code: z.string().nullable().optional(),
  }),
});

// ============================================================================
// Anthropic Contracts
// ============================================================================

export const AnthropicContentBlockSchema = z.union([
  z.object({
    type: z.literal('text'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('tool_use'),
    id: z.string(),
    name: z.string(),
    input: z.record(z.any()),
  }),
]);

export const AnthropicMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.union([
    z.string(),
    z.array(AnthropicContentBlockSchema),
  ]),
});

export const AnthropicRequestSchema = z.object({
  model: z.string(),
  messages: z.array(AnthropicMessageSchema),
  system: z.string().optional(),
  max_tokens: z.number().positive(),
  temperature: z.number().min(0).max(1).optional(),
  tools: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    input_schema: z.record(z.any()),
  })).optional(),
  stream: z.boolean().optional(),
  top_p: z.number().min(0).max(1).optional(),
  top_k: z.number().positive().optional(),
  metadata: z.object({
    user_id: z.string().optional(),
  }).optional(),
});

export const AnthropicResponseSchema = z.object({
  id: z.string(),
  type: z.literal('message'),
  role: z.literal('assistant'),
  content: z.array(AnthropicContentBlockSchema),
  model: z.string(),
  stop_reason: z.enum(['end_turn', 'max_tokens', 'stop_sequence', 'tool_use']).nullable(),
  stop_sequence: z.string().nullable().optional(),
  usage: z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
  }),
});

export const AnthropicErrorSchema = z.object({
  type: z.literal('error'),
  error: z.object({
    type: z.string(),
    message: z.string(),
  }),
});

// ============================================================================
// Google Generative AI Contracts
// ============================================================================

export const GooglePartSchema = z.object({
  text: z.string().optional(),
  inlineData: z.object({
    mimeType: z.string(),
    data: z.string(),
  }).optional(),
  functionCall: z.object({
    name: z.string(),
    args: z.record(z.any()),
  }).optional(),
  functionResponse: z.object({
    name: z.string(),
    response: z.record(z.any()),
  }).optional(),
});

export const GoogleContentSchema = z.object({
  role: z.enum(['user', 'model']),
  parts: z.array(GooglePartSchema),
});

export const GoogleRequestSchema = z.object({
  contents: z.array(GoogleContentSchema),
  systemInstruction: z.object({
    parts: z.array(GooglePartSchema),
  }).optional(),
  generationConfig: z.object({
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
    topK: z.number().positive().optional(),
    maxOutputTokens: z.number().positive().optional(),
    stopSequences: z.array(z.string()).optional(),
  }).optional(),
  safetySettings: z.array(z.object({
    category: z.string(),
    threshold: z.string(),
  })).optional(),
  tools: z.array(z.object({
    functionDeclarations: z.array(z.object({
      name: z.string(),
      description: z.string(),
      parameters: z.record(z.any()),
    })),
  })).optional(),
});

export const GoogleResponseSchema = z.object({
  candidates: z.array(z.object({
    content: z.object({
      parts: z.array(GooglePartSchema),
      role: z.literal('model'),
    }),
    finishReason: z.enum(['STOP', 'MAX_TOKENS', 'SAFETY', 'RECITATION', 'OTHER', 'FINISH_REASON_UNSPECIFIED']),
    index: z.number().optional(),
    safetyRatings: z.array(z.object({
      category: z.string(),
      probability: z.string(),
    })).optional(),
  })),
  usageMetadata: z.object({
    promptTokenCount: z.number(),
    candidatesTokenCount: z.number(),
    totalTokenCount: z.number(),
  }).optional(),
  promptFeedback: z.object({
    blockReason: z.string().optional(),
    safetyRatings: z.array(z.any()).optional(),
  }).optional(),
});

export const GoogleErrorSchema = z.object({
  error: z.object({
    code: z.number(),
    message: z.string(),
    status: z.string(),
  }),
});

// ============================================================================
// Contract Definitions (for use with Contract Mock Factory)
// ============================================================================

export interface ContractDefinition<TRequest, TResponse, TError = unknown> {
  name: string;
  requestSchema: z.ZodSchema<TRequest>;
  responseSchema: z.ZodSchema<TResponse>;
  errorSchema?: z.ZodSchema<TError>;
}

export const OpenAIContract: ContractDefinition<
  z.infer<typeof OpenAIRequestSchema>,
  z.infer<typeof OpenAIResponseSchema>,
  z.infer<typeof OpenAIErrorSchema>
> = {
  name: 'OpenAI',
  requestSchema: OpenAIRequestSchema,
  responseSchema: OpenAIResponseSchema,
  errorSchema: OpenAIErrorSchema,
};

export const AnthropicContract: ContractDefinition<
  z.infer<typeof AnthropicRequestSchema>,
  z.infer<typeof AnthropicResponseSchema>,
  z.infer<typeof AnthropicErrorSchema>
> = {
  name: 'Anthropic',
  requestSchema: AnthropicRequestSchema,
  responseSchema: AnthropicResponseSchema,
  errorSchema: AnthropicErrorSchema,
};

export const GoogleContract: ContractDefinition<
  z.infer<typeof GoogleRequestSchema>,
  z.infer<typeof GoogleResponseSchema>,
  z.infer<typeof GoogleErrorSchema>
> = {
  name: 'Google',
  requestSchema: GoogleRequestSchema,
  responseSchema: GoogleResponseSchema,
  errorSchema: GoogleErrorSchema,
};

// Type exports for convenience
export type OpenAIRequest = z.infer<typeof OpenAIRequestSchema>;
export type OpenAIResponse = z.infer<typeof OpenAIResponseSchema>;
export type OpenAIError = z.infer<typeof OpenAIErrorSchema>;

export type AnthropicRequest = z.infer<typeof AnthropicRequestSchema>;
export type AnthropicResponse = z.infer<typeof AnthropicResponseSchema>;
export type AnthropicError = z.infer<typeof AnthropicErrorSchema>;

export type GoogleRequest = z.infer<typeof GoogleRequestSchema>;
export type GoogleResponse = z.infer<typeof GoogleResponseSchema>;
export type GoogleError = z.infer<typeof GoogleErrorSchema>;
