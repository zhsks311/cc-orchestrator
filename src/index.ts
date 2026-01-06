#!/usr/bin/env node
/**
 * CC Orchestrator MCP Server - Entry Point
 * Claude Code Multi-Model Orchestrator
 */

import 'dotenv/config';
import { MCPServer } from './server/MCPServer.js';
import { Logger } from './infrastructure/Logger.js';

const logger = new Logger('Main');

async function main(): Promise<void> {
  // Validate required environment variables
  const requiredEnvVars = ['OPENAI_API_KEY', 'GOOGLE_API_KEY', 'ANTHROPIC_API_KEY'];
  const missingEnvVars = requiredEnvVars.filter((v) => !process.env[v]);

  if (missingEnvVars.length > 0) {
    logger.warn('Missing API keys (some agents may not work)', {
      missing: missingEnvVars,
    });
  }

  // Create and start server
  const server = new MCPServer({
    name: 'cc-orchestrator-mcp-server',
    version: '1.0.0',
  });

  try {
    await server.start();
  } catch (error) {
    logger.error('Failed to start MCP Server', { error });
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', {
    reason,
    promise: String(promise),
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error });
  process.exit(1);
});

// Start the server
main().catch((error) => {
  logger.error('Fatal error', { error });
  process.exit(1);
});
