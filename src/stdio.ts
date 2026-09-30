// The MCP server over stdio, for local clients that start it as a command.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildServer } from "./mcp.js";
import type { SiteData } from "./schema.js";

/** Serve the read-only MCP server over `data` on stdin and stdout. Nothing else may write to stdout. */
export async function serveStdio(data: SiteData): Promise<McpServer> {
  const server = buildServer(data);
  await server.connect(new StdioServerTransport());
  return server;
}
