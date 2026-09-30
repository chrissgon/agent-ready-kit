// Entry point `@chrissgon/agent-ready/mcp`: the read-only MCP server and its Web Request handler.
export { buildServer, instructionsFor, TOOL_NAMES, type McpServerOptions } from "./mcp.js";
export { createMcpHandler, DEFAULT_MAX_BODY_BYTES, type McpHandler, type McpHandlerOptions } from "./handler.js";
