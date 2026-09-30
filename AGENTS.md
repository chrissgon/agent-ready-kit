# agent-ready-kit

A TypeScript package and CLI (`agent-ready`) that turns one JSON data file into `llms.txt`, schema.org JSON-LD and a read-only MCP server (stdio and a Web `Request` handler). Extracted from the architecture of chrissgon.dev, where one data module feeds every agent-facing output so they never diverge.

## Architecture

- `src/schema.ts` is the contract: a strict zod schema for the data file. Every output reads validated data only.
- `src/load.ts` reads and validates a file; errors are `data: <field path>: <message>`, one per line.
- Generators: `src/llms.ts` (llms.txt, https://llmstxt.org/), `src/jsonld.ts` (schema.org `@graph`).
- MCP: `src/mcp.ts` (`buildServer`, three read-only tools), `src/handler.ts` (stateless Streamable HTTP, POST only), `src/stdio.ts`.
- `src/cli.ts`: `build`, `check`, `mcp`. Data on stdout, diagnostics on stderr; exit 0 ok, 1 invalid data, 2 wrong usage.
- Entry points (`package.json` `exports`): `.` (`src/index.ts`), `./data` (`src/data.ts`), `./llms`, `./jsonld`, `./mcp` (`src/server.ts`). `./data`, `./llms` and `./jsonld` must not load the MCP SDK (a test follows their imports).

## Commands

| Task | Command |
|------|---------|
| Install | `npm ci` |
| Type-check | `npm run typecheck` |
| Test | `npm test` |
| Build | `npm run build` (writes `dist/`) |
| Packed tarball smoke test | `npm run test:pack` (needs the registry; runs in CI and before a release) |
| Inspect the MCP server | `npx -y @modelcontextprotocol/inspector@2.8.0 --cli node dist/cli.js mcp --data fixtures/person.json -- --method tools/list` (the server command goes before `--`, the Inspector options after) |

## Conventions

- TypeScript strict, ES modules, relative imports end in `.js`.
- Dependencies are pinned to exact versions (a test enforces it).
- Fixtures hold fake example data on reserved example domains only. Never put a real person's private data in a fixture, a test or the README.
- The kit never publishes `worksFor`, `address`, `homeLocation`, `birthDate` or `email`: the schema rejects them and the JSON-LD generator refuses them.
- MCP tools only read the data file: no writes, no outgoing requests, no free-text search.
- Code, comments and documents are in English. Commits follow Conventional Commits and are signed.

## Working rules

- Public repository `chrissgon/agent-ready-kit`. `main` is protected: every change goes through a branch and a pull request, merged by squash only when the required checks `secrets` and `build` are green, with signed commits. No force push, no rule changes, no bypass.
- Publishing happens only in `.github/workflows/publish.yml` (npm trusted publishing, provenance, no token), started by a `v<version>` tag that the owner pushes after approving the exact payload (package name, version, `npm pack --dry-run` list, tarball integrity). An agent never runs `npm publish`, never pushes a tag and never creates a GitHub release.
- Enable the pre-commit hook once per clone: `git config core.hooksPath .githooks`. It runs the secret scan, types, tests and the build, the same checks as CI. Never skip it.
- Credentials never enter the repository; `.env` and `.env.*` are git-ignored. Report vulnerabilities as described in `SECURITY.md`.
