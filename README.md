# agent-ready-kit

Make a small site readable by AI agents from one JSON data file. `agent-ready` validates the file against a strict schema and turns it into:

- **`llms.txt`**, one per site language, in the format of [llmstxt.org](https://llmstxt.org/): an H1 with the name, a blockquote summary, the public profiles and detail paragraphs, then H2 sections of `[name](url): notes` links.
- **schema.org JSON-LD**: one `@graph` with the owner (`Person` or `Organization`) and one `SoftwareSourceCode` per product.
- **A read-only MCP server** with three tools, `get_profile`, `list_products` and `list_posts`, served over stdio or from any runtime that speaks Web `Request`/`Response` (Netlify Functions v2, Deno, Bun, Cloudflare Workers, Node).

All three read the same validated object, so a name or a URL can never differ between them (a test checks it). The design comes from the personal site chrissgon.dev, where one data module feeds the pages, `llms.txt`, the JSON-LD and the MCP endpoint.

## Install

Requires Node.js 22 or later. The package is an ES module with TypeScript types. The package is `@chrissgon/agent-ready-kit`; its command is `agent-ready`.

```sh
npm install @chrissgon/agent-ready-kit
```

Or run the CLI without installing it (the package has one command, so `npx` runs `agent-ready`):

```sh
npx @chrissgon/agent-ready-kit check --data site.json
npx @chrissgon/agent-ready-kit build --data site.json --out public
```

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
      "id": "tidy-tables",
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
| `products[]` | optional slug `id` (unique), `name`, `url` and/or `codeRepository` (at least one), optional `npm` and `license` (SPDX id), `programmingLanguage`, `summary` per site language |
| `posts[]` | unique slug `id`, `title` for each language of the post, `date` as YYYY-MM-DD, `lang` (site languages), https `url`; order does not matter, outputs list newest first |

Every error names the field, one per line, and `check` exits with 1:

```text
$ npx @chrissgon/agent-ready-kit check --data fixtures/forbidden-email.json
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

`check` on `fixtures/person.json` prints `ok: fixtures/person.json: Person "Sam Example", 2 products, 3 posts, languages en, pt`; `build` prints the files it wrote: `out/llms.txt`, `out/pt/llms.txt` and `out/jsonld.json`.

A local MCP client starts the server as a command:

```json
{ "command": "npx", "args": ["-y", "@chrissgon/agent-ready-kit", "mcp", "--data", "/path/to/site.json"] }
```

## Use it from code

```ts
import { createMcpHandler, generateJsonLd, generateLlms, loadData, serializeJsonLd } from "@chrissgon/agent-ready-kit";

const data = await loadData("site.json"); // throws DataError with one line per problem
const llms = generateLlms(data); // default language; generateLlms(data, { lang: "pt" }) for another
const jsonld = serializeJsonLd(generateJsonLd(data)); // safe inside <script type="application/ld+json">
const handler = createMcpHandler(data); // (request: Request) => Promise<Response>
```

### Exports

| Import from | Exports | Loads the MCP SDK |
|-------------|---------|-------------------|
| `@chrissgon/agent-ready-kit` | everything below, plus `serveStdio` and `VERSION` | yes |
| `@chrissgon/agent-ready-kit/data` | `validate(value)`, `parseData(jsonText)`, `loadData(file)`, `DataError` (its `issues` holds one line per problem), `SiteDataSchema` (zod), `FORBIDDEN_FIELDS`; types `SiteData`, `Owner`, `Product`, `Post` | no |
| `@chrissgon/agent-ready-kit/llms` | `generateLlms(data, { lang, labels })`, `generateLlmsParts(data, { lang, labels })`, `LLMS_PARTS`, `DEFAULT_LLMS_LABELS`, `llmsPath(data, lang)`; types `LlmsOptions`, `LlmsLabels`, `LlmsPart` | no |
| `@chrissgon/agent-ready-kit/jsonld` | `generateJsonLd(data, { lang, licenseUrl })`, `serializeJsonLd(doc)`, `ownerIdOf(data)`, `spdxLicenseUrl(id)`; types `JsonLdDocument`, `JsonLdNode`, `JsonLdOptions` | no |
| `@chrissgon/agent-ready-kit/mcp` | `createMcpHandler(data, options)`, `buildServer(data, { name, version })`, `TOOL_NAMES`, `instructionsFor(name)`, `DEFAULT_MAX_BODY_BYTES`; types `McpHandler`, `McpHandlerOptions`, `McpServerOptions` | yes |

Pages that only need `llms.txt` or the JSON-LD import from `/data`, `/llms` and `/jsonld`, so they never load the MCP SDK.

### llms.txt in parts, and in your language

`generateLlmsParts` returns the parts of `llms.txt` in order (`head`, `about`, `products`, `writing`, `agents`), each ending in one newline, or `""` when the data has nothing for it. Joined with a blank line they are `generateLlms`; a site can put its own sections between them.

`labels` sets the headings and the fixed words inside the lines for a language; a missing label keeps its English default (`DEFAULT_LLMS_LABELS`). `about` has no default: set it to put the about paragraphs under their own H2.

```ts
import { generateLlms } from "@chrissgon/agent-ready-kit/llms";

generateLlms(data, {
  lang: "pt",
  labels: { about: "Sobre", products: "Produtos", writing: "Escrita", forAgents: "Para agentes", code: "Código", license: "Licença", languages: "idiomas" },
});
```

### JSON-LD

The owner's `@id` is `<site.url>/#person` (or `#organization`); every product's `author` points to it. A product's `license` becomes `https://spdx.org/licenses/<id>.html`; pass `licenseUrl: (id) => ...` for another page. `lang` picks the language of the descriptions.

## The MCP server

| Tool | Input | Output (`structuredContent`) |
|------|-------|------------------------------|
| `get_profile` | optional `lang` | `lang`, `type`, `name`, `alternateName`, `jobTitle`, `label`, `about`, `url`, `profiles` |
| `list_products` | optional `lang` | `lang`, `products[]`: `id`, `name`, `url`, `codeRepository`, `npm`, `license`, `programmingLanguage`, `summary` |
| `list_posts` | `limit` 1 to 50 (default 10), optional `lang` | `lang`, `total`, `posts[]`: `id`, `title`, `date`, `languages`, `url`, newest first |

`lang` is one of the site's languages (default: the first) and picks the language of the texts; a post with no title in that language keeps its own. Optional fields are absent when the data has no value. Every tool carries `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: false` and an output schema. The server's instructions say: "Read-only. This server only holds <name>'s public profile, products and posts; any other personal data does not exist here."

Check it with the MCP Inspector (the server command goes before `--`, the Inspector options after it):

```sh
npx -y @modelcontextprotocol/inspector@2.8.0 --cli npx -y @chrissgon/agent-ready-kit mcp --data site.json -- --method tools/list
npx -y @modelcontextprotocol/inspector@2.8.0 --cli npx -y @chrissgon/agent-ready-kit mcp --data site.json -- --method tools/call --tool-name list_posts --tool-arg limit=2
```

### In a Netlify Function (v2)

The handler is stateless: each POST gets a new server and transport, responses are JSON (no SSE stream), any method other than POST gets 405 with `Allow: POST`, a body over `maxBodyBytes` (default 64 KiB) gets 413 before it is parsed, and every response carries `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. That is the pattern proven in the chrissgon.dev spike on Netlify Functions v2.

```ts
// netlify/functions/mcp.mts
import type { Config } from "@netlify/functions";
import { validate } from "@chrissgon/agent-ready-kit/data";
import { createMcpHandler } from "@chrissgon/agent-ready-kit/mcp";
import site from "../../site.json" with { type: "json" };

export default createMcpHandler(validate(site), { name: "example.com", version: "1.0.0" });

export const config: Config = { path: "/api/mcp" };
```

`name` and `version` are what the server reports to clients (default `agent-ready` and this package's version). A public endpoint costs something on every call; Netlify can rate-limit a function from its `config` (`rateLimit: { windowLimit, windowSize, aggregateBy: ["ip", "domain"] }`, see https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/).

### In a static site

Run `build` before the site generator and publish its output at the site root, so `llms.txt` is served at `/llms.txt` and each other language at `/<lang>/llms.txt`:

```sh
npx @chrissgon/agent-ready-kit build --data site.json --out public
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
| Packed tarball smoke test | `npm run test:pack` (packs, runs the CLI with `npx`, installs the tarball in a scratch project, imports every entry point and type-checks against the shipped types; needs the registry) |

From a clone, `node dist/cli.js <command>` runs the CLI after `npm run build`.

## Releasing

Releases are published by `.github/workflows/publish.yml` with npm trusted publishing (no token) and provenance. The owner bumps `version` in `package.json` and `src/version.ts` through a pull request, then pushes the tag `v<version>` on the merged commit. The workflow checks that the tag matches `package.json` and is on `main`, runs the secret scan, types, tests, build and the packed-tarball smoke test, and publishes with `--access public`; a prerelease version (`0.2.0-beta.1`) goes to the `next` dist-tag.

## License

MIT, see [LICENSE](LICENSE).
