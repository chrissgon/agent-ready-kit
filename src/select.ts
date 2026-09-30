// Small readers shared by the generators and the MCP server, so every output picks texts the same way.
import type { Post, SiteData } from "./schema.js";

/** The site's default language: the first of `site.langs`. */
export const defaultLang = (data: SiteData): string => data.site.langs[0]!;

/** Throw `<prefix>: "<lang>" is not a site language (...)` unless the site declares `lang`. */
export function assertLang(data: SiteData, lang: string, prefix: string): void {
  if (!data.site.langs.includes(lang)) {
    throw new Error(`${prefix}: "${lang}" is not a site language (${data.site.langs.join(", ")})`);
  }
}

/** Posts sorted newest first; posts with the same date keep the file's order. */
export const postsNewestFirst = (data: SiteData): Post[] =>
  [...data.posts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

/** A post's title in `lang`, else in the post's first language. */
export const postTitle = (post: Post, lang: string): string => post.title[lang] ?? post.title[post.lang[0]!]!;

/** The public link of a product: its URL, else its code repository. */
export const productLink = (p: SiteData["products"][number]): string => (p.url ?? p.codeRepository)!;
