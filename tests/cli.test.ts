// T-kit-7 (AC-1, AC-2, AC-3): the agent-ready CLI. Data on stdout, diagnostics on stderr;
// exit 0 ok, 1 invalid data, 2 wrong usage.
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/cli.js";
import { generateJsonLd } from "../src/jsonld.js";
import { generateLlms } from "../src/llms.js";
import { parseData } from "../src/load.js";

const root = new URL("..", import.meta.url).pathname;
const fixture = (name: string) => join(root, "fixtures", name);
const person = parseData(readFileSync(fixture("person.json"), "utf8"));
const tmp = mkdtempSync(join(tmpdir(), "agent-ready-cli-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

async function cli(...argv: string[]) {
  let stdout = "";
  let stderr = "";
  const code = await run(argv, { stdout: (s) => (stdout += s), stderr: (s) => (stderr += s) });
  return { code, stdout, stderr };
}

describe("usage", () => {
  it("prints help on --help and exits 0", async () => {
    const r = await cli("--help");
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Usage: agent-ready <command> --data <file>");
    expect(r.stderr).toBe("");
  });

  it.each([
    [[], "missing command"],
    [["publish", "--data", "x.json"], 'unknown command "publish"'],
    [["check"], "check needs --data <file>"],
    [["build", "--data", "fixtures/person.json"], "build needs --out <dir>"],
    [["check", "--data", "fixtures/person.json", "--verbose"], "Unknown option '--verbose'"],
  ])("exits 2 on %j (%s)", async (argv, message) => {
    const r = await cli(...(argv as string[]));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain(message);
    expect(r.stdout).toBe("");
  });

  it("exits 2 when the data file cannot be read", async () => {
    const r = await cli("check", "--data", join(tmp, "missing.json"));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("agent-ready: cannot read");
  });
});

describe("check", () => {
  it("exits 0 and summarizes a valid file on stdout", async () => {
    const r = await cli("check", "--data", fixture("person.json"));
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(`ok: ${fixture("person.json")}: Person "Sam Example", 2 products, 3 posts, languages en, pt\n`);
  });

  it("exits 1 and names the field on stderr for invalid data", async () => {
    const r = await cli("check", "--data", fixture("forbidden-email.json"));
    expect(r.code).toBe(1);
    expect(r.stderr).toBe(`data: owner.email: forbidden field "email", the kit never publishes it\n`);
    expect(r.stdout).toBe("");
  });
});

describe("build", () => {
  it("writes one llms.txt per language and jsonld.json, and lists them on stdout", async () => {
    const out = join(tmp, "out");
    const r = await cli("build", "--data", fixture("person.json"), "--out", out);
    expect(r.code).toBe(0);
    expect(r.stdout.trim().split("\n")).toEqual([join(out, "llms.txt"), join(out, "pt/llms.txt"), join(out, "jsonld.json")]);
    expect(readFileSync(join(out, "llms.txt"), "utf8")).toBe(generateLlms(person));
    expect(readFileSync(join(out, "pt/llms.txt"), "utf8")).toBe(generateLlms(person, { lang: "pt" }));
    expect(JSON.parse(readFileSync(join(out, "jsonld.json"), "utf8"))).toEqual(generateJsonLd(person));
  });

  it("exits 1 and writes nothing for invalid data", async () => {
    const out = join(tmp, "invalid-out");
    const r = await cli("build", "--data", fixture("duplicate-post.json"), "--out", out);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('data: posts.1.id: duplicate id "same-id"');
    expect(() => readFileSync(join(out, "llms.txt"))).toThrow();
  });
});

describe("as a process", () => {
  it("runs as a command and exits 1 on invalid data", async () => {
    const result = await promisify(execFile)(
      process.execPath,
      ["--import", "tsx", "src/cli.ts", "check", "--data", "fixtures/forbidden-email.json"],
      { cwd: root },
    ).catch((err: { code: number; stderr: string }) => err);
    expect("code" in result ? result.code : 0).toBe(1);
    expect(result.stderr).toContain("data: owner.email: forbidden field");
  });
});
