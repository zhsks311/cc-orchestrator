/**
 * MCP Server - Main server class for CCMO
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { v4 as uuidv4 } from 'uuid';

import { AgentManager } from '../core/agents/AgentManager.js';
import { ContextStore } from '../core/context/ContextStore.js';
import { ToolHandlers } from './handlers/index.js';
import { getToolDefinitions } from './tools/definitions.js';
import { Logger } from '../infrastructure/Logger.js';

export interface MCPServerConfig {
  name?: string;
  version?: string;
}

export class MCPServer {
  private server: Server;
  private agentManager: AgentManager;
  private contextStore: ContextStore;
  private sessionId: string;
  private toolHandlers: ToolHandlers;
  private logger: Logger;

  constructor(config: MCPServerConfig = {}) {
    this.logger = new Logger('MCPServer');
    this.sessionId = uuidv4();

    // Initialize core components
    this.agentManager = new AgentManager();
    this.contextStore = new ContextStore();

    // Initialize tool handlers
    this.toolHandlers = new ToolHandlers({
      agentManager: this.agentManager,
      contextStore: this.contextStore,
      sessionId: this.sessionId,
    });

    // Initialize MCP server
    this.server = new Server(
      {
        name: config.name ?? 'ccmo-mcp-server',
        version: config.version ?? '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logger.debug('ListTools request received');
      return {
        tools: getToolDefinitions(),
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      this.logger.info('CallTool request received', {
        tool: name,
        sessionId: this.sessionId,
      });

      try {
        const result = await this.toolHandlers.handle(name, args);
        return result as CallToolResult;
      } catch (error) {
        this.logger.error('Tool execution error', {
          tool: name,
          error,
        });

        if (error instanceof McpError) {
          throw error;
        }

        throw new McpError(
          ErrorCode.InternalError,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    });
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      this.logger.error('MCP Server error', { error });
    };

    process.on('SIGINT', async () => {
      this.logger.info('Received SIGINT, shutting down...');
      await this.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      this.logger.info('Received SIGTERM, shutting down...');
      await this.shutdown();
      process.exit(0);
    });
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    this.logger.info('CCMO MCP Server started', {
      sessionId: this.sessionId,
      tools: getToolDefinitions().map((t) => t.name),
    });
  }

  async shutdown(): Promise<void> {
    this.logger.info('Shutting down MCP Server...');

    // Cleanup session resources
    await this.agentManager.cleanupSession(this.sessionId);
    await this.contextStore.cleanupSession(this.sessionId);
    this.contextStore.shutdown();

    await this.server.close();
    this.logger.info('MCP Server shutdown complete');
  }

  // Getters for testing
  getSessionId(): string {
    return this.sessionId;
  }

  getAgentManager(): AgentManager {
    return this.agentManager;
  }

  getContextStore(): ContextStore {
    return this.contextStore;
  }
}
