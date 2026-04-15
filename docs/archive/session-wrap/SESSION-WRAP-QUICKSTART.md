# Session Wrap Quick Start

這份 quick start 已按當前工作區結構校正。

## Root-Level Commands

可直接從工作區根目錄使用的文件：

- `.zshrc-wrap`
- `scripts/session-wrap.sh`
- `scripts/wrap-cli.sh`

## Basic Setup

```bash
source ~/YD\ 2026/.zshrc-wrap
```

## Local Usage

```bash
wrap
wrap "Finished task"
wrap status
```

## Cloud / Backend Usage

如果你需要 session-wrap backend，不要再用舊的根目錄路徑 `~/YD 2026/session-wrap-backend`。

改用：

```bash
cd ~/YD\ 2026/projects/tools/session-wrap-backend
docker-compose up -d
curl http://localhost:3000/health
```

## Related Locations

- Backend project: `projects/tools/session-wrap-backend/`
- Legacy split web/server repo copy: `projects/tools/session-wrap-skill/`
- Obsidian vault: `obsidian/`
- Root scripts: `scripts/`

## Notes

- 舊文檔中凡是出現 `cd ~/YD\ 2026/session-wrap-backend`，都應改成 `cd ~/YD\ 2026/projects/tools/session-wrap-backend`
- 若需要 `web/README.md` 或 `server/` 相關內容，請到 `projects/tools/session-wrap-skill/` 或 `projects/tools/session-wrap-backend/` 查找
