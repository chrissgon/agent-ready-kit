// The data file contract. Every object is strict: a field that is not declared here fails validation,
// so nothing reaches llms.txt, the JSON-LD or the MCP server unless this schema names it.
import { z } from "zod";

/** Fields the kit never publishes, wherever they appear in the data file. */
export const FORBIDDEN_FIELDS = ["worksFor", "address", "homeLocation", "birthDate", "email"] as const;

const LANG = /^[a-z]{2,3}(-[A-Z]{2})?$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const NPM_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const SPDX_ID = /^[A-Za-z0-9.+-]+$/;

const text = z.string().trim().min(1, { error: "must not be empty" });
const https = z.url({ protocol: /^https$/, error: "must be an https URL" });
const lang = z.string().regex(LANG, { error: "must be a language code such as en or pt-BR" });
/** A text per language code; which languages are required is checked against `site.langs`. */
const localized = z.record(z.string(), text);

const Profile = z.strictObject({
  /** The network or site name shown to readers, e.g. "GitHub". */
  network: text,
  handle: text.optional(),
  url: https,
});

const ownerFields = {
  name: text,
  /** A handle or short name. */
  alternateName: text.optional(),
  /** One line that says who the owner is; the llms.txt summary. */
  label: localized,
  /** Paragraphs about the owner, per language. */
  about: z.record(z.string(), z.array(text).min(1)).optional(),
  profiles: z.array(Profile),
};

const Person = z.strictObject({ type: z.literal("Person"), ...ownerFields, jobTitle: text.optional() });
const Organization = z.strictObject({ type: z.literal("Organization"), ...ownerFields });

const Product = z
  .strictObject({
    name: text,
    url: https.optional(),
    codeRepository: https.optional(),
    /** npm package name. */
    npm: z.string().regex(NPM_NAME, { error: "must be an npm package name" }).optional(),
    /** SPDX license identifier, e.g. MIT. */
    license: z.string().regex(SPDX_ID, { error: "must be an SPDX license identifier such as MIT" }).optional(),
    programmingLanguage: z.array(text),
    summary: localized,
  })
  .refine((p) => p.url !== undefined || p.codeRepository !== undefined, {
    error: "needs a url or a codeRepository",
  });

const Post = z.strictObject({
  id: z.string().regex(SLUG, { error: "must be a lowercase slug such as my-first-post" }),
  /** The title per language of the post. */
  title: localized,
  date: z.iso.date({ error: "must be a date YYYY-MM-DD" }),
  lang: z.array(lang).min(1),
  url: https,
});

const Site = z.strictObject({
  /** The site's origin, https, without a trailing slash (one is removed). */
  url: https.transform((u) => u.replace(/\/+$/, "")),
  /** Languages of the site; the first is the default. */
  langs: z.array(lang).min(1),
  /** Public URL of the site's MCP endpoint, when it serves one. */
  mcp: https.optional(),
});

export const SiteDataSchema = z
  .strictObject({
    site: Site,
    owner: z.discriminatedUnion("type", [Person, Organization]),
    products: z.array(Product),
    posts: z.array(Post),
  })
  .superRefine((data, ctx) => {
    const langs = data.site.langs;
    const known = new Set(langs);
    const list = langs.join(", ");

    const seenLang = new Set<string>();
    langs.forEach((l, i) => {
      if (seenLang.has(l)) ctx.addIssue({ code: "custom", path: ["site", "langs", i], message: `duplicate language "${l}"` });
      seenLang.add(l);
    });

    /** Every site language has a text, and no key is a language the site does not declare. */
    const checkLocalized = (value: Record<string, unknown> | undefined, path: (string | number)[]) => {
      if (!value) return;
      for (const l of langs) {
        if (!(l in value)) ctx.addIssue({ code: "custom", path: [...path, l], message: `missing text for site language "${l}"` });
      }
      for (const key of Object.keys(value)) {
        if (!known.has(key)) ctx.addIssue({ code: "custom", path: [...path, key], message: `"${key}" is not a site language (${list})` });
      }
    };

    checkLocalized(data.owner.label, ["owner", "label"]);
    checkLocalized(data.owner.about, ["owner", "about"]);
    data.products.forEach((p, i) => checkLocalized(p.summary, ["products", i, "summary"]));

    const firstIndex = new Map<string, number>();
    data.posts.forEach((post, i) => {
      const first = firstIndex.get(post.id);
      if (first !== undefined) {
        ctx.addIssue({ code: "custom", path: ["posts", i, "id"], message: `duplicate id "${post.id}" (first at posts.${first})` });
      } else {
        firstIndex.set(post.id, i);
      }
      post.lang.forEach((l, j) => {
        if (!known.has(l)) ctx.addIssue({ code: "custom", path: ["posts", i, "lang", j], message: `"${l}" is not a site language (${list})` });
      });
      for (const key of Object.keys(post.title)) {
        if (!known.has(key)) ctx.addIssue({ code: "custom", path: ["posts", i, "title", key], message: `"${key}" is not a site language (${list})` });
      }
      for (const l of post.lang) {
        if (known.has(l) && !(l in post.title)) {
          ctx.addIssue({ code: "custom", path: ["posts", i, "title", l], message: `missing text for post language "${l}"` });
        }
      }
    });
  });

/** A validated data file. */
export type SiteData = z.output<typeof SiteDataSchema>;
export type Owner = SiteData["owner"];
export type Product = SiteData["products"][number];
export type Post = SiteData["posts"][number];
