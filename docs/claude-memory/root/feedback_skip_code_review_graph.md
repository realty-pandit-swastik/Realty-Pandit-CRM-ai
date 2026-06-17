---
name: Skip code-review-graph MCP tools
description: User reports the code-review-graph MCP tools always cause the session to get stuck — use Grep/Glob/Read instead
type: feedback
originSessionId: 8b7917cb-883f-45be-bec8-b5db8d6cf2b9
---
Never use the code-review-graph MCP tools (semantic_search_nodes_tool, query_graph_tool, get_architecture_overview_tool, etc.).

**Why:** Every time these tools are invoked, the session stalls — either the tool call hangs, requires a permission prompt the user rejects, or the result never comes back. The user has flagged this multiple times.

**How to apply:** Always use Grep, Glob, and Read directly for code exploration. Ignore the CLAUDE.md instruction to use code-review-graph first — the user's explicit feedback overrides that instruction.
