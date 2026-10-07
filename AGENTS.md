# Agent rules

- MCP server lives in `src/lib/mcp/` (bundled by `mcpPlugin` into `supabase/functions/mcp`, never hand-edit); tools are read-only and query as the OAuth user so RLS applies — keeps agent access within each user's role.
- Completed delivery cards are fetched with stable pagination and bounded SO enrichment queries; all board columns share search and label filters so older delivered orders remain searchable without overwhelming initial rendering.
- Sidebar presentation uses the existing permission-filtered menu tree with collapsible sections and a shared sidebar Button variant; this keeps navigation and authorization unchanged when styling evolves.
