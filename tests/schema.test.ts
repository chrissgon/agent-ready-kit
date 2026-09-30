// T-kit-2 (AC-1): the data file is validated by a strict schema, and every error names the field.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DataError, loadData, validate } from "../src/load.js";
import { FORBIDDEN_FIELDS } from "../src/schema.js";

const fixture = (name: string) => new URL(`../fixtures/${name}`, import.meta.url).pathname;
const raw = (name: string) => JSON.parse(readFileSync(fixture(name), "utf8")) as Record<string, any>;

/** The issues of a validation that must fail. */
function issuesOf(value: unknown): string[] {
  try {
    validate(value);
  } catch (err) {
    expect(err).toBeInstanceOf(DataError);
    return (err as DataError).issues;
  }
  throw new Error("expected validation to fail");
}

describe("valid fixtures", () => {
  it("person.json loads with its owner, products and posts", async () => {
    const data = await loadData(fixture("person.json"));
    expect(data.owner.type).toBe("Person");
    expect(data.owner.name).toBe("Sam Example");
    expect(data.site.langs).toEqual(["en", "pt"]);
    expect(data.products.map((p) => p.name)).toEqual(["Tidy Tables", "Quiet Logs"]);
    expect(data.posts).toHaveLength(3);
  });

  it("org.json loads as an Organization with an empty post list", async () => {
    const data = await loadData(fixture("org.json"));
    expect(data.owner.type).toBe("Organization");
    expect(data.posts).toEqual([]);
  });

  it("drops a trailing slash from the site URL", () => {
    const value = raw("org.json");
    value.site.url = "https://labs.example.org/";
    expect(validate(value).site.url).toBe("https://labs.example.org");
  });
});

describe("invalid fixtures", () => {
  it("extra-key.json fails on the unknown field", async () => {
    await expect(loadData(fixture("extra-key.json"))).rejects.toThrow("data: owner.nickname: unknown field");
  });

  it("forbidden-email.json fails on the forbidden field", async () => {
    await expect(loadData(fixture("forbidden-email.json"))).rejects.toThrow(
      'data: owner.email: forbidden field "email", the kit never publishes it',
    );
  });

  it("duplicate-post.json fails with a duplicate id", async () => {
    const err = await loadData(fixture("duplicate-post.json")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DataError);
    expect((err as DataError).issues).toEqual(['data: posts.1.id: duplicate id "same-id" (first at posts.0)']);
  });
});

describe("rules", () => {
  it.each(FORBIDDEN_FIELDS)("rejects the forbidden field %s on the owner, and only once", (field) => {
    const value = raw("org.json");
    value.owner[field] = "x";
    expect(issuesOf(value)).toEqual([`data: owner.${field}: forbidden field "${field}", the kit never publishes it`]);
  });

  it("rejects a forbidden field nested anywhere", () => {
    const value = raw("org.json");
    value.products[0].address = { city: "x" };
    expect(issuesOf(value)).toEqual([
      'data: products.0.address: forbidden field "address", the kit never publishes it',
    ]);
  });

  it("rejects a URL that is not https", () => {
    const value = raw("org.json");
    value.owner.profiles[0].url = "http://git.example.org/exlabs";
    expect(issuesOf(value)).toEqual(["data: owner.profiles.0.url: must be an https URL"]);
  });

  it("rejects a date that is not YYYY-MM-DD", () => {
    const value = raw("person.json");
    value.posts[0].date = "14/08/2026";
    expect(issuesOf(value)).toEqual(["data: posts.0.date: must be a date YYYY-MM-DD"]);
  });

  it("asks for a text in every site language", () => {
    const value = raw("person.json");
    delete value.owner.label.pt;
    delete value.products[1].summary.en;
    expect(issuesOf(value)).toEqual([
      'data: owner.label.pt: missing text for site language "pt"',
      'data: products.1.summary.en: missing text for site language "en"',
    ]);
  });

  it("rejects a language the site does not declare", () => {
    const value = raw("person.json");
    value.posts[1].lang = ["fr"];
    value.posts[1].title = { fr: "Bonjour" };
    expect(issuesOf(value)).toEqual([
      'data: posts.1.lang.0: "fr" is not a site language (en, pt)',
      'data: posts.1.title.fr: "fr" is not a site language (en, pt)',
    ]);
  });

  it("asks for a post title in each language of the post", () => {
    const value = raw("person.json");
    value.posts[0].title = { en: "Only English" };
    expect(issuesOf(value)).toEqual(['data: posts.0.title.pt: missing text for post language "pt"']);
  });

  it("needs a url or a codeRepository on a product", () => {
    const value = raw("org.json");
    delete value.products[0].url;
    delete value.products[0].codeRepository;
    expect(issuesOf(value)).toEqual(["data: products.0: needs a url or a codeRepository"]);
  });

  it("rejects a jobTitle on an Organization", () => {
    const value = raw("org.json");
    value.owner.jobTitle = "Studio";
    expect(issuesOf(value)).toEqual(["data: owner.jobTitle: unknown field"]);
  });

  it("names a missing required field", () => {
    const value = raw("org.json");
    delete value.owner.name;
    expect(issuesOf(value)).toEqual(["data: owner.name: required"]);
  });

  it("reports invalid JSON at the root", async () => {
    const { parseData } = await import("../src/load.js");
    expect(() => parseData("{ not json")).toThrow(/^data: \(root\): invalid JSON: /);
  });
});
