// llms.txt from the data file, per https://llmstxt.org/ (read 2026-09-30): an H1 with the name, a
// blockquote summary, detail paragraphs and lists, then H2 sections whose items are `[name](url): notes`.
// Section order follows the chrissgon.dev design: Products, Writing, For agents. Headings stay in
// English in every language; the texts come from the data file in the requested language.
import type { SiteData } from "./schema.js";
import { assertLang, defaultLang, postsNewestFirst, postTitle, productLink } from "./select.js";

export interface LlmsOptions {
  /** One of `site.langs`; defaults to the first. */
  lang?: string;
}

/** Where the llms.txt of `lang` lives, relative to the site root: the default language at the root. */
export function llmsPath(data: SiteData, lang: string): string {
  return lang === defaultLang(data) ? "llms.txt" : `${lang}/llms.txt`;
}

export function generateLlms(data: SiteData, { lang = defaultLang(data) }: LlmsOptions = {}): string {
  assertLang(data, lang, "llms");
  const { owner, site } = data;
  const out: string[] = [`# ${owner.name}`, "", `> ${owner.label[lang]}`, ""];

  for (const paragraph of owner.about?.[lang] ?? []) out.push(paragraph, "");
  if (owner.profiles.length) {
    for (const p of owner.profiles) out.push(`- [${p.network}](${p.url})${p.handle ? `: ${p.handle}` : ""}`);
    out.push("");
  }

  const section = (title: string, items: string[]) => {
    if (items.length) out.push(`## ${title}`, "", ...items, "");
  };

  section(
    "Products",
    data.products.map((p) => {
      const notes = [p.summary[lang]!];
      if (p.url && p.codeRepository) notes.push(`Code: ${p.codeRepository}.`);
      if (p.npm) notes.push(`npm: ${p.npm}.`);
      if (p.license) notes.push(`License: ${p.license}.`);
      if (p.programmingLanguage.length) notes.push(`Programming languages: ${p.programmingLanguage.join(", ")}.`);
      return `- [${p.name}](${productLink(p)}): ${notes.join(" ")}`;
    }),
  );

  section(
    "Writing",
    postsNewestFirst(data).map((p) => `- [${postTitle(p, lang)}](${p.url}): ${p.date}; languages: ${p.lang.join(", ")}`),
  );

  const forAgents: string[] = [];
  if (site.mcp) {
    forAgents.push(`- [MCP server](${site.mcp}): read-only, Streamable HTTP (POST); tools get_profile, list_products, list_posts`);
  }
  for (const other of site.langs.filter((l) => l !== lang)) {
    forAgents.push(`- [llms.txt (${other})](${site.url}/${llmsPath(data, other)}): this file in ${other}`);
  }
  section("For agents", forAgents);

  while (out.at(-1) === "") out.pop();
  return `${out.join("\n")}\n`;
}
