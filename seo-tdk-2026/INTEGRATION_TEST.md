# TDK Optimizer - 端到端整合測試

## 系統架構

```
Frontend (React)
    ↓
useTdkOptimizer Hook
    ↓
API: POST /api/projects/:projectId/clusters/:clusterId/tdk-optimize
    ↓
Backend (Node.js/Hono)
    ↓
RuleBasedTdkGenerator (規則引擎)
    ↓
SQLite Database (儲存)
```

## 測試步驟

### 1. 啟動後端服務

```bash
cd "/Users/dex/YD 2026/seo-tdk-2026"
npm run dev
```

預期輸出：
```
📡 Starting server on http://localhost:8000
```

### 2. 健康檢查

```bash
curl -s http://localhost:8000/health | jq .
```

預期回應：
```json
{
  "status": "ok",
  "timestamp": "2026-04-15T..."
}
```

### 3. 創建測試數據

```bash
sqlite3 "db/tdk.db" << 'EOF'
INSERT OR REPLACE INTO content_plans (
  id, project_id, cluster_id, title, content_type, created_by, created_at, updated_at
) VALUES (
  'test-c1',
  'test-proj',
  'test-c1',
  'Test Content',
  'blog',
  'test-user',
  datetime('now'),
  datetime('now')
);
EOF
```

### 4. 測試英文 TDK 生成

```bash
curl -s -X POST \
  -H "x-user-id: test-user" \
  -H "Content-Type: application/json" \
  "http://localhost:8000/api/projects/test-proj/clusters/test-c1/tdk-optimize" \
  -d '{
    "topic":"Web Development",
    "keywords":["html","css","javascript"],
    "contentSnippet":"Learn modern web development from scratch",
    "language":"en"
  }' | jq '.data.primary'
```

預期回應：
```json
{
  "candidate": {
    "title": "Web Development - Complete Guide",
    "description": "Learn modern web development from scratch...",
    "keywords": ["html", "css", "javascript", ...]
  },
  "validation": {
    "severity": "pass|warn|fail",
    "issues": [...]
  }
}
```

### 5. 測試中文 TDK 生成

```bash
curl -s -X POST \
  -H "x-user-id: test-user" \
  -H "Content-Type: application/json" \
  "http://localhost:8000/api/projects/test-proj/clusters/test-c1/tdk-optimize" \
  -d '{
    "topic":"網頁開發",
    "keywords":["HTML","CSS","JavaScript"],
    "contentSnippet":"從零開始學習現代網頁開發",
    "language":"zh"
  }' | jq '.data.primary.candidate'
```

### 6. 驗證數據保存

```bash
sqlite3 "db/tdk.db" "SELECT tdk_json FROM content_plans WHERE id='test-c1';" | jq .
```

### 7. 測試 GET tdk 端點

```bash
curl -s -H "x-user-id: test-user" \
  "http://localhost:8000/api/projects/test-proj/clusters/test-c1/tdk" | jq '.data'
```

預期：返回已保存的 TDK 數據和生成計數

### 8. 測試 tdk-save 端點

```bash
curl -s -X POST \
  -H "x-user-id: test-user" \
  -H "Content-Type: application/json" \
  "http://localhost:8000/api/projects/test-proj/clusters/test-c1/tdk-save" \
  -d '{
    "userTdkJson": {
      "title": "My Custom Title",
      "description": "User edited description",
      "keywords": ["custom", "keywords"]
    }
  }' | jq '.data'
```

## 前端集成檢查清單

- [ ] useTdkOptimizer hook 正確調用 API
- [ ] API 返回正確格式的數據
- [ ] UI 顯示生成的 TDK 候選項
- [ ] 用戶可以編輯和保存 TDK
- [ ] SERP 預覽正確顯示截斷
- [ ] 驗證 badge 正確顯示

## 測試覆蓋率

| 模塊 | 功能 | 狀態 |
|------|------|------|
| RuleBasedTdkGenerator | EN Title 生成 | ✅ 已驗證 |
| RuleBasedTdkGenerator | EN Description 生成 | ✅ 已驗證 |
| RuleBasedTdkGenerator | ZH Title 生成 | ✅ 已驗證 |
| RuleBasedTdkGenerator | ZH Description 生成 | ✅ 已驗證 |
| RuleBasedTdkGenerator | 關鍵詞提取 | ✅ 已驗證 |
| API: tdk-optimize | POST 端點 | ✅ 已驗證 |
| API: tdk-save | POST 端點 | ⏳ 需驗證 |
| API: GET tdk | GET 端點 | ✅ 已驗證 |
| Database | 保存到 SQLite | ✅ 已驗證 |
| Frontend Hook | useTdkOptimizer | ⏳ 需驗證 |
| Frontend Component | TdkOptimizer UI | ⏳ 需驗證 |

## 注意事項

- 確保數據庫文件在 `db/tdk.db`
- 所有 API 請求需要 `x-user-id` header
- 規則引擎不依賴任何外部 API
- 生成速度應在 10ms 以內（純客戶端計算）

## 故障排除

### 404 錯誤
- 確認 cluster 存在於數據庫
- 檢查 projectId 和 clusterId 拼寫

### 401 錯誤
- 確認請求包含 `x-user-id` header

### 數據沒有保存
- 檢查數據庫路徑
- 驗證 SQLite 權限
- 檢查 tdk_json 欄位是否為 NULL

## 後續工作

- [ ] 完整的前端集成測試
- [ ] 性能基準測試
- [ ] 多語言支持（日文、韓文）
- [ ] 規則引擎優化
- [ ] SERP 預覽實現
