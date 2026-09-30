// T-kit-8 (AC-4, AC-5): llms.txt, the JSON-LD and the MCP answers (over stdio, through the real CLI, and
// through the Web Request handler) carry the same names and URLs for the same data file. Also runs the
// MCP Inspector CLI (the pinned devDependency) against the stdio server.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";
import { createMcpHandler } from "../src/handler.js";
import { generateJsonLd } from "../src/jsonld.js";
import { generateLlms } from "../src/llms.js";
import { parseData } from "../src/load.js";
import type { SiteData } from "../src/schema.js";

const root = new URL("..", import.meta.url).pathname;
const FIXTURES = ["person.json", "org.json"];

interface Facts {
  owner: string;
  site?: string;
  profiles: string[];
  products: { name: string; link: string }[];
  posts: { title: string; url: string }[];
}

/** Markdown links `[text](url)` of the list items in one H2 section of llms.txt ("" = before the first H2). */
function links(llms: string, section: string): { text: string; url: string }[] {
  const parts = llms.split(/^## /m);
  const body = section === "" ? parts[0]! : (parts.find((p) => p.startsWith(`${section}\n`)) ?? "");
  return [...body.matchAll(/^- \[([^\]]+)\]\((https:[^)]+)\)/gm)].map((m) => ({ text: m[1]!, url: m[2]! }));
}

function fromLlms(llms: string): Facts {
  return {
    owner: /^# (.+)$/m.exec(llms)![1]!,
    profiles: links(llms, "").map((l) => l.url),
    products: links(llms, "Products").map((l) => ({ name: l.text, link: l.url })),
    posts: links(llms, "Writing").map((l) => ({ title: l.text, url: l.url })),
  };
}

function fromJsonLd(data: SiteData): Omit<Facts, "posts"> {
  const [owner, ...products] = generateJsonLd(data)["@graph"];
  return {
    owner: owner!.name as string,
    site: owner!.url as string,
    profiles: (owner!.sameAs as string[] | undefined) ?? [],
    products: products.map((p) => ({ name: p.name as string, link: (p.url ?? p.codeRepository) as string })),
  };
}

type Call = (name: string, args?: Record<string, unknown>) => Promise<any>;

async function fromMcp(call: Call): Promise<Facts> {
  const profile = await call("get_profile");
  const { products } = await call("list_products");
  const { posts } = await call("list_posts", { limit: 50 });
  return {
    owner: profile.name,
    site: profile.url,
    profiles: profile.profiles.map((p: { url: string }) => p.url),
    products: products.map((p: { name: string; url?: string; codeRepository: string }) => ({ name: p.name, link: p.url ?? p.codeRepository })),
    posts: posts.map((p: { title: string; url: string }) => ({ title: p.title, url: p.url })),
  };
}

/** Call tools on the real CLI (`agent-ready mcp`) over stdio. */
async function withStdio<T>(file: string, use: (call: Call) => Promise<T>): Promise<T> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "src/cli.ts", "mcp", "--data", file],
    cwd: root,
    stderr: "pipe",
  });
  const client = new Client({ name: "consistency", version: "0.0.0" });
  await client.connect(transport);
  try {
    return await use(async (name, args) => {
      const result = (await client.callTool({ name, arguments: args ?? {} })) as { structuredContent?: unknown; isError?: boolean };
      expect(result.isError).toBeFalsy();
      return result.structuredContent;
    });
  } finally {
    await client.close();
  }
}

/** Call tools through the Web Request handler, one stateless POST per call. */
function handlerCall(data: SiteData): Call {
  const handler = createMcpHandler(data);
  let id = 0;
  return async (name, args) => {
    const res = await handler(
      new Request("https://example.com/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args ?? {} } }),
      }),
    );
    return (await res.json()).result.structuredContent;
  };
}

describe.each(FIXTURES)("%s", (name) => {
  const file = join("fixtures", name);
  const data = parseData(readFileSync(join(root, file), "utf8"));
  const llms = fromLlms(generateLlms(data));
  const jsonld = fromJsonLd(data);

  it("llms.txt and the JSON-LD name the same owner, profiles and products", () => {
    // The llms.txt reader found every item, so the comparisons below are not between empty lists.
    expect([llms.profiles.length, llms.products.length, llms.posts.length]).toEqual([
      data.owner.profiles.length,
      data.products.length,
      data.posts.length,
    ]);
    expect(jsonld.owner).toBe(llms.owner);
    expect(jsonld.profiles).toEqual(llms.profiles);
    expect(jsonld.products).toEqual(llms.products);
  });

  it("the MCP server over stdio answers the same names and URLs", { timeout: 30_000 }, async () => {
    const mcp = await withStdio(file, fromMcp);
    expect(mcp).toEqual({ ...llms, site: jsonld.site });
  });

  it("the Web Request handler answers the same names and URLs", async () => {
    const mcp = await fromMcp(handlerCall(data));
    expect(mcp).toEqual({ ...llms, site: jsonld.site });
  });
});

describe("MCP Inspector CLI over stdio", () => {
  it("lists exactly the three tools, all with readOnlyHint: true", { timeout: 60_000 }, async () => {
    const { stdout } = await promisify(execFile)(
      join(root, "node_modules/.bin/mcp-inspector"),
      ["--cli", process.execPath, "--import", "tsx", "src/cli.ts", "mcp", "--data", "fixtures/person.json", "--", "--method", "tools/list"],
      { cwd: root },
    );
    const { tools } = JSON.parse(stdout) as { tools: { name: string; annotations: { readOnlyHint: boolean } }[] };
    expect(tools.map((t) => t.name).sort()).toEqual(["get_profile", "list_posts", "list_products"]);
    expect(tools.every((t) => t.annotations.readOnlyHint === true)).toBe(true);
  });
});
