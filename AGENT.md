# Obsidian Vault — Claude Code Integration

Operate this vault via:
- **MCP tools**: `/obsidian` skill or clausidian MCP
- **CLI**: `clausidian` command-line tool
- **Hooks**: Auto context capture (`session-start`, `session-stop`)

## Quick Start

```bash
clausidian read "my-project"              # Read a note
clausidian list                           # List all notes
clausidian search "keyword"               # Full-text search
clausidian journal                        # Today's journal
clausidian note "Title" project --tags "api"  # Create note
clausidian validate                       # Check vault health
```

**Full CLI reference:** See [Clausidian docs](https://github.com/redredchen01/Clausidian) or `clausidian --help`

## Navigation

- `_index.md` — Vault index
- `_tags.md` — Tag index
- `_graph.md` — Knowledge graph
- `CONVENTIONS.md` — Writing rules (**read before editing**)
- `templates/` — Note templates

## Directory Structure

| Directory | Purpose |
|-----------|---------|
| `areas/` | Long-term focus areas |
| `projects/` | Concrete projects |
| `resources/` | References |
| `journal/` | Daily logs & reviews |
| `ideas/` | Draft ideas |

## Manual Edit Rules

When editing files directly:

1. **Read `CONVENTIONS.md` first**
2. **Include complete frontmatter** in new notes
3. **Update `updated` field** when modifying
4. **Maintain `_tags.md`, `_graph.md` indices**
5. **Use lowercase filenames with hyphens**
6. **Internal links**: `[[filename]]` (no `.md` ext)

## Environment Variables

- `OA_VAULT` — Vault path (skip `--vault` flag)
- `OA_TIMEZONE` — Timezone for dates (default: UTC)
