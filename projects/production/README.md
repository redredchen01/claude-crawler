# Production Projects

當前 production 層的主要項目如下。

## Active Projects

| Alias | Path | Stack | Role |
|------|------|------|------|
| `p1` | `projects/production/gwx/` | Go + npm | Google Workspace CLI |
| `p2` | `projects/production/claude_code_telegram_bot/` | Node.js + MJS | Telegram / Obsidian / GA4 自動化 |

## Quick Start

### GWX

```bash
cd projects/production/gwx
make install
go test ./...
```

### Claude Code Telegram Bot

```bash
cd projects/production/claude_code_telegram_bot
npm start
npm run smoke
```

## Notes

- `dexapi`
- `test-ydapi`
- `watermark-0324`

以上不再是當前 production 主入口，只是歷史空殼路徑。

## References

- `../../PROJECTS_INFO.md`
- `../../CLAUDE.md`
- `../../docs/ARCHITECTURE.md`
