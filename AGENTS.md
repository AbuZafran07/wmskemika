# Agent rules

- MCP server lives in `src/lib/mcp/` (bundled by `mcpPlugin` into `supabase/functions/mcp`, never hand-edit); tools are read-only and query as the OAuth user so RLS applies — keeps agent access within each user's role.
