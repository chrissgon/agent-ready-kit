#!/usr/bin/env bash
# Pack the package and use the tarball the way a consumer does, outside this repository:
#   1. `npm pack` (prepack builds dist/) and check the tarball holds only dist/, README.md, LICENSE, package.json.
#   2. `npx --yes ./<tgz>` runs the CLI: --help, check and build on fixtures/person.json.
#   3. A scratch ES module project installs the tarball, imports every entry point at run time, and
#      type-checks a TypeScript file against the shipped types with moduleResolution nodenext and bundler.
# Needs the registry to install the package's dependencies, so it runs in CI and before a release, not in
# the pre-commit hook. Prints npm's JSON summary of the tarball (name, size, shasum, integrity, files) on
# stdout; everything else goes to stderr.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bash scripts/pack-smoke.sh [--keep]

Pack @chrissgon/agent-ready and exercise the tarball from a scratch project.

Options:
  --keep      Keep the scratch folder and print its path (default: removed on exit).
  -h, --help  Show this help.

Exit codes: 0 every check passed, 1 a check failed, 2 wrong usage.
EOF
}

keep=0
for arg in "$@"; do
  case "$arg" in
    --keep) keep=1 ;;
    -h | --help) usage; exit 0 ;;
    *) echo "pack-smoke: unknown argument \"$arg\"" >&2; usage >&2; exit 2 ;;
  esac
done

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tsc="$root/node_modules/.bin/tsc"
[ -x "$tsc" ] || { echo "pack-smoke: $tsc not found; run npm ci first" >&2; exit 1; }
work="$(mktemp -d "${TMPDIR:-/tmp}/agent-ready-smoke.XXXXXX")"
if [ "$keep" = 1 ]; then echo "pack-smoke: scratch folder $work" >&2; else trap 'rm -rf "$work"' EXIT; fi
fail() { echo "pack-smoke: FAIL: $*" >&2; exit 1; }
step() { echo "pack-smoke: $*" >&2; }

step "packing"
summary="$(cd "$root" && npm pack --json --pack-destination "$work")"
tgz="$(ls "$work"/*.tgz)"

step "checking the tarball's files"
unexpected="$(tar -tzf "$tgz" | grep -Ev '^package/(dist/[A-Za-z0-9_.-]+\.(js|d\.ts)|README\.md|LICENSE|package\.json)$' || true)"
[ -z "$unexpected" ] || fail "unexpected files in the tarball:
$unexpected"
tar -xzOf "$tgz" package/dist/cli.js | head -1 | grep -qx '#!/usr/bin/env node' || fail "dist/cli.js does not start with #!/usr/bin/env node"

cp "$root/fixtures/person.json" "$work/site.json"
cp "$root/fixtures/forbidden-email.json" "$work/bad.json"
cd "$work"
tgz_rel="./$(basename "$tgz")"

step "npx --yes $tgz_rel: --help, check, build"
npx --yes "$tgz_rel" --help | grep -q '^Usage: agent-ready' || fail "--help"
npx --yes "$tgz_rel" check --data site.json | grep -qx 'ok: site.json: Person "Sam Example", 2 products, 3 posts, languages en, pt' || fail "check"
set +e
npx --yes "$tgz_rel" check --data bad.json 2>/dev/null
code=$?
set -e
[ "$code" = 1 ] || fail "check on invalid data exited $code, expected 1"
npx --yes "$tgz_rel" build --data site.json --out out >/dev/null
for f in out/llms.txt out/pt/llms.txt out/jsonld.json; do [ -s "$f" ] || fail "build did not write $f"; done
head -1 out/llms.txt | grep -qx '# Sam Example' || fail "out/llms.txt has no H1"

step "installing the tarball in a scratch ES module project"
mkdir app
cd app
printf '{ "name": "smoke", "private": true, "type": "module" }\n' >package.json
npm install --silent --no-audit --no-fund "../$(basename "$tgz")"
[ -x node_modules/.bin/agent-ready ] || fail "the agent-ready bin was not installed"
node_modules/.bin/agent-ready check --data ../site.json >/dev/null || fail "installed bin check"

