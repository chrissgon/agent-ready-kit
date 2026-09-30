// schema.org JSON-LD from the data file: one @graph with the owner (Person or Organization) and one
// SoftwareSourceCode per product, each pointing to the owner's @id. Properties used are defined on
// https://schema.org/SoftwareSourceCode and its parents CreativeWork and Thing (read 2026-09-30).
import { forbiddenPaths, type SiteData } from "./schema.js";
import { assertLang, defaultLang } from "./select.js";

export interface JsonLdOptions {
  /** Language of the descriptions, one of `site.langs`; defaults to the first. */
  lang?: string;
}

export interface JsonLdNode {
  "@type": string;
  "@id"?: string;
  [property: string]: unknown;
}

export interface JsonLdDocument {
  "@context": "https://schema.org";
  "@graph": JsonLdNode[];
}

/** Throw `jsonld: forbidden field <path>` for every forbidden field found in `value`. */
function refuseForbidden(value: unknown): void {
  const found = forbiddenPaths(value).map((p) => `jsonld: forbidden field ${p.map(String).join(".")}`);
  if (found.length) throw new Error(found.join("\n"));
}

export function generateJsonLd(data: SiteData, { lang = defaultLang(data) }: JsonLdOptions = {}): JsonLdDocument {
  // The data is typed, but code can still add a field at run time; refuse it before and after building.
  refuseForbidden(data);
  assertLang(data, lang, "jsonld");
  const { owner, site } = data;
  const ownerId = `${site.url}/#owner`;

  const ownerNode: JsonLdNode = { "@type": owner.type, "@id": ownerId, name: owner.name };
  if (owner.alternateName) ownerNode.alternateName = owner.alternateName;
  if (owner.type === "Person" && owner.jobTitle) ownerNode.jobTitle = owner.jobTitle;
  ownerNode.description = owner.label[lang];
  ownerNode.url = `${site.url}/`;
  if (owner.profiles.length) ownerNode.sameAs = owner.profiles.map((p) => p.url);

  const productNodes = data.products.map((p) => {
    const node: JsonLdNode = { "@type": "SoftwareSourceCode", name: p.name, description: p.summary[lang] };
    if (p.url) node.url = p.url;
    if (p.codeRepository) node.codeRepository = p.codeRepository;
    if (p.programmingLanguage.length) node.programmingLanguage = p.programmingLanguage;
    if (p.license) node.license = `https://spdx.org/licenses/${p.license}.html`;
    node.author = { "@id": ownerId };
    return node;
  });

  const doc: JsonLdDocument = { "@context": "https://schema.org", "@graph": [ownerNode, ...productNodes] };
  refuseForbidden(doc);
  return doc;
}

/** JSON for a `<script type="application/ld+json">`, with "<" escaped so no tag can close the script. */
export const serializeJsonLd = (doc: JsonLdDocument): string => JSON.stringify(doc).replace(/</g, "\\u003c");
