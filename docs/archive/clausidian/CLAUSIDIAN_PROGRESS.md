# Clausidian v2.0.0 Development Progress

**獨立開發資料夾** — `/Users/dex/YD 2026/dev/clausidian`

## Timeline

### 2026-03-30 — v2.0.0 Official Release

| 任務 | 狀態 | 詳情 |
|------|------|------|
| **Package Rename** | ✅ | obsidian-agent → clausidian |
| **npm Publish** | ✅ | v2.0.0 live on npm registry |
| **GitHub Tag** | ✅ | v2.0.0 tag created |
| **Independent Repo** | ✅ | Cloned to `/dev/clausidian` |
| **Code Sync** | ✅ | 44 files updated to v2.0.0 |
| **Independent Push** | ✅ | Pushed to redredchen01/Clausidian |
| **CLI Verification** | ✅ | `clausidian --version` → v2.0.0 |

## Repository Structure

```
dev/clausidian/          # Independent git repo
├── .git/                # Points to redredchen01/Clausidian
├── package.json         # v2.0.0
├── README.md            # Updated
├── bin/cli.mjs          # Entry point
├── src/                 # 55+ commands
├── scaffold/            # Agent configs (Claude Code, Cursor, Copilot)
├── skill/               # SKILL.md for /obsidian skill
└── test/                # node:test suite (122/124 passing)
```

## Version Status

| Registry | Version | URL | Status |
|----------|---------|-----|--------|
| **npm** | 2.0.0 | https://www.npmjs.com/package/clausidian | ✅ Live |
| **GitHub** | v2.0.0 | https://github.com/redredchen01/Clausidian/releases/tag/v2.0.0 | ✅ Tagged |
| **CLI** | 2.0.0 | Global: `npm install -g clausidian` | ✅ Working |

## Development Commands

```bash
# Enter independent directory
cd /Users/dex/YD\ 2026/dev/clausidian

# Check version
cat package.json | grep '"version"'

# Run tests
npm test

# Create a new command
touch src/commands/my-feature.mjs

# Sync changes back to workspace
# (manual copy to projects/tools/clausidian/)

# Push to independent repo
git push origin main
```

## Known Issues

| Issue | Severity | Status |
|-------|----------|--------|
| `test/index-manager.test.mjs:70` — Missing `nav-prev` in graph | Low | Backlog |
| Git structure — clausidian in workspace git | Medium | Design decision pending |

## Next Steps

1. **Test Suite Fix** — Resolve `nav-prev` assertion
2. **Monorepo Strategy** — Decide on git submodule vs independent sync
3. **CI/CD Setup** — GitHub Actions for automated testing + npm publish
4. **Documentation** — Add development guide for independent repo

## Workspace Integration

**Current:** Dual source
- Workspace: `/Users/dex/YD 2026/projects/tools/clausidian/` (master copy)
- Independent: `/Users/dex/YD 2026/dev/clausidian/` (tracked separately)

**Recommendation:** Git submodule or monorepo structure for unified workflow

---

Generated: 2026-03-30
