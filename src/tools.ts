/** The MCP tools, in the order the server registers them. Kept apart from mcp.ts so llms.txt can name them without loading the MCP SDK. */
export const TOOL_NAMES = ["get_profile", "list_products", "list_posts"] as const;
