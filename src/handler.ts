// A Web Request handler for the MCP server, for any runtime with the Fetch API (Netlify Functions v2,
// Deno, Bun, Cloudflare Workers, Node 22+). Stateless Streamable HTTP, as proven in the chrissgon.dev
// spike: a new server and transport per request, no session id, JSON responses instead of SSE, so a
// buffered serverless response is enough; anything but POST gets 405, a body over the limit gets 413,
// and every response says it must not be cached.
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildServer, type McpServerOptions } from "./mcp.js";
import type { SiteData } from "./schema.js";

export type McpHandler = (request: Request) => Promise<Response>;

/** Default largest request body, in bytes. A JSON-RPC call to these tools is a few hundred bytes. */
export const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

export interface McpHandlerOptions extends McpServerOptions {
  /** Largest request body accepted, in bytes; a larger one gets 413 before it is parsed. Default 64 KiB. */
  maxBodyBytes?: number;
}

/** Set on every response: tool answers are per request, and the body is JSON, never sniffed as anything else. */
const NO_STORE = { "cache-control": "no-store", "x-content-type-options": "nosniff" } as const;

function jsonRpcError(status: number, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }), {
    status,
    headers: { "content-type": "application/json", ...NO_STORE, ...headers },
  });
}

/** A handler that serves the read-only MCP server over `data`. */
export function createMcpHandler(data: SiteData, options: McpHandlerOptions = {}): McpHandler {
  const { maxBodyBytes = DEFAULT_MAX_BODY_BYTES, ...serverOptions } = options;
  const tooLarge = () => jsonRpcError(413, `Request body too large (limit ${maxBodyBytes} bytes).`);

  return async (request) => {
    // Stateless: no server-initiated SSE stream (GET) and no session to end (DELETE).
    if (request.method !== "POST") {
      return jsonRpcError(405, "Method not allowed. This stateless MCP endpoint accepts POST only.", { allow: "POST" });
    }
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > maxBodyBytes) return tooLarge();
    // The declared length can be missing or wrong, so the body that was read is measured too.
    const body = await request.arrayBuffer();
    if (body.byteLength > maxBodyBytes) return tooLarge();

    const server = buildServer(data, serverOptions);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    try {
      await server.connect(transport);
      const response = await transport.handleRequest(new Request(request.url, { method: "POST", headers: request.headers, body }));
      for (const [key, value] of Object.entries(NO_STORE)) response.headers.set(key, value);
      return response;
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
