// T-kit-6 (AC-4): the Web Request handler answers JSON-RPC over stateless Streamable HTTP, POST only.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createMcpHandler } from "../src/handler.js";
import { parseData } from "../src/load.js";

const data = parseData(readFileSync(new URL("../fixtures/person.json", import.meta.url), "utf8"));
const handler = createMcpHandler(data);
const URL_ = "https://sam.example.com/api/mcp";

const post = (body: unknown) =>
  handler(
    new Request(URL_, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const rpc = (id: number, method: string, params: Record<string, unknown> = {}) => ({ jsonrpc: "2.0", id, method, params });

describe("createMcpHandler", () => {
  it("answers initialize with JSON, the server info and the instructions", async () => {
    const res = await post(
      rpc(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0.0.0" } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body.id).toBe(1);
    expect(body.result.serverInfo.name).toBe("agent-ready");
    expect(body.result.capabilities.tools).toBeDefined();
    expect(body.result.instructions).toContain("Read-only. This server only holds Sam Example's public profile");
  });

  it("answers tools/list in its own request, without a session", async () => {
    const res = await post(rpc(2, "tools/list"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.tools.map((t: { name: string }) => t.name).sort()).toEqual(["get_profile", "list_posts", "list_products"]);
    expect(body.result.tools.every((t: { annotations: { readOnlyHint: boolean } }) => t.annotations.readOnlyHint)).toBe(true);
  });

  it("answers tools/call with the tool's structured content", async () => {
    const res = await post(rpc(3, "tools/call", { name: "list_posts", arguments: { limit: 1 } }));
    const body = await res.json();
    expect(body.result.structuredContent).toEqual({
      posts: [{ id: "hello-agents", title: "Hello, agents", date: "2026-09-20", lang: ["en"], url: "https://blog.example.com/hello-agents" }],
    });
  });

  it("answers an unknown tool with not found", async () => {
    const body = await (await post(rpc(4, "tools/call", { name: "send_email", arguments: {} }))).json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("Tool send_email not found");
  });

  it.each(["GET", "DELETE", "PUT"])("refuses %s with 405 and Allow: POST", async (method) => {
    const res = await handler(new Request(URL_, { method }));
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    expect((await res.json()).error.message).toBe("Method not allowed. This stateless MCP endpoint accepts POST only.");
  });

  it("rejects a body that is not JSON with a JSON-RPC parse error", async () => {
    const res = await post("{ not json");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(-32700);
  });
});
