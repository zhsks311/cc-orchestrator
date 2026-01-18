# Testing Infrastructure

This directory contains the testing infrastructure for CC Orchestrator.

## Overview

CC Orchestrator uses [Vitest](https://vitest.dev/) for testing. The test infrastructure includes:

- **Unit Tests**: Test individual components in isolation
- **Integration Tests**: Test interaction between components
- **Setup Files**: Global test configuration and guards

## Directory Structure

```
tests/
├── setup/              # Global test setup and utilities
│   ├── api-guard.ts    # Prevents accidental API calls
│   └── cost-tracker.ts # Estimates API costs
├── contracts/          # Provider API contract definitions
│   └── provider-contracts.ts # Zod schemas for OpenAI, Anthropic, Google
├── mocks/              # Contract-validated mock implementations
│   ├── contract-mock-factory.ts # Schema-validated mock factory
│   ├── openai-mock.ts  # OpenAI provider mocks
│   ├── anthropic-mock.ts # Anthropic provider mocks
│   └── google-mock.ts  # Google AI provider mocks
├── utils/              # Test utilities (planned)
└── README.md           # This file
```

## API Cost Guard

### Purpose

The API Cost Guard prevents accidental real API calls during tests, which would:

- Cost money (especially expensive models like GPT-4, Claude Opus)
- Make tests non-deterministic
- Slow down test execution

### How It Works

The guard intercepts all `fetch` calls and blocks production API endpoints:

- `api.openai.com`
- `api.anthropic.com`
- `generativelanguage.googleapis.com`

**In CI:** Throws an error and fails the test
**Locally:** Logs a warning but allows execution

### Usage

The guard is **automatically enabled** for all tests via `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    setupFiles: ['./tests/setup/api-guard.ts'],
    // ...
  },
});
```

No additional setup required in individual test files.

### Example

```typescript
// ❌ This will be blocked
await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  // ...
});
// Error: 🚨 BLOCKED: Real API call detected!

// ✅ This is allowed
const mockProvider = vi.fn().mockResolvedValue({
  content: 'mocked response',
});
```

### Disabling for Specific Tests

If you need to make real API calls in a specific test (e.g., integration tests):

```typescript
import { resetAPIGuard } from '../tests/setup/api-guard.js';

describe('Real API Integration', () => {
  beforeAll(() => {
    resetAPIGuard(); // Temporarily disable guard
  });

  it('should call real API', async () => {
    // Real API call here
  });
});
```

## Cost Tracker

### Purpose

Estimates the cost of API calls to help track testing expenses.

### Usage

```typescript
import { estimateAPICost, CostAccumulator } from '../tests/setup/cost-tracker.js';

// Estimate single call
const cost = estimateAPICost('gpt-4o', 1000, 500);
console.log(`Cost: $${cost}`); // Cost: $0.0075

// Track multiple calls
const accumulator = new CostAccumulator();

accumulator.add({
  provider: 'openai',
  model: 'gpt-4o',
  inputTokens: 1000,
  outputTokens: 500,
  estimatedCost: 0.0075,
});

console.log(accumulator.getReport());
// 📊 API Cost Report
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Total Estimated Cost: $0.0075
// Total API Calls: 1
// ...
```

## Running Tests

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm run test -- tests/setup/api-guard.test.ts

# Run tests with coverage
npm run test -- --coverage
```

## Writing Tests

### Best Practices

1. **Mock External APIs**: Always mock provider APIs in unit tests
2. **Use Type-Safe Mocks**: Leverage TypeScript for mock safety
3. **Test Error Cases**: Don't just test happy paths
4. **Keep Tests Fast**: Unit tests should run in milliseconds
5. **Use Descriptive Names**: Test names should explain what they verify

### Example Test Structure

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MyClass } from './MyClass.js';

describe('MyClass', () => {
  let instance: MyClass;

  beforeEach(() => {
    instance = new MyClass();
  });

  describe('myMethod', () => {
    it('should handle valid input', () => {
      const result = instance.myMethod('valid');
      expect(result).toBe('expected');
    });

    it('should throw on invalid input', () => {
      expect(() => instance.myMethod('invalid')).toThrow();
    });
  });
});
```

## Future Enhancements

Planned testing infrastructure improvements:

- **Contract-Based Provider Mocking**: Schema-validated mocks for APIs
- **Concurrency Testing**: Stress tests for parallel execution
- **Virtual Time Controller**: Deterministic timeout/retry testing
- **MCP Protocol Compliance**: Automated protocol validation
- **Chaos Engineering**: Fault injection for resilience testing

See the [Testing Strategy Document](../docs/TESTING_STRATEGY.md) for details.

## Troubleshooting

### "BLOCKED: Real API call detected"

**Cause**: Test is trying to call a production API
**Solution**: Mock the provider or use `resetAPIGuard()` if intentional

### "Unknown model for cost estimation"

**Cause**: Cost tracker doesn't recognize the model name
**Solution**: Add the model to `TOKEN_COSTS` in `cost-tracker.ts`

### Tests timing out

**Cause**: Asynchronous operations not completing
**Solution**:

- Check for missing `await` keywords
- Increase timeout with `{ timeout: 30000 }` option
- Verify mocks are resolving properly

## Contributing

When adding new tests:

1. Follow existing patterns and conventions
2. Update this README if adding new utilities
3. Ensure all tests pass: `npm run test`
4. Add tests for both success and error cases
5. Keep test files next to the code they test (when possible)

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [MCP Protocol Specification](https://modelcontextprotocol.io/docs)
