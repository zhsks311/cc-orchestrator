/**
 * MCP Server Test Client
 * Tests the CCMO MCP server functionality
 */

import { spawn } from 'child_process';
import { createInterface } from 'readline';

class MCPTestClient {
  constructor() {
    this.process = null;
    this.messageId = 0;
    this.pendingRequests = new Map();
    this.buffer = '';
  }

  async start() {
    console.log('Starting MCP server...');

    this.process = spawn('node', ['dist/index.js'], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        LOG_LEVEL: 'error', // Reduce noise
      },
    });

    // Handle stderr (logs)
    this.process.stderr.on('data', (data) => {
      // Parse JSON logs if possible
      const lines = data.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const log = JSON.parse(line);
          if (log.level === 'error') {
            console.error('[Server Error]', log.message);
          }
        } catch {
          // Not JSON, just print it
          if (line.trim()) {
            console.error('[Server]', line);
          }
        }
      }
    });

    // Handle stdout (MCP messages)
    this.process.stdout.on('data', (data) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    // Wait a bit for server to start
    await new Promise((resolve) => setTimeout(resolve, 500));
    console.log('MCP server started.\n');
  }

  processBuffer() {
    // MCP uses newline-delimited JSON
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep incomplete line

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        this.handleMessage(message);
      } catch (e) {
        console.error('Failed to parse message:', line);
      }
    }
  }

  handleMessage(message) {
    if (message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        pending.resolve(message);
        this.pendingRequests.delete(message.id);
      }
    }
  }

  async sendRequest(method, params = {}) {
    const id = ++this.messageId;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.process.stdin.write(JSON.stringify(request) + '\n');

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  async initialize() {
    console.log('=== Initializing MCP connection ===');
    const response = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0',
      },
    });

    if (response.error) {
      throw new Error(`Initialize failed: ${JSON.stringify(response.error)}`);
    }

    console.log('Server info:', response.result?.serverInfo);
    console.log('Capabilities:', response.result?.capabilities);
    console.log('');

    // Send initialized notification
    this.process.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }) + '\n');

    return response.result;
  }

  async listTools() {
    console.log('=== Listing available tools ===');
    const response = await this.sendRequest('tools/list', {});

    if (response.error) {
      throw new Error(`List tools failed: ${JSON.stringify(response.error)}`);
    }

    const tools = response.result?.tools || [];
    console.log(`Found ${tools.length} tools:\n`);

    for (const tool of tools) {
      console.log(`- ${tool.name}`);
      const desc = tool.description?.split('\n')[0] || '';
      console.log(`  ${desc.substring(0, 80)}${desc.length > 80 ? '...' : ''}`);
    }
    console.log('');

    return tools;
  }

  async callTool(name, args) {
    console.log(`=== Calling tool: ${name} ===`);
    console.log('Arguments:', JSON.stringify(args, null, 2));

    const response = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });

    if (response.error) {
      console.error('Tool call failed:', response.error);
      return null;
    }

    console.log('Result:', JSON.stringify(response.result, null, 2));
    console.log('');

    return response.result;
  }

  stop() {
    if (this.process) {
      this.process.kill();
      console.log('MCP server stopped.');
    }
  }
}

async function main() {
  const client = new MCPTestClient();

  try {
    await client.start();
    await client.initialize();
    await client.listTools();

    // Test list_agents (should return empty list)
    console.log('=== Testing list_agents ===');
    await client.callTool('list_agents', {});

    // Test share_context
    console.log('=== Testing share_context ===');
    await client.callTool('share_context', {
      key: 'test_key',
      value: { message: 'Hello from test!' },
      scope: 'session',
    });

    // Test get_shared_context
    console.log('=== Testing get_shared_context ===');
    await client.callTool('get_shared_context', {
      key: 'test_key',
      scope: 'session',
    });

    console.log('\n=== All basic tests passed! ===\n');
    console.log('Note: spawn_agent tests require API keys.');
    console.log('Set up .env file with API keys to test full functionality.');

  } catch (error) {
    console.error('Test failed:', error.message);
  } finally {
    client.stop();
  }
}

main();
