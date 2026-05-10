
/**
 * MCP Server Standalone Entry Point
 */

import { MCPServer } from './api/mcp-server.js';

const server = new MCPServer();
server.start().catch(console.error);
