#!/usr/bin/env node
// agent-ready: build llms.txt and JSON-LD, check a data file, or serve the read-only MCP server on stdio.
// Data goes to stdout, diagnostics to stderr. Exit 0 ok, 1 invalid data, 2 wrong usage.
import { realpathSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { generateJsonLd } from "./jsonld.js";
import { generateLlms, llmsPath } from "./llms.js";
import { DataError, loadData } from "./load.js";
import type { SiteData } from "./schema.js";
import { serveStdio } from "./stdio.js";

export const HELP = `Usage: agent-ready <command> --data <file> [--out <dir>]

Make a small site readable by AI agents from one JSON data file.

Commands:
  build --data <file> --out <dir>   Write llms.txt (one per site language; the first at <dir>/llms.txt,
                                    the others at <dir>/<lang>/llms.txt) and <dir>/jsonld.json.
                                    Prints the written paths.
  check --data <file>               Validate the data file. Prints a one-line summary.
  mcp --data <file>                 Serve the read-only MCP server (get_profile, list_products,
                                    list_posts) on stdin and stdout.

Options:
  --data <file>   The JSON data file.
  --out <dir>     Output folder (build only).
  -h, --help      Show this help.

Exit codes: 0 ok, 1 invalid data, 2 wrong usage or unreadable file.
`;

export interface Io {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const processIo: Io = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

class UsageError extends Error {}

async function readData(file: string): Promise<SiteData> {
  try {
    return await loadData(file);
  } catch (err) {
    if (err instanceof DataError) throw err;
    throw new UsageError(`cannot read ${file}: ${(err as Error).message}`);
  }
}

async function build(data: SiteData, out: string, io: Io): Promise<void> {
  const files: [string, string][] = data.site.langs.map((lang) => [join(out, llmsPath(data, lang)), generateLlms(data, { lang })]);
  files.push([join(out, "jsonld.json"), `${JSON.stringify(generateJsonLd(data), null, 2)}\n`]);
  for (const [path, content] of files) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
    io.stdout(`${path}\n`);
  }
}

/** Run the CLI with `argv` (without the node and script paths). Resolves to the exit code. */
export async function run(argv: string[], io: Io = processIo): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        data: { type: "string" },
        out: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    });
    if (values.help) {
      io.stdout(HELP);
      return 0;
    }
    const [command, ...extra] = positionals;
    if (!command) throw new UsageError("missing command");
    if (!["build", "check", "mcp"].includes(command)) throw new UsageError(`unknown command "${command}"`);
    if (extra.length) throw new UsageError(`unexpected argument "${extra[0]}"`);
    if (!values.data) throw new UsageError(`${command} needs --data <file>`);
    if (command === "build" && !values.out) throw new UsageError("build needs --out <dir>");
    if (command !== "build" && values.out) throw new UsageError(`--out only applies to build`);

    const data = await readData(values.data);
    if (command === "check") {
      const { owner, products, posts, site } = data;
      io.stdout(
        `ok: ${values.data}: ${owner.type} "${owner.name}", ${products.length} products, ${posts.length} posts, languages ${site.langs.join(", ")}\n`,
      );
    } else if (command === "build") {
      await build(data, values.out!, io);
    } else {
      await serveStdio(data);
      io.stderr(`agent-ready: read-only MCP server for "${data.owner.name}" on stdio\n`);
    }
    return 0;
  } catch (err) {
    if (err instanceof DataError) {
      io.stderr(`${err.message}\n`);
      return 1;
    }
    const message = (err as Error).message;
    // parseArgs throws TypeError with a code for unknown or malformed options.
    if (err instanceof UsageError || (err as { code?: string }).code?.startsWith("ERR_PARSE_ARGS")) {
      io.stderr(`agent-ready: ${message}\nRun "agent-ready --help" for usage.\n`);
      return 2;
    }
    io.stderr(`agent-ready: ${message}\n`);
    return 1;
  }
}

/** True when this file is the process entry point, also through the npm bin symlink. */
function isEntry(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntry()) {
  // Never call process.exit: the mcp command keeps the process alive on stdin.
  process.exitCode = await run(process.argv.slice(2));
}
