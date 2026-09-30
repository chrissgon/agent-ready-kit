// Entry point `@chrissgon/agent-ready-kit/data`: the data file contract and its validation, without the MCP SDK.
export { FORBIDDEN_FIELDS, SiteDataSchema, type Owner, type Post, type Product, type SiteData } from "./schema.js";
export { DataError, loadData, parseData, validate } from "./load.js";
