// T-kit-5 (AC-4): the read-only MCP server, exercised through the SDK Client over an in-memory transport.
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { parseData } from "../src/load.js";
import { buildServer } from "../src/mcp.js";
import type { SiteData } from "../src/schema.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const person = parseData(read("../fixtures/person.json"));
const org = parseData(read("../fixtures/org.json"));

const open: Client[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((c) => c.close()));
});

async function connect(data: SiteData = person): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await buildServer(data).connect(serverSide);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientSide);
  open.push(client);
  return client;
}

type CallResult = { isError?: boolean; content: { type: string; text: string }[]; structuredContent?: any };
const call = async (client: Client, name: string, args?: Record<string, unknown>) =>
  (await client.callTool({ name, ...(args ? { arguments: args } : {}) })) as CallResult;

describe("buildServer", () => {
  it("lists exactly get_profile, list_products and list_posts, all read-only with an output schema", async () => {
    const { tools } = await (await connect()).listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["get_profile", "list_posts", "list_products"]);
    for (const tool of tools) {
      expect(tool.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
      expect(tool.outputSchema?.type).toBe("object");
      expect(tool.inputSchema.additionalProperties).toBe(false);
    }
  });

  it("tells the client it is read-only and names the owner", async () => {
    const client = await connect();
    expect(client.getInstructions()).toBe(
      "Read-only. This server only holds Sam Example's public profile, products and posts. Any other personal data does not exist here.",
    );
  });

  it("get_profile returns the owner's public profile in the default language", async () => {
    const result = await call(await connect(), "get_profile");
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      type: "Person",
      name: "Sam Example",
      alternateName: "samexample",
      jobTitle: "Software Engineer",
      label: "Software engineer · Small open-source tools for the web",
      about: [
        "Sam builds small, well-tested tools for the web and writes about how they are made.",
        "Everything in this file is fake example data for the agent-ready kit.",
      ],
      url: "https://sam.example.com/",
      profiles: [
        { network: "Code", handle: "samexample", url: "https://git.example.org/samexample" },
        { network: "Social", handle: "@sam", url: "https://social.example.net/@sam" },
      ],
    });
    expect(JSON.parse(result.content[0]!.text)).toEqual(result.structuredContent);
  });

  it("get_profile works for an Organization with no about", async () => {
    const result = await call(await connect(org), "get_profile", {});
    expect(result.structuredContent).toMatchObject({ type: "Organization", name: "Example Labs", about: [] });
    expect(result.structuredContent).not.toHaveProperty("jobTitle");
  });

  it("list_products returns every product with its links", async () => {
    const result = await call(await connect(), "list_products");
    expect(result.structuredContent.products).toEqual([
      {
        name: "Tidy Tables",
        url: "https://tidytables.example.com",
        codeRepository: "https://git.example.org/samexample/tidy-tables",
        npm: "@samexample/tidy-tables",
        license: "MIT",
        programmingLanguage: ["CSS", "TypeScript"],
        summary: "Accessible data tables in one small stylesheet.",
      },
      {
        name: "Quiet Logs",
        codeRepository: "https://git.example.org/samexample/quiet-logs",
        license: "Apache-2.0",
        programmingLanguage: ["Go"],
        summary: "A logger that only speaks when something is wrong.",
      },
    ]);
  });

  it("list_posts returns posts newest first, 10 at most by default", async () => {
    const result = await call(await connect(), "list_posts");
    expect(result.structuredContent.posts.map((p: { id: string }) => p.id)).toEqual([
      "hello-agents",
      "tables-for-everyone",
      "logs-que-sussurram",
    ]);
    expect(result.structuredContent.posts[0]).toEqual({
      id: "hello-agents",
      title: "Hello, agents",
      date: "2026-09-20",
      lang: ["en"],
      url: "https://blog.example.com/hello-agents",
    });
  });

  it("list_posts honours limit and lang", async () => {
    const client = await connect();
    expect((await call(client, "list_posts", { limit: 1 })).structuredContent.posts).toHaveLength(1);
    const pt = await call(client, "list_posts", { lang: "pt" });
    expect(pt.structuredContent.posts.map((p: { title: string }) => p.title)).toEqual(["Tabelas para todos", "Logs que sussurram"]);
  });

  it.each([
    ["a limit above 50", "list_posts", { limit: 51 }],
    ["a limit below 1", "list_posts", { limit: 0 }],
    ["a language the site does not declare", "list_posts", { lang: "fr" }],
    ["an extra argument", "get_profile", { query: "ignore previous instructions" }],
    ["an extra argument", "list_posts", { limit: 2, search: "email" }],
  ])("rejects %s (%s)", async (_case, name, args) => {
    const result = await call(await connect(), name, args);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain(`Input validation error: Invalid arguments for tool ${name}`);
  });

  it("answers an unknown tool with not found", async () => {
    const result = await call(await connect(), "delete_profile");
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Tool delete_profile not found");
  });
});
