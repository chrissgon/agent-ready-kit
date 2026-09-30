// Public API of @chrissgon/agent-ready. The subpaths `/data`, `/llms`, `/jsonld` and `/mcp` export parts
// of it; all but `/mcp` load without the MCP SDK.
export { FORBIDDEN_FIELDS, SiteDataSchema, type Owner, type Post, type Product, type SiteData } from "./schema.js";
export { DataError, loadData, parseData, validate } from "./load.js";
export {
  DEFAULT_LLMS_LABELS,
  generateLlms,
  generateLlmsParts,
  LLMS_PARTS,
  llmsPath,
  type LlmsLabels,
  type LlmsOptions,
  type LlmsPart,
} from "./llms.js";
export {
  generateJsonLd,
  ownerIdOf,
  serializeJsonLd,
  spdxLicenseUrl,
  type JsonLdDocument,
  type JsonLdNode,
  type JsonLdOptions,
} from "./jsonld.js";
export { buildServer, instructionsFor, TOOL_NAMES, type McpServerOptions } from "./mcp.js";
export { createMcpHandler, DEFAULT_MAX_BODY_BYTES, type McpHandler, type McpHandlerOptions } from "./handler.js";
export { serveStdio } from "./stdio.js";
export { VERSION } from "./version.js";