cat >run.mjs <<'EOF'
import { readFileSync } from "node:fs";
import * as all from "@chrissgon/agent-ready";
import { validate } from "@chrissgon/agent-ready/data";
import { generateLlms, generateLlmsParts } from "@chrissgon/agent-ready/llms";
import { generateJsonLd, serializeJsonLd } from "@chrissgon/agent-ready/jsonld";
import { createMcpHandler, TOOL_NAMES } from "@chrissgon/agent-ready/mcp";
import pkg from "@chrissgon/agent-ready/package.json" with { type: "json" };

const data = validate(JSON.parse(readFileSync("../site.json", "utf8")));
const check = (ok, what) => { if (!ok) { console.error(`run.mjs: ${what}`); process.exit(1); } };
check(all.VERSION === pkg.version, "VERSION equals package.json version");
check(generateLlms(data).startsWith("# Sam Example\n"), "generateLlms");
check(Object.keys(generateLlmsParts(data)).join() === "head,about,products,writing,agents", "generateLlmsParts");
check(generateJsonLd(data)["@graph"][0]["@id"] === "https://sam.example.com/#person", "generateJsonLd");
check(!serializeJsonLd(generateJsonLd(data)).includes("<"), "serializeJsonLd");
const handler = createMcpHandler(data);
const res = await handler(new Request("https://sam.example.com/api/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
}));
const body = await res.json();
check(res.status === 200 && body.result.tools.map((t) => t.name).join() === TOOL_NAMES.join(), "handler tools/list");
check((await handler(new Request("https://sam.example.com/api/mcp"))).status === 405, "handler GET 405");
console.error("run.mjs: ok");
EOF
step "importing every entry point"
node run.mjs

cat >types.ts <<'EOF'
import { DataError, type SiteData } from "@chrissgon/agent-ready";
import { validate } from "@chrissgon/agent-ready/data";
import { generateLlms, generateLlmsParts, type LlmsLabels } from "@chrissgon/agent-ready/llms";
import { generateJsonLd, type JsonLdDocument } from "@chrissgon/agent-ready/jsonld";
import { buildServer, createMcpHandler, type McpHandler } from "@chrissgon/agent-ready/mcp";

declare const raw: unknown;
const data: SiteData = validate(raw);
const text: string = generateLlms(data, { lang: "pt", labels: { products: "Produtos" } satisfies Partial<LlmsLabels> });
const about: string = generateLlmsParts(data).about;
const doc: JsonLdDocument = generateJsonLd(data);
const handler: McpHandler = createMcpHandler(data, { maxBodyBytes: 1024, name: "example", version: "1.0.0" });
const response: Promise<Response> = handler(new Request("https://example.com/api/mcp", { method: "POST" }));
buildServer(data).close();
const issues: string[] = new DataError(["data: x: y"]).issues;
// The types are real, not any: each line below must be an error.
// @ts-expect-error generateLlms returns a string
const wrong: number = generateLlms(data);
// @ts-expect-error lang is a string
generateLlms(data, { lang: 1 });
// @ts-expect-error an unknown label
generateLlms(data, { labels: { nope: "x" } });
export { text, about, doc, response, issues, wrong };
EOF
for resolution in nodenext bundler; do
  module=$([ "$resolution" = nodenext ] && echo nodenext || echo preserve)
  cat >"tsconfig.$resolution.json" <<EOF
{ "compilerOptions": { "target": "es2023", "module": "$module", "moduleResolution": "$resolution", "lib": ["es2023", "dom"],
  "types": [], "strict": true, "noEmit": true, "skipLibCheck": true }, "files": ["types.ts"] }
EOF
  step "type-checking against the shipped types (moduleResolution $resolution)"
  "$tsc" -p "tsconfig.$resolution.json" || fail "tsc with moduleResolution $resolution"
done

step "all checks passed"
echo "$summary"
