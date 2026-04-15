# S4 Implementation Guide — 實裝指南

使用 SOP 模板庫的完整流程和最佳實踐。

## 目錄
1. [何時使用各個模板](#何時使用各個模板)
2. [逐步實裝流程](#逐步實裝流程)
3. [自訂策略](#自訂策略)
4. [測試與驗證](#測試與驗證)
5. [常見問題](#常見問題)

---

## 何時使用各個模板

### Schema Validator — JSON 資料驗證

**使用情況**：
- ✅ 需要驗證 API request/response
- ✅ 設定檔需要結構化驗證
- ✅ 導入 CSV/JSON 資料需要清理
- ✅ 需要型態轉換（coerce）
- ✅ 產生驗證錯誤報告

**不適合**：
- ❌ 簡單的字串檢查（用正則表達式即可）
- ❌ 只需做型態檢查而不需要詳細錯誤訊息

**決策樹**：
```
需要驗證資料結構？
├─ 複雜（≥3 層嵌套） → 使用 Schema Validator ✓
├─ 簡單（1-2 層） → 考慮 Validator
└─ 只是基本型態檢查 → 用原生 JS 型態檢查
```

**時間投資**：
- 複製模板：1 分鐘
- 修改 schema：3-5 分鐘
- 測試：2 分鐘
- **總耗時**：6-8 分鐘（S4 內節省 30-40s）

---

### Dedup Algorithm — 去重與狀態管理

**使用情況**：
- ✅ 同日同類型事件只通知一次
- ✅ 監控告警需要聚合
- ✅ 工作流事件需要去重
- ✅ 需要保留時間窗口內的狀態
- ✅ 自動清理舊記錄

**不適合**：
- ❌ 實時流式資料（需要 windowing function）
- ❌ 分散式系統（需要 distributed state）
- ❌ 需要複雜的重複檢測邏輯

**決策樹**：
```
需要去重？
├─ 同日同類型 → 使用 Dedup Algorithm ✓
├─ 複雜時間窗口 → 自訂實裝
└─ 實時流式 → 考慮 Apache Kafka 或類似
```

**時間投資**：
- 複製模板：1 分鐘
- 修改簽名格式：2-3 分鐘
- 整合狀態持久化：3-5 分鐘
- 測試：2 分鐘
- **總耗時**：8-11 分鐘（S4 內節省 35-45s）

---

### Text Normalization — 文本驗證與格式化

**使用情況**：
- ✅ CLI 幫助文本需要寬度限制（80 字符）
- ✅ 命令描述需要規範化
- ✅ 批量驗證文本品質
- ✅ 產生修復建議清單
- ✅ 日誌輸出需要換行

**不適合**：
- ❌ 自然語言處理（需要 NLP 工具）
- ❌ Markdown 解析（用 markdown-it 等）
- ❌ HTML 處理（用 cheerio 等）

**決策樹**：
```
需要驗證文本格式？
├─ 寬度限制 → 使用 Text Normalization ✓
├─ 複雜格式（Markdown/HTML） → 使用專門工具
└─ 簡單規範化 → 用原生字串方法
```

**時間投資**：
- 複製模板：1 分鐘
- 修改限制規則：1-2 分鐘
- 批量驗證：2-3 分鐘
- 測試：2 分鐘
- **總耗時**：6-8 分鐘（S4 內節省 25-35s）

---

## 逐步實裝流程

### Step 1: 需求分析（S0 輸出）

在 SOP S0 階段，確認：
1. **資料結構**：輸入/輸出格式是什麼？
2. **驗證規則**：需要檢查什麼？
3. **邊界情況**：異常值如何處理？
4. **效能要求**：批量還是單筆？

**範例需求**：
```
需求：驗證 task-result 記錄
- 結構：{ task_id, prompt, stop_reason, duration, timestamp }
- 規則：task_id 必須非空、stop_reason ∈ [completed, interrupted, error]
- 邊界：duration 可為 0，timestamp 需為 ISO 8601
- 批量：支持 100+ 筆記錄
```

### Step 2: 模式選擇（S0→S1）

根據需求的特性匹配模式：

**需求特徵 → 模式對應**
```
結構化資料 + 複雜驗證 → Schema Validator
時間窗口 + 去重 → Dedup Algorithm
文本格式 + 寬度限制 → Text Normalization
```

**如需多個模式**：
```
例：P2 task-result 自動歸檔 (SOP #4)
需求：驗證 + 去重 + 格式化標籤
模式組合：Schema Validator + Dedup Algorithm
時間投資：6-8min + 8-11min = 14-19 分鐘
S4 節省：30-40s + 35-45s = 65-85 秒
```

### Step 3: 複製與自訂（S1→S4 前期）

```bash
# 1. 複製選定的模板
cp s4-implementation/schema-validator-template.mjs \
   my-sop/schema-validator.mjs

# 2. 編輯自訂部分
# 關鍵區塊標記為：
# // ============================================
# // Example Usage (自訂此區塊)
# // ============================================

# 修改內容：
# - exampleSchema → 你的 schema 定義
# - testData → 你的測試資料
# - 函數簽名（如需要）

# 3. 驗證依賴
npm install ajv ajv-formats  # schema-validator 需要
```

### Step 4: 本地測試（S1 末期）

```bash
# 運行模板內的範例代碼
node my-sop/schema-validator.mjs

# 輸出應該顯示：
# Validation Results: { valid: [...], invalid: [...], stats: {...} }

# 檢驗項：
# ✓ 有效資料通過
# ✓ 無效資料被捕捉
# ✓ 錯誤訊息清晰
# ✓ 性能在預期內（<1s for 1000 records）
```

### Step 5: 整合至實裝（S4 核心）

將模板函數整合至主邏輯：

```javascript
// 原始代碼片段
async function processTaskResults(records) {
  const results = [];
  for (const rec of records) {
    // 手動驗證...
    results.push(rec);
  }
}

// 使用模板後
import { createSchemaValidator, validateBatch } from './schema-validator.mjs';

const validator = createSchemaValidator(TASK_RESULT_SCHEMA);

async function processTaskResults(records) {
  const { valid, invalid, summary } = validateBatch(records, validator);

  console.log(`驗證結果：${summary.passRate} 通過`);

  if (invalid.length > 0) {
    logErrors(invalid); // 記錄無效記錄
  }

  return valid; // 只處理有效記錄
}
```

### Step 6: Code Review & Testing（S5→S6）

Review 檢查清單：
- [ ] 模板函數簽名正確
- [ ] 錯誤處理完整
- [ ] 自訂點有註解說明
- [ ] 依賴已列在 package.json
- [ ] 單元測試覆蓋關鍵路徑
- [ ] 性能測試通過

---

## 自訂策略

### 修改 Schema（Schema Validator）

**原始 schema**（SOP #1）：
```json
{
  "type": "object",
  "required": ["task_id", "prompt", "stop_reason"],
  "properties": {
    "task_id": { "type": "string", "minLength": 1 },
    "stop_reason": { "enum": ["completed", "interrupted", "error"] }
  }
}
```

**自訂步驟**：
```javascript
// 1. 複製 schema 結構
const MY_SCHEMA = {
  type: "object",
  required: ["id", "email", "status"],
  properties: {
    id: { type: "number", minimum: 1 },
    email: { type: "string", format: "email" },
    status: { enum: ["active", "inactive", "pending"] }
  }
};

// 2. 建立 validator
const validator = createSchemaValidator(MY_SCHEMA);

// 3. 測試
const result = validator.validate({ id: 1, email: "user@example.com", status: "active" });
console.assert(result.success, "Should validate");
```

### 修改簽名格式（Dedup Algorithm）

**原始簽名**（SOP #2）：
```
YYYY-MM-DD_siteKey_TYPE
範例：2026-03-30_site-a_ALERT
```

**自訂簽名**（如需要不同維度）：
```javascript
// 1. 修改簽名函數
function dedupSignature(date, entityKey, type, dimension = '') {
  if (dimension) {
    return `${date}_${entityKey}_${type}_${dimension}`;
  }
  return `${date}_${entityKey}_${type}`;
}

// 2. 使用新簽名
const sig = dedupSignature('2026-03-30', 'user-123', 'LOGIN', 'device-mobile');
// Result: 2026-03-30_user-123_LOGIN_device-mobile
```

### 修改寬度限制（Text Normalization）

**原始限制**（SOP #3）：80 字符

**自訂限制**：
```javascript
// 1. 調整常數
const MAX_HELP_TEXT = 120; // 而不是 80

// 2. 批量驗證
const results = validateTextBatch(items, MAX_HELP_TEXT);

// 3. 修復建議會自動調整
const fixes = generateFixSuggestions(results.invalid);
// 建議會基於 120 字符計算
```

---

## 測試與驗證

### 單元測試範例

```javascript
// schema-validator.test.js
import { createSchemaValidator, validateBatch } from './schema-validator.mjs';

describe('Task Result Validator', () => {
  const schema = {
    type: 'object',
    required: ['task_id', 'prompt'],
    properties: {
      task_id: { type: 'string' },
      prompt: { type: 'string' }
    }
  };

  const validator = createSchemaValidator(schema);

  test('should validate correct data', () => {
    const result = validator.validate({ task_id: 'abc', prompt: 'test' });
    expect(result.success).toBe(true);
  });

  test('should reject missing required field', () => {
    const result = validator.validate({ task_id: 'abc' });
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
  });

  test('should handle batch validation', () => {
    const records = [
      { task_id: 'a', prompt: 'p1' },
      { task_id: 'b' }, // invalid
      { task_id: 'c', prompt: 'p3' }
    ];
    const { valid, invalid } = validateBatch(records, validator);
    expect(valid).toHaveLength(2);
    expect(invalid).toHaveLength(1);
  });
});
```

### 性能基準測試

```javascript
// benchmark.js
import { createSchemaValidator, validateBatch } from './schema-validator.mjs';

const schema = { /* ... */ };
const validator = createSchemaValidator(schema);

// 產生 1000 筆測試資料
const records = Array.from({ length: 1000 }, (_, i) => ({
  task_id: `task-${i}`,
  prompt: `prompt ${i}`
}));

console.time('validate 1000 records');
const result = validateBatch(records, validator);
console.timeEnd('validate 1000 records');
// Expected: < 100ms
```

---

## 常見問題

### Q1: 我的資料不是 JSON，還能用 Schema Validator 嗎？

**A**: 可以。先將資料解析為 JSON 物件，再驗證：
```javascript
// CSV → JSON
const records = csv.parse(csvData, { columns: true });
const validated = validateBatch(records, validator);

// YAML → JSON
const data = yaml.load(yamlString);
const result = validator.validate(data);
```

### Q2: Dedup Algorithm 如何應用於分散式系統？

**A**: 目前模板用於單進程。分散式需求：
1. 將狀態存放在數據庫（Redis/PostgreSQL）
2. 使用原子操作（SET NX）檢查 + 標記
3. 或使用訊息隊列（Kafka）進行全局去重

模板可作為參考實裝。

### Q3: Text Normalization 支援多種語言嗎？

**A**: 基礎功能（空白/標點）支援所有語言。字符計數需注意：
```javascript
// 英文：1 字符 = 1 寬度
"Hello" → 5 characters

// 中文：1 字符 = 2 寬度（通常）
"你好" → 2 characters, ~4 width

// 若需精確計算，使用 unicode-width 庫
import { stringWidth } from 'string-width';
```

### Q4: 模板能與現有代碼混合使用嗎？

**A**: 可以。模板函數是獨立的，可以漸進式採用：
```javascript
// 舊方式
function validateOld(data) { /* ... */ }

// 新方式（模板）
function validateNew(data) {
  const result = validator.validate(data);
  return result.success;
}

// 混合（逐步遷移）
const useNewValidator = featureFlag('use-new-validator');
function validate(data) {
  return useNewValidator ? validateNew(data) : validateOld(data);
}
```

### Q5: 如何測量模板帶來的實際節省？

**A**: 記錄以下指標：
```javascript
const startTime = Date.now();

// S4 實裝代碼
const result = validateBatch(records, validator);

const duration = Date.now() - startTime;
console.log(`S4 耗時（使用模板）: ${duration}ms`);

// 與預期基準比較（見 pattern-registry.json）
// estimated_save: "30-40s" 指 S4 階段節省時間
```

---

## 總結

| 模板 | 時間投資 | S4 節省 | 最佳用途 |
|------|---------|--------|---------|
| Schema Validator | 6-8 min | 30-40s | API/Config 驗證 |
| Dedup Algorithm | 8-11 min | 35-45s | 告警去重 |
| Text Normalization | 6-8 min | 25-35s | CLI 文本格式 |

**使用模板的 ROI**：
- 單個模式：快速回本（6-11 min 投資，30-45s 節省，apply 2+ 次即回本）
- 多模式組合：指數級節省（兩個模式可節省 60-85s）
- 長期：累積工作流最佳實踐，提升團隊效率

---

**最後更新**：2026-03-30
**下一版本計畫**：v1.1 加入 SOP #4+ 的新模式
