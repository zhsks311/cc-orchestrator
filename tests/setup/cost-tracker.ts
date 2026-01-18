/**
 * API Cost Tracker - Estimates costs for API calls in tests
 *
 * Helps track and report estimated costs if real API calls were made.
 */

export interface APICostEstimate {
  provider: 'openai' | 'anthropic' | 'google';
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

// Cost per 1M tokens (update these periodically)
// Prices as of January 2025
const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'o1': { input: 15, output: 60 },
  'o1-mini': { input: 3, output: 12 },

  // Anthropic
  'claude-opus-4': { input: 15, output: 75 },
  'claude-sonnet-4': { input: 3, output: 15 },
  'claude-haiku-4': { input: 0.8, output: 4 },
  'claude-sonnet-3.5': { input: 3, output: 15 },

  // Google
  'gemini-3-pro': { input: 1.25, output: 5 },
  'gemini-2.5-pro': { input: 1.25, output: 5 },
  'gemini-2.5-flash': { input: 0.075, output: 0.3 },

  // Legacy/Custom models (from your ROLE_MODEL_MAPPING)
  'gpt-5.2': { input: 10, output: 30 }, // Estimated
};

/**
 * Estimate the cost of an API call
 */
export function estimateAPICost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = TOKEN_COSTS[model];
  if (!costs) {
    console.warn(`Unknown model for cost estimation: ${model}`);
    return 0;
  }

  return (
    (inputTokens / 1_000_000) * costs.input +
    (outputTokens / 1_000_000) * costs.output
  );
}

/**
 * Get a detailed cost breakdown
 */
export function getCostBreakdown(
  model: string,
  inputTokens: number,
  outputTokens: number
): {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
} {
  const costs = TOKEN_COSTS[model];
  if (!costs) {
    return {
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      model,
      inputTokens,
      outputTokens,
    };
  }

  const inputCost = (inputTokens / 1_000_000) * costs.input;
  const outputCost = (outputTokens / 1_000_000) * costs.output;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    model,
    inputTokens,
    outputTokens,
  };
}

/**
 * Format cost as currency string
 */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

/**
 * Track and accumulate costs across multiple calls
 */
export class CostAccumulator {
  private calls: APICostEstimate[] = [];

  add(estimate: APICostEstimate): void {
    this.calls.push(estimate);
  }

  getTotalCost(): number {
    return this.calls.reduce((sum, call) => sum + call.estimatedCost, 0);
  }

  getCostByProvider(): Record<string, number> {
    const byProvider: Record<string, number> = {};

    for (const call of this.calls) {
      if (!byProvider[call.provider]) {
        byProvider[call.provider] = 0;
      }
      byProvider[call.provider] += call.estimatedCost;
    }

    return byProvider;
  }

  getCostByModel(): Record<string, number> {
    const byModel: Record<string, number> = {};

    for (const call of this.calls) {
      if (!byModel[call.model]) {
        byModel[call.model] = 0;
      }
      byModel[call.model] += call.estimatedCost;
    }

    return byModel;
  }

  getReport(): string {
    const total = this.getTotalCost();
    const byProvider = this.getCostByProvider();
    const byModel = this.getCostByModel();

    let report = `\n📊 API Cost Report\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `Total Estimated Cost: ${formatCost(total)}\n`;
    report += `Total API Calls: ${this.calls.length}\n\n`;

    report += `By Provider:\n`;
    for (const [provider, cost] of Object.entries(byProvider)) {
      report += `  ${provider}: ${formatCost(cost)}\n`;
    }

    report += `\nBy Model:\n`;
    for (const [model, cost] of Object.entries(byModel)) {
      report += `  ${model}: ${formatCost(cost)}\n`;
    }

    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    return report;
  }

  reset(): void {
    this.calls = [];
  }
}
