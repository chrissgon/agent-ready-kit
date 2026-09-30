// llms.txt from the data file, per https://llmstxt.org/ (read 2026-09-30): an H1 with the name, a
// blockquote summary, detail paragraphs and lists, then H2 sections whose items are `[name](url): notes`.
// Section order follows the chrissgon.dev design: Products, Writing, For agents. The texts come from the
// data file in the requested language; headings and the words inside the lines come from `labels`
// (English by default), so a site can write them in each of its languages.
import type { SiteData } from "./schema.js";
import { TOOL_NAMES } from "./tools.js";
import { assertLang, defaultLang, postsNewestFirst, postTitle, productLink } from "./select.js";

/** Headings and the fixed words inside the lines. Every one has an English default. */
export interface LlmsLabels {
  /** H2 above the about paragraphs. Default: none, so the paragraphs are free text before the H2 sections. */
  about?: string;
  /** H2 of the products. Default "Products". */
  products: string;
  /** H2 of the posts. Default "Writing". */
  writing: string;
  /** H2 of the MCP endpoint and the other languages' files. Default "For agents". */
  forAgents: string;
  /** Before a product's code repository. Default "Code". */
  code: string;
  /** Before a product's license. Default "License". */
  license: string;
  /** Before a product's programming languages. Default "Programming languages". */
  programmingLanguages: string;
  /** Before a post's languages. Default "languages". */
  languages: string;
  /** The MCP endpoint's link text. Default "MCP server". */
  mcpServer: string;
  /** The MCP endpoint's notes, before the tool names. Default "read-only, Streamable HTTP (POST); tools". */
  mcpNotes: string;
  /** The notes of a link to another language's file, before the language code. Default "this file in". */
  thisFileIn: string;
}

export const DEFAULT_LLMS_LABELS: Readonly<LlmsLabels> = {
  products: "Products",
  writing: "Writing",
  forAgents: "For agents",
  code: "Code",
  license: "License",
  programmingLanguages: "Programming languages",
  languages: "languages",
  mcpServer: "MCP server",
  mcpNotes: "read-only, Streamable HTTP (POST); tools",
  thisFileIn: "this file in",
};

export interface LlmsOptions {
  /** One of `site.langs`; defaults to the first. */
  lang?: string;
  /** Headings and words for this language; missing ones keep their English default. */
  labels?: Partial<LlmsLabels>;
}

/** The parts of llms.txt, in order. Joined, they are `generateLlms`; a site can place its own parts between them. */
export const LLMS_PARTS = ["head", "about", "products", "writing", "agents"] as const;
export type LlmsPart = (typeof LLMS_PARTS)[number];

/** Where the llms.txt of `lang` lives, relative to the site root: the default language at the root. */
export function llmsPath(data: SiteData, lang: string): string {
  return lang === defaultLang(data) ? "llms.txt" : `${lang}/llms.txt`;
}

/**
 * Each part of llms.txt as text ending in one newline, or "" when the data has nothing for it (no about,
 * no products, no posts, no MCP endpoint and one language). `generateLlms` joins the non-empty parts
 * with a blank line between them.
 */
export function generateLlmsParts(
  data: SiteData,
  { lang = defaultLang(data), labels = {} }: LlmsOptions = {},
): Record<LlmsPart, string> {
  assertLang(data, lang, "llms");
  const w: LlmsLabels = { ...DEFAULT_LLMS_LABELS, ...labels };
  const { owner, site } = data;
  const block = (lines: string[]) => (lines.length ? `${lines.join("\n")}\n` : "");
  const section = (title: string | undefined, items: string[]) =>
    items.length ? block([...(title ? [`## ${title}`, ""] : []), ...items]) : "";

  const head = [`# ${owner.name}`, "", `> ${owner.label[lang]}`];
  if (owner.profiles.length) {
    head.push("", ...owner.profiles.map((p) => `- [${p.network}](${p.url})${p.handle ? `: ${p.handle}` : ""}`));
  }

  const about = (owner.about?.[lang] ?? []).flatMap((paragraph, i) => (i ? ["", paragraph] : [paragraph]));

  const products = data.products.map((p) => {
    const notes = [p.summary[lang]!];
    if (p.url && p.codeRepository) notes.push(`${w.code}: ${p.codeRepository}.`);
    if (p.npm) notes.push(`npm: ${p.npm}.`);
    if (p.license) notes.push(`${w.license}: ${p.license}.`);
    if (p.programmingLanguage.length) notes.push(`${w.programmingLanguages}: ${p.programmingLanguage.join(", ")}.`);
    return `- [${p.name}](${productLink(p)}): ${notes.join(" ")}`;
  });

  const writing = postsNewestFirst(data).map(
    (p) => `- [${postTitle(p, lang)}](${p.url}): ${p.date}; ${w.languages}: ${p.lang.join(", ")}`,
  );

  const agents: string[] = [];
  if (site.mcp) agents.push(`- [${w.mcpServer}](${site.mcp}): ${w.mcpNotes} ${TOOL_NAMES.join(", ")}`);
  for (const other of site.langs.filter((l) => l !== lang)) {
    agents.push(`- [llms.txt (${other})](${site.url}/${llmsPath(data, other)}): ${w.thisFileIn} ${other}`);
  }

  return {
    head: block(head),
    about: section(w.about, about),
    products: section(w.products, products),
    writing: section(w.writing, writing),
    agents: section(w.forAgents, agents),
  };
}

export function generateLlms(data: SiteData, options: LlmsOptions = {}): string {
  const parts = generateLlmsParts(data, options);
  return LLMS_PARTS.map((name) => parts[name])
    .filter(Boolean)
    .join("\n");
}
