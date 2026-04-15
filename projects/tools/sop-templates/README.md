# SOP S4 Implementation Template Library

建立於 2026-03-30，基於已完成 SOP #1-3 的實裝代碼提取。

## 快速開始

### 1. 檢視可用模式

```bash
cat pattern-registry.json
```

### 2. 為新 SOP 選擇模板

三個核心模式覆蓋大多數常見場景：

| 模式 | 用途 | 節省時間 |
|------|------|---------|
| **Schema Validator** | 資料驗證與規範化 | 30-40s |
| **Dedup Algorithm** | 去重 + 狀態管理 | 35-45s |
| **Text Normalization** | 文本檢查 + 格式化 | 25-35s |

### 3. 複製並自訂模板

以 Schema Validator 為例：

```bash
cp s4-implementation/schema-validator-template.mjs \
   ../my-sop-implementation/schema-validator.mjs
```

然後編輯 `schema-validator.mjs`：
- 修改 `exampleSchema` 為您的實際 schema
- 調整 `testData` 進行本地測試
- 整合到您的實裝代碼中

## 實裝流程

### Phase 1: 選擇與複製
1. 根據 SOP 需求對應 `pattern-registry.json` 的 use_cases
2. 複製相應的模板文件
3. 確保依賴已安裝

### Phase 2: 自訂
1. 修改模板中的 `customization_points`
2. 更新範例代碼反映真實資料結構
3. 執行本地測試

### Phase 3: 整合
1. 將自訂模板整合至 S4 實裝代碼
2. 編寫單元測試驗證邏輯
3. 透過 code review 檢驗

## 模板詳解

### Schema Validator (`schema-validator-template.mjs`)

**用途**：驗證和標準化結構化資料

**主要函數**：
```javascript
// 建立驗證器
const validator = createSchemaValidator(mySchema);

// 驗證單筆資料
const result = validator.validate(data);

// 批次驗證
const batchResults = validateBatch(records, validator);

// 格式化錯誤訊息
const messages = formatValidationErrors(errors);
```

**自訂點**：
- `schema` — JSON Schema 定義（properties、required、constraints）
- `ajv options` — useDefaults、coerceTypes 等選項
- `error formatting` — 改變訊息樣式

**範例場景**：
- 驗證 API request body
- 標準化配置文件
- 清理導入的 CSV 資料

---

### Dedup Algorithm (`dedup-algorithm-template.mjs`)

**用途**：在時間窗口內去重，避免重複通知

**主要函數**：
```javascript
// 產生去重簽名（複合鍵）
const sig = dedupSignature(date, entityKey, type);
// 範例: "2026-03-30_site-a_ALERT"

// 檢查和標記
const { toNotify, skipped, stats } = checkAndMarkBatch(
  events,
  state,
  { retentionDays: 7, today: new Date() }
);

// 清理過期記錄
cleanDedupHistory(state, today, 7);
```

**自訂點**：
- `signature format` — 改變複合鍵結構（如：`date_entity_type` → `entity_type_date`）
- `retention days` — 調整歷史保留期限
- `state persistence` — 改為數據庫存儲或其他機制

**範例場景**：
- GA4 異常告警（同日同站點同類型只推一次）
- 工作流事件去重
- 監控告警聚合

---

### Text Normalization (`text-normalization-template.mjs`)

**用途**：驗證、規範化和縮短文本以符合寬度限制

**主要函數**：
```javascript
// 檢查字符限制
const compliance = checkTextCompliance(text, 80);

// 標準化（移除多餘空白、統一格式）
const normalized = normalizeText(text);

// 優雅截斷（在詞邊界處）
const shortened = truncateText(text, 80);

// 分割為多行
const lines = wrapText(text, 80);

// 批次驗證
const results = validateTextBatch(items, 80);
```

**自訂點**：
- `max character limit` — 改變寬度限制（如：120 字符）
- `truncation strategy` — 改為句子邊界或固定截斷
- `normalization rules` — 調整標點/空白處理

**範例場景**：
- CLI 幫助文本規範化（80 字符上限）
- 命令描述驗證
- 批量文本品質報告

---

## 效能指標

基於 SOP #1-3 的實測數據：

### 單個模式的時間節省
```
Schema Validator:    30-40s (S4 耗時 ~200s)
Dedup Algorithm:     35-45s (S4 耗時 ~180s)
Text Normalization:  25-35s (S4 耗時 ~150s)
```

### SOP #5+ 預期效果
- **使用 1 個模式**：節省 ~30-45s
- **使用 2 個模式**：節省 ~60-85s
- **使用 3 個模式**：節省 ~90-120s
- **預期總耗時縮減**：10-15%

## 集成最佳實踐

### 1. 驗證依賴
確保模板所需的 npm 包已安裝：
```bash
npm install ajv ajv-formats  # schema-validator 需要
```

### 2. 測試驗證
每個模板都包含範例代碼，複製後應執行測試：
```bash
node schema-validator.mjs
node dedup-algorithm.mjs
node text-normalization.mjs
```

### 3. 錯誤處理
模板返回結構化結果，便於統一的錯誤處理：
```javascript
const result = validator.validate(data);
if (!result.success) {
  // 處理驗證失敗
  console.error(result.errors);
}
```

### 4. 單元測試
為自訂邏輯編寫測試，特別是 customization_points：
```javascript
test('custom schema validates correctly', () => {
  const result = validator.validate(testData);
  expect(result.success).toBe(true);
});
```

## 模式演進

### 當前版本（v1.0.0）
- 3 個核心模式
- 基於 SOP #1-3
- 預期節省 100-150s

### 後續版本計畫
- **v1.1** — 加入 SOP #4+ 提取的新模式
- **v2.0** — 整合 Subagent 框架，支持並行實裝
- **v3.0** — 元模式系統，自動選擇最佳模板組合

## 反饋與改進

使用模板後，記錄：
- 實際節省的時間
- 遇到的限制或改進空間
- 新發現的 use case

這些反饋將用於優化後續版本。

---

**最後更新**：2026-03-30
**維護者**：DEX Bot
**下一優先級**：第 2 優先級優化 — 並行 Subagent 框架概念設計
