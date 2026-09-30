// T-kit-4 (AC-3): a schema.org @graph with the owner and one SoftwareSourceCode per product, never a forbidden field.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateJsonLd, serializeJsonLd } from "../src/jsonld.js";
import { parseData } from "../src/load.js";
import { FORBIDDEN_FIELDS, type SiteData } from "../src/schema.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const person = parseData(read("../fixtures/person.json"));
const org = parseData(read("../fixtures/org.json"));

/** Every key of every object in a JSON value. */
const allKeys = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.flatMap(allKeys)
    : value && typeof value === "object"
      ? Object.entries(value).flatMap(([k, v]) => [k, ...allKeys(v)])
      : [];

describe("generateJsonLd", () => {
  it("builds the graph of person.json: one Person and one SoftwareSourceCode per product", () => {
    const doc = generateJsonLd(person);
    expect(doc["@context"]).toBe("https://schema.org");
    expect(doc["@graph"].map((n) => n["@type"])).toEqual(["Person", "SoftwareSourceCode", "SoftwareSourceCode"]);
    expect(doc["@graph"][0]).toEqual({
      "@type": "Person",
      "@id": "https://sam.example.com/#owner",
      name: "Sam Example",
      alternateName: "samexample",
      jobTitle: "Software Engineer",
      description: "Software engineer · Small open-source tools for the web",
      url: "https://sam.example.com/",
      sameAs: ["https://git.example.org/samexample", "https://social.example.net/@sam"],
    });
    expect(doc["@graph"][1]).toEqual({
      "@type": "SoftwareSourceCode",
      name: "Tidy Tables",
      description: "Accessible data tables in one small stylesheet.",
      url: "https://tidytables.example.com",
      codeRepository: "https://git.example.org/samexample/tidy-tables",
      programmingLanguage: ["CSS", "TypeScript"],
      license: "https://spdx.org/licenses/MIT.html",
      author: { "@id": "https://sam.example.com/#owner" },
    });
  });

  it("omits the fields a product does not have", () => {
    const quiet = generateJsonLd(person)["@graph"][2]!;
    expect(quiet).not.toHaveProperty("url");
    expect(quiet.codeRepository).toBe("https://git.example.org/samexample/quiet-logs");
  });

  it("describes an Organization owner", () => {
    const doc = generateJsonLd(org);
    expect(doc["@graph"].map((n) => n["@type"])).toEqual(["Organization", "SoftwareSourceCode"]);
    expect(doc["@graph"][0]).not.toHaveProperty("jobTitle");
    expect(doc["@graph"][0]!["@id"]).toBe("https://labs.example.org/#owner");
  });

  it("uses the requested language for descriptions", () => {
    const doc = generateJsonLd(person, { lang: "pt" });
    expect(doc["@graph"][1]!.description).toBe("Tabelas de dados acessíveis numa folha de estilos pequena.");
  });

  it("never contains a forbidden field", () => {
    for (const data of [person, org]) {
      const keys = allKeys(generateJsonLd(data));
      for (const field of FORBIDDEN_FIELDS) expect(keys).not.toContain(field);
    }
  });

  it.each(FORBIDDEN_FIELDS)("refuses data where code added the forbidden field %s", (field) => {
    const tampered = { ...person, owner: { ...person.owner, [field]: "x" } } as SiteData;
    expect(() => generateJsonLd(tampered)).toThrow(`jsonld: forbidden field owner.${field}`);
  });
});

describe("serializeJsonLd", () => {
  it("escapes < so the JSON cannot close a script tag", () => {
    const doc = generateJsonLd({ ...person, owner: { ...person.owner, name: "</script><b>" } });
    const text = serializeJsonLd(doc);
    expect(text).not.toContain("<");
    expect(JSON.parse(text)["@graph"][0].name).toBe("</script><b>");
  });
});
