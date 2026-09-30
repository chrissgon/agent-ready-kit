// Read and validate a data file. Every problem becomes one line `data: <field path>: <message>`.
import { readFile } from "node:fs/promises";
import type { z } from "zod";
import { FORBIDDEN_FIELDS, forbiddenPaths, SiteDataSchema, type SiteData } from "./schema.js";

/** The data file is not valid. `issues` holds one `data: <field path>: <message>` line per problem. */
export class DataError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(issues.join("\n"));
    this.name = "DataError";
    this.issues = issues;
  }
}

const FORBIDDEN = new Set<string>(FORBIDDEN_FIELDS);
type Path = readonly PropertyKey[];

const line = (path: Path, message: string) =>
  `data: ${path.length ? path.map(String).join(".") : "(root)"}: ${message}`;

function zodLines(issues: z.core.$ZodIssue[]): string[] {
  return issues.flatMap((issue) => {
    if (issue.code === "unrecognized_keys") {
      // Forbidden keys are reported on their own, with a clearer message.
      return issue.keys.filter((k) => !FORBIDDEN.has(k)).map((k) => line([...issue.path, k], "unknown field"));
    }
    return [line(issue.path, issue.message)];
  });
}

/** Validate a parsed data file. Throws DataError when it is not valid. */
export function validate(value: unknown): SiteData {
  const forbidden = forbiddenPaths(value).map((p) => line(p, `forbidden field "${String(p.at(-1))}", the kit never publishes it`));
  const result = SiteDataSchema.safeParse(value, {
    error: (iss) => (iss.input === undefined && iss.code === "invalid_type" ? "required" : undefined),
  });
  const issues = [...forbidden, ...(result.success ? [] : zodLines(result.error.issues))];
  if (issues.length || !result.success) throw new DataError(issues.length ? issues : [line([], "invalid data")]);
  return result.data;
}

/** Parse and validate the text of a data file. */
export function parseData(json: string): SiteData {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (err) {
    throw new DataError([line([], `invalid JSON: ${(err as Error).message}`)]);
  }
  return validate(value);
}

/** Read, parse and validate a data file. A file that cannot be read throws the file system error. */
export async function loadData(file: string): Promise<SiteData> {
  return parseData(await readFile(file, "utf8"));
}
