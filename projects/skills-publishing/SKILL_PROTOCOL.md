# AI Skill Protocol (Markdown-as-Command)

本規範定義了如何將一個 Markdown 文檔轉化為 AI 可執行的指令技能。

## 1. 核心結構 (`SKILL.md`)
每個技能目錄必須包含一個 `SKILL.md`，其結構如下：

- **Metadata Block**: 使用 YAML 或 Markdown Header 定義技能 ID、版本和依賴。
- **Capabilities**: 明確列出 AI 可以調用的功能（如：`query`, `format`, `post`）。
- **Usage Examples**: 提供 2-3 個標準的 Prompt 範例。
- **Constraints**: 告知 AI 在什麼情況下不應調用此技能。

## 2. 元數據規範 (`package.json`)
在 `package.json` 中必須包含 `skills` 字段：
```json
"skills": {
  "id": "skill-name",
  "main": "logic.md",
  "install": "cp logic.md ~/.gemini/skills/",
  "env": ["API_KEY_NAME"]
}
```

## 3. 加載邏輯
當 AI 代理進入目錄時，優先查閱 `SKILL.md` 以確定其是否具备解決當前問題的能力。
