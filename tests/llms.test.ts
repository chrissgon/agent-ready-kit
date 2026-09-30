// T-kit-3 (AC-2): llms.txt follows https://llmstxt.org/ (H1, blockquote summary, details, H2 link lists)
// and matches the reviewed reference file.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateLlms, generateLlmsParts, LLMS_PARTS, llmsPath } from "../src/llms.js";
import { TOOL_NAMES } from "../src/mcp.js";
import { parseData } from "../src/load.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const person = parseData(read("../fixtures/person.json"));
const org = parseData(read("../fixtures/org.json"));

describe("generateLlms", () => {
  it("matches the reference file for person.json in the default language", () => {
    expect(generateLlms(person)).toBe(read("./golden/person.llms.txt"));
  });

  it("starts with the H1 name and the blockquote label", () => {
    const lines = generateLlms(person).split("\n");
    expect(lines[0]).toBe("# Sam Example");
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe("> Software engineer · Small open-source tools for the web");
  });

  it("has H2 sections whose list items are markdown links", () => {
    const out = generateLlms(person);
    const sections = out.split(/^## /m).slice(1);
    expect(sections.map((s) => s.split("\n")[0])).toEqual(["Products", "Writing", "For agents"]);
    for (const section of sections) {
      const items = section.split("\n").filter((l) => l.startsWith("- "));
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) expect(item).toMatch(/^- \[[^\]]+\]\(https:\/\/[^)]+\)(: .+)?$/);
    }
  });

  it("lists posts newest first", () => {
    const writing = generateLlms(person).split("## Writing")[1]!.split("## ")[0]!;
    expect([...writing.matchAll(/\): (\d{4}-\d{2}-\d{2})/g)].map((m) => m[1])).toEqual([
      "2026-09-20",
      "2026-08-14",
      "2026-05-02",
    ]);
  });

  it("writes another language with its texts and links back to the default file", () => {
    const out = generateLlms(person, { lang: "pt" });
    expect(out).toContain("> Engenheiro de software · Ferramentas pequenas de código aberto para a web");
    expect(out).toContain("- [Tabelas para todos](https://blog.example.com/tables-for-everyone): 2026-08-14; languages: en, pt");
    expect(out).toContain("- [Tidy Tables](https://tidytables.example.com): Tabelas de dados acessíveis numa folha de estilos pequena.");
    expect(out).toContain("- [llms.txt (en)](https://sam.example.com/llms.txt)");
  });

  it("keeps a post's own title when it has none in the requested language", () => {
    expect(generateLlms(person, { lang: "en" })).toContain("- [Logs que sussurram](https://blog.example.com/logs-que-sussurram): 2026-05-02; languages: pt");
  });

  it("omits the sections that would have no link", () => {
    const out = generateLlms(org);
    expect(out).toContain("## Products");
    expect(out).not.toContain("## Writing");
    expect(out).not.toContain("## For agents");
  });

  it("refuses a language the site does not declare", () => {
    expect(() => generateLlms(org, { lang: "pt" })).toThrow('llms: "pt" is not a site language (en)');
  });
});

describe("generateLlmsParts", () => {
  it("returns the parts in order, and joined with a blank line they are generateLlms", () => {
    for (const [data, lang] of [[person, "en"], [person, "pt"], [org, "en"]] as const) {
      const parts = generateLlmsParts(data, { lang });
      expect(Object.keys(parts)).toEqual([...LLMS_PARTS]);
      const joined = LLMS_PARTS.map((p) => parts[p]).filter(Boolean).join("\n");
      expect(joined).toBe(generateLlms(data, { lang }));
      for (const part of Object.values(parts)) if (part) expect(part).toMatch(/[^\n]\n$/);
    }
  });

  it("leaves a part empty when the data has nothing for it", () => {
    const parts = generateLlmsParts(org);
    expect(parts.about).toBe("");
    expect(parts.writing).toBe("");
    expect(parts.agents).toBe("");
    expect(parts.head).toBe("# Example Labs\n\n> A small studio that maintains open-source developer tools\n\n- [Code](https://git.example.org/exlabs)\n");
  });

  it("names the tools the MCP server registers", () => {
    expect(generateLlmsParts(person).agents).toContain(`tools ${TOOL_NAMES.join(", ")}`);
  });
});

describe("labels", () => {
  const pt = {
    about: "Sobre",
    products: "Produtos",
    writing: "Escrita",
    forAgents: "Para agentes",
    code: "Código",
    license: "Licença",
    programmingLanguages: "Linguagens",
    languages: "idiomas",
    mcpServer: "Servidor MCP",
    mcpNotes: "só leitura, Streamable HTTP (POST); ferramentas",
    thisFileIn: "este arquivo em",
  };

  it("replace every heading and word, and an about label puts the paragraphs under an H2", () => {
    const out = generateLlms(person, { lang: "pt", labels: pt });
    expect(out.split("\n").filter((l) => l.startsWith("## "))).toEqual(["## Sobre", "## Produtos", "## Escrita", "## Para agentes"]);
    expect(out).toContain("## Sobre\n\nSam cria ferramentas");
    expect(out).toContain(
      "Código: https://git.example.org/samexample/tidy-tables. npm: @samexample/tidy-tables. Licença: MIT. Linguagens: CSS, TypeScript.",
    );
    expect(out).toContain("- [Tabelas para todos](https://blog.example.com/tables-for-everyone): 2026-08-14; idiomas: en, pt");
    expect(out).toContain("- [Servidor MCP](https://sam.example.com/api/mcp): só leitura, Streamable HTTP (POST); ferramentas get_profile");
    expect(out).toContain("- [llms.txt (en)](https://sam.example.com/llms.txt): este arquivo em en");
    for (const word of ["Products", "Writing", "For agents", "License:", "languages:", "this file in"]) expect(out).not.toContain(word);
  });

  it("keep the English default for a label that is not given", () => {
    const out = generateLlms(person, { labels: { products: "Tools" } });
    expect(out).toContain("## Tools\n");
    expect(out).toContain("## Writing\n");
    expect(out).not.toContain("## About");
  });
});

describe("llmsPath", () => {
  it("puts the default language at the root and the others in a folder", () => {
    expect(llmsPath(person, "en")).toBe("llms.txt");
    expect(llmsPath(person, "pt")).toBe("pt/llms.txt");
  });
});
