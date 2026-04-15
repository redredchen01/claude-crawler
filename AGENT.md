# Obsidian Vault — Claude Code Integration

This vault is deeply integrated with Claude Code. You (the AI agent) operate this vault via:
- **MCP tools** (recommended): Use `/obsidian` skill or MCP clausidian tools directly
- **CLI**: `clausidian` commands in the terminal
- **Hooks**: Automatic context capture with `session-start`, `pre-tool-use`, `session-stop`

## Quick Start

```bash
# Read a note
clausidian read "my-project"
clausidian read "my-project" --section "TODO"

# Check what's in the vault
clausidian list
clausidian recent                    # last 7 days
clausidian stats                     # vault overview

# Create
clausidian journal                   # today's journal
clausidian note "Title" project --tags "backend,api"
clausidian capture "Quick idea text"

# Search & discover
clausidian search "keyword"          # full-text search
clausidian backlinks "note-name"     # what links here?
clausidian orphans                   # unlinked notes

# Edit existing notes
clausidian patch "note" --heading "TODO" --append "- [ ] New task"
clausidian update "note" --status active --summary "Updated"
clausidian archive "old-note"
clausidian delete "obsolete-note"

# Tags
clausidian tag list
clausidian tag rename "old" "new"

# Rename / Move / Merge
clausidian rename "note" "New Title"  # rename + update refs
clausidian move "note" project        # change type/directory
clausidian merge "source" "target"    # combine two notes

# Batch operations
clausidian batch tag --type idea --add "review"
clausidian batch archive --tag "deprecated"
clausidian batch update --type project --set-status active

# Export / Import
clausidian export backup.json
clausidian import notes.json

# Reviews
clausidian review                    # weekly
clausidian review monthly

# Smart linking & quality
clausidian link --dry-run            # preview missing links
clausidian link                      # auto-link related notes
clausidian validate                  # check frontmatter issues
clausidian relink --dry-run          # preview broken link fixes
clausidian relink                    # auto-fix broken links
clausidian timeline --days 7         # recent activity feed

# Pin favorites
clausidian pin "important-note"
clausidian pin list
clausidian unpin "important-note"

# Graph & discovery
clausidian neighbors "note" --depth 3 # connected notes
clausidian random 3                  # serendipitous review
clausidian focus                     # what to work on next

# Stats & reporting
clausidian count                     # word/line statistics
clausidian agenda                    # pending TODOs
clausidian changelog --days 14       # recent changes
clausidian daily                     # daily dashboard
clausidian suggest                   # improvement suggestions

# Maintenance
clausidian sync                      # rebuild indices
clausidian health                    # vault health score
clausidian graph                     # Mermaid knowledge graph
clausidian broken-links              # find broken [[links]]
clausidian duplicates                # find similar notes
clausidian search "pattern" --regex  # regex search
```

All commands support `--json` for machine-readable output.

## Navigation

- `_index.md` — Vault index
- `_tags.md` — Tag index (find notes by tag)
- `_graph.md` — Knowledge graph (relationships between notes)
- `CONVENTIONS.md` — Writing rules (**read before manual edits**)
- `templates/` — Note templates (`{{}}` placeholders)

## Directory Structure

| Directory | Purpose |
|-----------|---------|
| `areas/` | Long-term focus areas |
| `projects/` | Concrete projects with goals |
| `resources/` | Reference materials |
| `journal/` | Daily logs and weekly reviews |
| `ideas/` | Draft ideas to explore |

## Rules for Manual Edits

If you edit files directly instead of using the CLI:

1. **Read `CONVENTIONS.md` first**
2. **Include complete frontmatter** in new notes
3. **Update `updated` field** when modifying
4. **Update indices**: `_tags.md`, `_graph.md`, directory `_index.md`
5. **Build bidirectional links** via the `related` field
6. **File names**: lowercase with hyphens
7. **Internal links**: `[[filename]]` (no `.md` extension)

## Environment Variables

- `OA_VAULT` — Vault path (so you don't need `--vault` every time)
- `OA_TIMEZONE` — Timezone for dates (default: UTC)
