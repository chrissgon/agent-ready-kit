// T-kit-1: the toolchain runs, and every dependency is pinned to an exact version.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VERSION } from "../src/version.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
  type: string;
  bin: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

describe("package", () => {
  it("is an ES module with the agent-ready binary", () => {
    expect(pkg.type).toBe("module");
    expect(pkg.bin).toEqual({ "agent-ready": "dist/cli.js" });
  });

  it("pins every dependency to an exact version", () => {
    const ranges = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).filter(
      ([, version]) => !/^\d+\.\d+\.\d+$/.test(version),
    );
    expect(ranges).toEqual([]);
  });

  it("uses the MCP SDK and zod versions of the site's spike", () => {
    expect(pkg.dependencies["@modelcontextprotocol/sdk"]).toBe("1.31.0");
    expect(pkg.dependencies.zod).toBe("4.6.5");
  });

  it("reports the package version as the MCP server version", () => {
    expect(VERSION).toBe(pkg.version);
  });
});
