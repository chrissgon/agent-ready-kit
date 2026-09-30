// A Web Request handler for the MCP server, for any runtime with the Fetch API (Netlify Functions v2,
// Deno, Bun, Cloudflare Workers, Node 18+). Stateless Streamable HTTP, as proven in the chrissgon.dev
// spike: a new server and transport per request, no session id, JSON responses instead of SSE, so a
// buffered serverless response is enough; anything but POST gets 405.
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildServer } from "./mcp.js";
import type { SiteData } from "./schema.js";

export type McpHandler = (request: Request) => Promise<Response>;

function jsonRpcError(status: number, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** A handler that serves the read-only MCP server over `data`. */
export function createMcpHandler(data: SiteData): McpHandler {
  return async (request) => {
    // Stateless: no server-initiated SSE stream (GET) and no session to end (DELETE).
    if (request.method !== "POST") {
      return jsonRpcError(405, "Method not allowed. This stateless MCP endpoint accepts POST only.", { allow: "POST" });
    }
    const server = buildServer(data);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    try {
      await server.connect(transport);
      return await transport.handleRequest(request);
    } catch (err) {
      console.error("agent-ready: mcp handler error", err);
      return jsonRpcError(500, "Internal server error");
    } finally {
      // With JSON responses the body is complete before handleRequest resolves, so closing here is safe.
      await transport.close();
      await server.close();
    }
  };
}
