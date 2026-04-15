# Obsidian Vault — Cursor Rules

This is an agent-managed Obsidian vault. Use the `clausidian` CLI for all vault operations.

## Commands

```bash
clausidian journal              # Create/open today's journal
clausidian note "Title" type    # Create a note (area/project/resource/idea)
clausidian capture "idea"       # Quick idea capture
clausidian search "keyword"     # Search notes
clausidian list [type]          # List notes
clausidian review               # Generate weekly review
clausidian sync                 # Rebuild indices
```

## Rules

- Read `CONVENTIONS.md` before editing notes manually
- All notes need complete YAML frontmatter (title, type, tags, created, updated, status, summary)
- Use `[[filename]]` for internal links (no `.md` extension)
- File names: lowercase with hyphens
- After manual edits, run `clausidian sync` to rebuild indices
- Check `AGENT.md` for full instructions
