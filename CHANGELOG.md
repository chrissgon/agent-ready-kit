# Changelog


## v0.1.0

[compare changes](https://github.com/chrissgon/agent-ready-kit/compare/8b11d2e0437b25048426d84c6d40204047367092...v0.1.0)

### 🚀 Enhancements

- Strict data file schema and loader with field-named errors (T-kit-2) ([0f70dab](https://github.com/chrissgon/agent-ready-kit/commit/0f70dab))
- Llms.txt generator per llmstxt.org with a reviewed reference file (T-kit-3) ([4faa7bd](https://github.com/chrissgon/agent-ready-kit/commit/4faa7bd))
- Schema.org JSON-LD generator that refuses forbidden fields (T-kit-4) ([14e08b7](https://github.com/chrissgon/agent-ready-kit/commit/14e08b7))
- Read-only MCP server with get_profile, list_products and list_posts (T-kit-5) ([b824070](https://github.com/chrissgon/agent-ready-kit/commit/b824070))
- Stateless Web Request MCP handler and stdio transport (T-kit-6) ([e400737](https://github.com/chrissgon/agent-ready-kit/commit/e400737))
- Agent-ready CLI with build, check and mcp commands (T-kit-7) ([b0c6d57](https://github.com/chrissgon/agent-ready-kit/commit/b0c6d57))

### 📖 Documentation

- README with the data format, commands, handler and static-site use (T-kit-9) ([2a17511](https://github.com/chrissgon/agent-ready-kit/commit/2a17511))
- AGENTS.md records the public repository, its protected main, the pre-commit hook and no npm publish ([#1](https://github.com/chrissgon/agent-ready-kit/pull/1))

### 📦 Build

- Prepare @chrissgon/agent-ready 0.1.0 for npm with trusted publishing ([#2](https://github.com/chrissgon/agent-ready-kit/pull/2))

### 🏡 Chore

- Repository baseline with a secret scan, checks workflow, Dependabot, CODEOWNERS, SECURITY.md and a pre-commit hook ([cfe5f19](https://github.com/chrissgon/agent-ready-kit/commit/cfe5f19))
- Rename the package to @chrissgon/agent-ready-kit ([#4](https://github.com/chrissgon/agent-ready-kit/pull/4))

### ✅ Tests

- Same names and URLs across llms.txt, JSON-LD and MCP; Inspector over stdio (T-kit-8) ([bcb811d](https://github.com/chrissgon/agent-ready-kit/commit/bcb811d))

### 🤖 CI

- A tag for a version already on npm skips the publish ([#3](https://github.com/chrissgon/agent-ready-kit/pull/3))

