# agent-ready

Make a small site readable by AI agents from one JSON data file. `agent-ready` validates the file against a strict schema and turns it into:

- **`llms.txt`**, one per site language, in the format of [llmstxt.org](https://llmstxt.org/): an H1 with the name, a blockquote summary, detail paragraphs, then H2 sections of `[name](url): notes` links.
- **schema.org JSON-LD**: one `@graph` with the owner (`Person` or `Organization`) and one `SoftwareSourceCode` per product.
- **A read-only MCP server** with three tools, `get_profile`, `list_products` and `list_posts`, served over stdio or from any runtime that speaks Web `Request`/`Response` (Netlify Functions v2, Deno, Bun, Cloudflare Workers, Node).

All three read the same validated object, so a name or a URL can never differ between them (a test checks it). The design comes from the personal site chrissgon.dev, where one data module feeds the pages, `llms.txt`, the JSON-LD and the MCP endpoint.

Status: 0.1.0, local. Not published on npm yet; build it from a clone (below).

## Quick start (from a clone)

Requires Node.js 22 or later.

```sh
npm ci
npm run build
node dist/cli.js check --data fixtures/person.json
node dist/cli.js build --data fixtures/person.json --out out
```

`check` prints `ok: fixtures/person.json: Person "Sam Example", 2 products, 3 posts, languages en, pt`. `build` prints the files it wrote: `out/llms.txt`, `out/pt/llms.txt` and `out/jsonld.json`. Once the package is published, `npx @chrissgon/agent-ready <command>` replaces `node dist/cli.js <command>`.

## The data file

One JSON file with four keys. Every object is strict: a field the schema does not declare fails validation. This is `fixtures/person.json` (fake example data), shortened:

```json
{
  "site": { "url": "https://sam.example.com", "langs": ["en", "pt"], "mcp": "https://sam.example.com/api/mcp" },
  "owner": {
    "type": "Person",
    "name": "Sam Example",
    "alternateName": "samexample",
    "jobTitle": "Software Engineer",
    "label": { "en": "Software engineer · Small open-source tools for the web", "pt": "Engenheiro de software · ..." },
    "about": { "en": ["Sam builds small, well-tested tools for the web ..."], "pt": ["Sam cria ferramentas ..."] },
    "profiles": [{ "network": "Code", "handle": "samexample", "url": "https://git.example.org/samexample" }]
  },
  "products": [
    {
      "name": "Tidy Tables",
      "url": "https://tidytables.example.com",
      "codeRepository": "https://git.example.org/samexample/tidy-tables",
      "npm": "@samexample/tidy-tables",
      "license": "MIT",
      "programmingLanguage": ["CSS", "TypeScript"],
      "summary": { "en": "Accessible data tables in one small stylesheet.", "pt": "Tabelas de dados ..." }
    }
  ],
  "posts": [
    {
      "id": "tables-for-everyone",
      "title": { "en": "Tables for everyone", "pt": "Tabelas para todos" },
      "date": "2026-08-14",
      "lang": ["en", "pt"],
      "url": "https://blog.example.com/tables-for-everyone"
    }
  ]
}
```

| Field | Rule |
|-------|------|
| `site.url` | https origin; a trailing slash is removed |
| `site.langs` | language codes (`en`, `pt-BR`), at least one, no repeats; the first is the default |
| `site.mcp` | optional https URL of your MCP endpoint, listed in `llms.txt` under "For agents" |
| `owner.type` | `Person` or `Organization`; `jobTitle` is allowed on a `Person` only |
| `owner.name`, `owner.alternateName` | the name, and an optional handle |
| `owner.label` | one line per site language: the `llms.txt` summary and the JSON-LD `description` |
| `owner.about` | optional paragraphs per site language |
| `owner.profiles` | `network`, optional `handle`, https `url`; become `sameAs` in the JSON-LD |
| `products[]` | `name`, `url` and/or `codeRepository` (at least one), optional `npm` and `license` (SPDX id), `programmingLanguage`, `summary` per site language |
| `posts[]` | unique slug `id`, `title` for each language of the post, `date` as YYYY-MM-DD, `lang` (site languages), https `url`; order does not matter, outputs list newest first |

Every error names the field, one per line, and `check` exits with 1:

```text
$ node dist/cli.js check --data fixtures/forbidden-email.json
data: owner.email: forbidden field "email", the kit never publishes it
```

Other examples: `data: owner.nickname: unknown field`, `data: posts.1.id: duplicate id "same-id" (first at posts.0)`, `data: owner.label.pt: missing text for site language "pt"`.

`fixtures/org.json` is a one-language `Organization` example.

## What the kit never publishes

`worksFor`, `address`, `homeLocation`, `birthDate` and `email` are rejected anywhere in the data file, and `generateJsonLd` refuses them again if code adds them to the data at run time. The MCP tools return slices of the validated file and nothing else: no tool writes, sends, executes or searches free text, and an argument the tool does not declare is rejected.

## Commands

```text
agent-ready build --data <file> --out <dir>   llms.txt per language (the first at <dir>/llms.txt, the others at
                                              <dir>/<lang>/llms.txt) and <dir>/jsonld.json; prints the paths
agent-ready check --data <file>               validate; prints a one-line summary
agent-ready mcp --data <file>                 serve the read-only MCP server on stdin/stdout
agent-ready --help
```

Data goes to stdout and diagnostics to stderr. Exit codes: 0 ok, 1 invalid data, 2 wrong usage or unreadable file.

## The MCP server

| Tool | Input | Output (`structuredContent`) |
|------|-------|------------------------------|
| `get_profile` | none | `type`, `name`, `alternateName`, `jobTitle`, `label`, `about`, `url`, `profiles`, in the default language |
| `list_products` | none | `products[]`: `name`, `url`, `codeRepository`, `npm`, `license`, `programmingLanguage`, `summary` |
| `list_posts` | `limit` 1 to 50 (default 10), optional `lang` (a site language) | `posts[]`: `id`, `title`, `date`, `lang`, `url`, newest first |

Every tool carries `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false` and an output schema. The server's instructions say: "Read-only. This server only holds <name>'s public profile, products and posts. Any other personal data does not exist here."

Check it with the MCP Inspector (the server command goes before `--`, the Inspector options after it):

```sh
npx -y @modelcontextprotocol/inspector@2.8.0 --cli node dist/cli.js mcp --data fixtures/person.json -- --method tools/list
npx -y @modelcontextprotocol/inspector@2.8.0 --cli node dist/cli.js mcp --data fixtures/person.json -- --method tools/call --tool-name list_posts --tool-arg limit=2
```

A local MCP client starts it as a command: `node /path/to/agent-ready-kit/dist/cli.js mcp --data /path/to/site.json`.

## Use it from code

```ts
import { createMcpHandler, generateJsonLd, generateLlms, loadData, serializeJsonLd } from "@chrissgon/agent-ready";

const data = await loadData("site.json"); // throws DataError with one line per problem
const llms = generateLlms(data); // default language; generateLlms(data, { lang: "pt" }) for another
const jsonld = serializeJsonLd(generateJsonLd(data)); // safe inside <script type="application/ld+json">
const handler = createMcpHandler(data); // (request: Request) => Promise<Response>
```

`validate(value)` and `parseData(jsonText)` validate data you already hold; `buildServer(data)` returns the `McpServer` for a transport of your own.

### In a Netlify Function (v2)

The handler is stateless: each POST gets a new server and transport, responses are JSON (no SSE stream), and any method other than POST gets 405 with `Allow: POST`. That is the pattern proven in the chrissgon.dev spike on Netlify Functions v2.

```ts
// netlify/functions/mcp.mts
import type { Config } from "@netlify/functions";
import { createMcpHandler, validate } from "@chrissgon/agent-ready";
import site from "../../site.json" with { type: "json" };

export default createMcpHandler(validate(site));

export const config: Config = { path: "/api/mcp" };
```

A public endpoint costs something on every call; Netlify can rate-limit a function from its `config` (`rateLimit: { windowLimit, windowSize, aggregateBy: ["ip", "domain"] }`, see https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/).

### In a static site

Run `build` before the site generator and publish its output at the site root, so `llms.txt` is served at `/llms.txt` and each other language at `/<lang>/llms.txt`:

```sh
node dist/cli.js build --data site.json --out public
```

Put the JSON-LD in the page head, from `public/jsonld.json` or from code with `serializeJsonLd(generateJsonLd(data))`:

```html
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[ ... ]}</script>
```

## Development

| Task | Command |
|------|---------|
| Install | `npm ci` |
| Type-check | `npm run typecheck` |
| Test | `npm test` (vitest; includes the MCP Inspector CLI over stdio) |
| Build | `npm run build` (writes `dist/`) |

## License

MIT, see [LICENSE](LICENSE).
