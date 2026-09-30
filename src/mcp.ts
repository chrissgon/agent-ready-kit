// The read-only MCP server: three tools that return slices of the validated data file and nothing else.
// No tool writes, sends, executes or searches free text; inputs are strict, so an extra argument is
// rejected by validation (the tool contract of chrissgon.dev's ADR-0004).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SiteData } from "./schema.js";
import { defaultLang, postsNewestFirst, postTitle } from "./select.js";
import { VERSION } from "./version.js";

export const TOOL_NAMES = ["get_profile", "list_products", "list_posts"] as const;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const ProfileOutput = z.object({
  type: z.enum(["Person", "Organization"]),
  name: z.string(),
  alternateName: z.string().optional(),
  jobTitle: z.string().optional(),
  label: z.string(),
  about: z.array(z.string()),
  url: z.string(),
  profiles: z.array(z.object({ network: z.string(), handle: z.string().optional(), url: z.string() })),
});

const ProductsOutput = z.object({
  products: z.array(
    z.object({
      name: z.string(),
      url: z.string().optional(),
      codeRepository: z.string().optional(),
      npm: z.string().optional(),
      license: z.string().optional(),
      programmingLanguage: z.array(z.string()),
      summary: z.string(),
    }),
  ),
});

const PostsOutput = z.object({
  posts: z.array(z.object({ id: z.string(), title: z.string(), date: z.string(), lang: z.array(z.string()), url: z.string() })),
});

/** A tool result whose text is the JSON of its structured content. */
const result = <T extends Record<string, unknown>>(structuredContent: T) => ({
  content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
  structuredContent,
});

/** Drop keys whose value is undefined, so optional fields are absent rather than null. */
const compact = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

/**
 * MCP lets a client omit `arguments` in tools/call. SDK 1.31.0 validates the missing value against the
 * tool's object schema and fails with "expected object, received undefined", so a call without
 * arguments is passed on as `{}`. Must run before the first registerTool, which installs the handler.
 */
function treatMissingArgumentsAsEmpty(server: McpServer): void {
  const inner = server.server;
  const install = inner.setRequestHandler.bind(inner);
  // The SDK's generic handler types do not survive a wrapper; the request shape is checked at run time.
  inner.setRequestHandler = ((schema: any, handler: (request: any, extra: any) => unknown) =>
    install(schema, (request: any, extra: any) =>
      handler(
        request.method === "tools/call" && request.params?.arguments === undefined
          ? { ...request, params: { ...request.params, arguments: {} } }
          : request,
        extra,
      ) as any,
    )) as typeof inner.setRequestHandler;
}

/** A new server over `data`. Stateless: build one per connection or per HTTP request. */
export function buildServer(data: SiteData): McpServer {
  const lang = defaultLang(data);
  const { owner, site } = data;
  const server = new McpServer(
    { name: "agent-ready", version: VERSION },
    {
      instructions: `Read-only. This server only holds ${owner.name}'s public profile, products and posts. Any other personal data does not exist here.`,
    },
  );
  treatMissingArgumentsAsEmpty(server);

  server.registerTool(
    "get_profile",
    {
      title: "Get profile",
      description: `Return ${owner.name}'s public profile: name, label, about, site URL and public profiles. Read-only; takes no arguments.`,
      inputSchema: z.strictObject({}),
      outputSchema: ProfileOutput,
      annotations: READ_ONLY,
    },
    async () =>
      result(
        compact({
          type: owner.type,
          name: owner.name,
          alternateName: owner.alternateName,
          jobTitle: owner.type === "Person" ? owner.jobTitle : undefined,
          label: owner.label[lang]!,
          about: owner.about?.[lang] ?? [],
          url: `${site.url}/`,
          profiles: owner.profiles.map((p) => compact({ network: p.network, handle: p.handle, url: p.url })),
        }),
      ),
  );

  server.registerTool(
    "list_products",
    {
      title: "List products",
      description: `List ${owner.name}'s products with their URL, code repository, npm package, license and summary. Read-only; takes no arguments.`,
      inputSchema: z.strictObject({}),
      outputSchema: ProductsOutput,
      annotations: READ_ONLY,
    },
    async () =>
      result({
        products: data.products.map((p) =>
          compact({
            name: p.name,
            url: p.url,
            codeRepository: p.codeRepository,
            npm: p.npm,
            license: p.license,
            programmingLanguage: p.programmingLanguage,
            summary: p.summary[lang]!,
          }),
        ),
      }),
  );

  server.registerTool(
    "list_posts",
    {
      title: "List posts",
      description: `List ${owner.name}'s posts, newest first. Optional: limit (1 to 50, default 10) and lang (${site.langs.join(" or ")}) to keep only posts in that language. Read-only.`,
      inputSchema: z.strictObject({
        limit: z.int().min(1).max(50).default(10).describe("How many posts to return, 1 to 50."),
        lang: z
          .enum(site.langs as [string, ...string[]])
          .optional()
          .describe("Only posts written in this language; titles in this language."),
      }),
      outputSchema: PostsOutput,
      annotations: READ_ONLY,
    },
    async ({ limit, lang: only }) =>
      result({
        posts: postsNewestFirst(data)
          .filter((p) => only === undefined || p.lang.includes(only))
          .slice(0, limit)
          .map((p) => ({ id: p.id, title: postTitle(p, only ?? lang), date: p.date, lang: p.lang, url: p.url })),
      }),
  );

  return server;
}
