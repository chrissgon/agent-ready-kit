# agent-ready-kit

A TypeScript package and CLI (`agent-ready`) that turns one JSON data file into `llms.txt`, schema.org JSON-LD and a read-only MCP server (stdio and a Web `Request` handler). Extracted from the architecture of chrissgon.dev, where one data module feeds every agent-facing output so they never diverge.

## Architecture

- `src/schema.ts` is the contract: a strict zod schema for the data file. Every output reads validated data only.
- `src/load.ts` reads and validates a file; errors are `data: <field path>: <message>`, one per line.
- Generators: `src/llms.ts` (llms.txt, https://llmstxt.org/), `src/jsonld.ts` (schema.org `@graph`).
- MCP: `src/mcp.ts` (`buildServer`, three read-only tools), `src/handler.ts` (stateless Streamable HTTP, POST only), `src/stdio.ts`.
- `src/cli.ts`: `build`, `check`, `mcp`. Data on stdout, diagnostics on stderr; exit 0 ok, 1 invalid data, 2 wrong usage.

## Commands

| Task | Command |
|------|---------|
| Install | `npm ci` |
| Type-check | `npm run typecheck` |
| Test | `npm test` |
| Build | `npm run build` (writes `dist/`) |
| Inspect the MCP server | `npx -y @modelcontextprotocol/inspector@2.8.0 --cli node dist/cli.js mcp --data fixtures/person.json -- --method tools/list` (the server command goes before `--`, the Inspector options after) |

## Conventions

- TypeScript strict, ES modules, relative imports end in `.js`.
- Dependencies are pinned to exact versions (a test enforces it).
- Fixtures hold fake example data on reserved example domains only. Never put a real person's private data in a fixture, a test or the README.
- The kit never publishes `worksFor`, `address`, `homeLocation`, `birthDate` or `email`: the schema rejects them and the JSON-LD generator refuses them.
- MCP tools only read the data file: no writes, no outgoing requests, no free-text search.
- Code, comments and documents are in English. Commits follow Conventional Commits and are signed.

## Working rules

- Local repository: no remote, no push, no `npm publish` without the owner's recorded approval. `"private": true` stays in `package.json` until then.
