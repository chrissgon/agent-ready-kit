// The npm package: publishable metadata, entry points that map to the sources, and subpaths that load
// without the MCP SDK. The packed tarball itself is exercised by scripts/pack-smoke.sh (CI and release).
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL("..", import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Record<string, any>;

/** Every relative module a source file imports, followed transitively, plus the bare packages reached. */
function importGraph(entry: string): { files: string[]; packages: string[] } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const visit = (file: string) => {
    if (files.has(file)) return;
    files.add(file);
    const source = readFileSync(join(root, file), "utf8");
    // `import type` and `export type` are erased at build, so they load nothing.
    for (const m of source.matchAll(/^(?:import|export)\s+(?!type\s)[^;]*?from\s+"([^"]+)"/gms)) {
      const spec = m[1]!;
      if (spec.startsWith(".")) visit(relative(root, join(root, dirname(file), spec.replace(/\.js$/, ".ts"))));
      else packages.add(spec);
    }
  };
  visit(entry);
  return { files: [...files].sort(), packages: [...packages].sort() };
}

describe("package.json", () => {
  it("is publishable as a public, scoped ES module with provenance", () => {
    expect(pkg.private).toBeUndefined();
    expect(pkg.name).toBe("@chrissgon/agent-ready-kit");
    expect(pkg.type).toBe("module");
    expect(pkg.license).toBe("MIT");
    expect(pkg.publishConfig).toEqual({ access: "public", provenance: true });
    expect(pkg.files).toEqual(["dist"]);
    expect(pkg.engines).toEqual({ node: ">=22" });
  });

  it("points repository, homepage and bugs at the public repository", () => {
    expect(pkg.repository).toEqual({ type: "git", url: "git+https://github.com/chrissgon/agent-ready-kit.git" });
    expect(pkg.homepage).toBe("https://github.com/chrissgon/agent-ready-kit#readme");
    expect(pkg.bugs).toEqual({ url: "https://github.com/chrissgon/agent-ready-kit/issues" });
  });

  it("builds every export and the bin from a source file, with types first", () => {
    const targets: string[] = [pkg.bin["agent-ready"], pkg.main, pkg.types];
    for (const [subpath, target] of Object.entries(pkg.exports as Record<string, any>)) {
      if (subpath === "./package.json") continue;
      expect(Object.keys(target)).toEqual(["types", "default"]);
      expect(target.types).toBe(target.default.replace(/\.js$/, ".d.ts"));
      targets.push(target.default, target.types);
    }
    for (const target of targets) {
      const source = target.replace(/^\.\//, "").replace(/^dist\//, "src/").replace(/(\.d)?\.ts$|\.js$/, ".ts");
      expect(() => readFileSync(join(root, source)), `${target} has no source ${source}`).not.toThrow();
    }
  });

  it.each(["./data", "./llms", "./jsonld"])("%s loads without the MCP SDK", (subpath) => {
    const source = pkg.exports[subpath].default.replace("./dist/", "src/").replace(/\.js$/, ".ts");
    const { packages } = importGraph(source);
    expect(packages.filter((p) => p.startsWith("@modelcontextprotocol/"))).toEqual([]);
  });

  it("./mcp exports the server and the handler", async () => {
    const mcp = await import("../src/server.js");
    expect(Object.keys(mcp).sort()).toEqual(["DEFAULT_MAX_BODY_BYTES", "TOOL_NAMES", "buildServer", "createMcpHandler", "instructionsFor"]);
  });
});
