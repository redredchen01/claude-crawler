# yd-utility-kit

工作空間通用工具集 — 15 個子命令、85 個測試。

## 安裝

```bash
cd projects/production/yd-utility-kit
pip install -e ".[dev]"
```

## 命令總覽

| 子命令 | 工具 | 用途 |
|--------|------|------|
| `file` | tree, stats, stale | 檔案操作 |
| `git` | summary, scan, stale | Git 輔助 |
| `media` | info, thumbs, compare | 影片/圖片 |
| `text` | links, wordcount, frontmatter, replace | 文字/Markdown |
| `project` | list, info, cd, health | 專案管理 |
| `env` | check, get, doctor | 環境管理 |
| `sys` | status, doctor, top | 系統診斷 |
| `json` | fmt, get, keys, diff, validate, flatten | JSON 處理 |
| `net` | check, http, dns, scan | 網路工具 |
| `hash` | file, text, compare, manifest, verify | 檔案哈希 |
| `find` | grep, files, duplicates | 進階搜尋 |
| `batch` | rename, move, dedup, encode, organize | 批次操作 |
| `watch` | onchange, tail, size | 檔案監聽 |
| `llm` | token, split, test, cache | LLM 工作流加速 |
| `api` | request, head | HTTP API 工具 |

## 開發

```bash
pip install -e ".[dev]"
pytest tests/ -v
```

## 架構

```
src/ydk/
├── cli.py
└── commands/
    ├── file.py       # 檔案操作
    ├── git.py        # Git 輔助
    ├── media.py      # 媒體工具
    ├── text.py       # 文字工具
    ├── project.py    # 專案管理
    ├── env.py        # 環境管理
    ├── sys.py        # 系統診斷
    ├── json_cmd.py   # JSON 處理
    ├── net.py        # 網路工具
    ├── hash.py       # 檔案哈希
    ├── find.py       # 進階搜尋
    ├── batch.py      # 批次操作
    ├── watch.py      # 檔案監聽
    ├── llm.py        # LLM 工作流加速
    └── api.py        # HTTP API 工具 ← NEW
```

---

*v0.5.0 — 2026-04-06 — 15 subcommands, 85 tests (api module + RequestBuilder/RetryStrategy)*
