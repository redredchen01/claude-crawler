# Performance Optimization Guide

YD 2026 工作區的性能優化和基準測試指南。

---

## 目錄

- [性能指標](#性能指標)
- [基準測試](#基準測試)
- [前端優化](#前端優化)
- [後端優化](#後端優化)
- [數據庫優化](#數據庫優化)
- [監控](#監控)
- [常見瓶頸](#常見瓶頸)

---

## 性能指標

### 用戶體驗指標 (Core Web Vitals)

| 指標 | 目標 | 工具 |
|------|------|------|
| **LCP** (Largest Contentful Paint) | < 2.5s | Lighthouse, WebVitals |
| **FID** (First Input Delay) | < 100ms | WebVitals |
| **CLS** (Cumulative Layout Shift) | < 0.1 | Lighthouse, WebVitals |

### 應用性能指標

| 指標 | 目標 | 測量方式 |
|------|------|---------|
| **首字節時間 (TTFB)** | < 200ms | curl, Lighthouse |
| **首屏加載時間** | < 3s | 瀏覽器開發工具 |
| **完整頁面加載** | < 5s | WebPageTest |
| **API 響應時間 (p99)** | < 200ms | APM, 日誌分析 |
| **吞吐量** | > 1000 req/s | 負載測試 |

### 資源指標

| 指標 | 目標 |
|------|------|
| **主 bundle 大小** | < 200KB (gzip) |
| **CSS 大小** | < 50KB (gzip) |
| **圖片優化** | < 50% 原始大小 |
| **字體大小** | < 100KB (所有字體) |

---

## 基準測試

### 基準測試流程

```bash
# 1. 建立基準線（main 分支）
git checkout main
npm run build
npm run test:performance

# 2. 在 feature 分支上運行
git checkout feature/optimization
npm run build
npm run test:performance

# 3. 比較結果
npm run performance:compare

# 4. 分析差異
npm run performance:analyze
```

### 工具

```bash
# Lighthouse CLI
npm install -g lighthouse
lighthouse https://example.com --output-path ./report.html

# WebPageTest
webpagetest https://example.com

# K6 負載測試
k6 run script.js

# ab (Apache Bench)
ab -n 1000 -c 10 https://example.com/

# wrk (HTTP 基準測試工具)
wrk -t4 -c100 -d30s https://example.com/
```

### 性能預算

設定和監控性能預算：

```javascript
// package.json
{
  "performanceBudget": {
    "bundles": [
      {
        "name": "main",
        "maxSize": "200kb",
        "minScore": 90
      }
    ],
    "metrics": [
      {
        "name": "FCP",
        "target": 1500,
        "type": "ms"
      },
      {
        "name": "LCP",
        "target": 2500,
        "type": "ms"
      }
    ]
  }
}
```

---

## 前端優化

### Bundle 優化

```bash
# 分析 bundle 大小
npm run bundle:analyze

# 優化結果
npm run build -- --analyze
```

**策略：**

```javascript
// 1. 代碼分割
import('./heavy-module').then(module => {
  // ...
});

// 2. 延遲加載
<img loading="lazy" src="image.jpg">

// 3. 動態導入
const Component = React.lazy(() => import('./Component'));

// 4. Tree-shaking
export { used } from './lib'  // ✅
```

### 圖片優化

```bash
# 圖片壓縮
npm install -g imagemin
imagemin src/**/*.{jpg,png,gif} --out-dir=dist

# 轉換為現代格式
npm install webp-converter
cwebp image.jpg -o image.webp
```

**配置：**

```html
<!-- 現代格式 -->
<picture>
  <source srcset="image.webp" type="image/webp">
  <source srcset="image.jpg" type="image/jpeg">
  <img src="image.jpg" alt="...">
</picture>

<!-- 響應式圖片 -->
<img
  srcset="small.jpg 480w, medium.jpg 768w, large.jpg 1200w"
  src="medium.jpg"
  alt="..."
>

<!-- 懶加載 -->
<img loading="lazy" src="image.jpg">
```

### CSS 優化

```bash
# PurgeCSS - 移除未使用的 CSS
npm install purgecss
purgecss --css src/**/*.css --content src/**/*.html

# 關鍵 CSS 提取
npm install critical
critical src/index.html --output dist/critical.css
```

### JavaScript 優化

```javascript
// 1. 避免阻塞腳本
<script defer src="app.js"></script>

// 2. 預連接
<link rel="preconnect" href="https://api.example.com">

// 3. DNS 預解析
<link rel="dns-prefetch" href="https://cdn.example.com">

// 4. 預加載
<link rel="preload" as="font" href="font.woff2">

// 5. 預渲染
<link rel="prerender" href="https://example.com/next-page">
```

---

## 後端優化

### 數據庫查詢優化

```sql
-- ❌ N+1 查詢
SELECT * FROM users;
foreach user:
  SELECT * FROM posts WHERE user_id = user.id;

-- ✅ JOIN 查詢
SELECT u.*, p.*
FROM users u
LEFT JOIN posts p ON u.id = p.user_id;

-- ✅ 索引
CREATE INDEX idx_user_id ON posts(user_id);
```

### 緩存策略

```javascript
// 1. 應用級緩存
const cache = new Map();

function getCachedData(key) {
  if (cache.has(key)) {
    return cache.get(key);
  }
  const data = fetchData(key);
  cache.set(key, data);
  return data;
}

// 2. Redis 緩存
redis.setex('user:1', 3600, JSON.stringify(userData));
redis.get('user:1');

// 3. HTTP 緩存
res.set('Cache-Control', 'public, max-age=3600');
```

### API 優化

```javascript
// 1. 分頁
GET /api/users?page=1&limit=20

// 2. 字段選擇
GET /api/users?fields=id,name,email

// 3. 過濾
GET /api/users?status=active

// 4. 排序
GET /api/users?sort=-created_at

// 5. 壓縮
app.use(compression());

// 6. 速率限制
const rateLimit = require("express-rate-limit");
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);
```

### 異步處理

```javascript
// ❌ 同步阻塞
const result = heavyComputation();

// ✅ 異步處理
setImmediate(() => {
  heavyComputation();
});

// ✅ 后台任務
queue.enqueue({
  job: 'process-data',
  data: largeDataset
});
```

---

## 數據庫優化

### 索引策略

```sql
-- 分析查詢計劃
EXPLAIN ANALYZE
SELECT * FROM users WHERE email = 'user@example.com';

-- 創建索引
CREATE INDEX idx_email ON users(email);
CREATE INDEX idx_status_created ON posts(status, created_at DESC);

-- 複合索引
CREATE INDEX idx_user_status ON posts(user_id, status);

-- 部分索引
CREATE INDEX idx_active_posts ON posts(user_id) WHERE status = 'active';
```

### 查詢優化

```sql
-- ✅ 使用 LIMIT
SELECT * FROM posts LIMIT 1000;

-- ✅ 避免 SELECT *
SELECT id, title, content FROM posts;

-- ✅ 使用適當的 JOIN
SELECT u.*, COUNT(p.id) as post_count
FROM users u
LEFT JOIN posts p ON u.id = p.user_id
GROUP BY u.id;

-- ✅ 批量操作
INSERT INTO logs (user_id, action) VALUES
(1, 'login'),
(2, 'logout'),
(3, 'comment');
```

### 連接池配置

```javascript
// PostgreSQL
const pool = new Pool({
  max: 20,                    // 最大連接數
  idleTimeoutMillis: 30000,   // 閒置超時
  connectionTimeoutMillis: 2000,
});

// MongoDB
const client = new MongoClient(uri, {
  maxPoolSize: 10,
  minPoolSize: 2,
});
```

---

## 監控

### 性能監控工具

```bash
# Node.js 監控
npm install clinic
clinic doctor -- node app.js

# CPU 性能分析
node --prof app.js
node --prof-process isolate-*.log > profile.txt

# 內存分析
node --inspect=9229 app.js
# 在 Chrome DevTools 中打開 chrome://inspect
```

### 關鍵指標監控

```yaml
# Datadog / New Relic 配置
Metrics:
  - CPU 使用率
  - 內存使用率
  - 磁盤 I/O
  - 網絡延遲
  - 數據庫連接
  - 請求響應時間
  - 錯誤率
  - 吞吐量

Alerts:
  - CPU > 80% for 5min
  - 內存 > 85%
  - 響應時間 > 1000ms (p99)
  - 錯誤率 > 1%
```

### 日誌分析

```bash
# 查找慢查詢
grep "SLOW QUERY" app.log | wc -l

# 分析響應時間分布
grep "response_time" app.log | awk '{print $NF}' | sort -n | tail -100

# 識別熱點
grep "function_call" app.log | sort | uniq -c | sort -rn | head -20
```

---

## 常見瓶頸

### 前端瓶頸

| 瓶頸 | 症狀 | 解決方案 |
|------|------|---------|
| 大 Bundle | FCP > 3s | 代碼分割、Tree-shaking |
| 大圖片 | LCP > 2.5s | 壓縮、WebP、CDN |
| 主線程阻塞 | FID > 100ms | 移動 JS 工作、Web Workers |
| 佈局抖動 | CLS > 0.1 | 固定尺寸、預留空間 |

### 後端瓶頸

| 瓶頸 | 症狀 | 解決方案 |
|------|------|---------|
| 數據庫查詢 | 響應 > 500ms | 添加索引、優化查詢 |
| 數據庫連接 | 連接超時 | 增加連接池 |
| CPU 高 | CPU > 80% | 優化算法、並行化 |
| 內存泄漏 | 內存持續增長 | 代碼分析、修復泄漏 |

### 診斷流程

```bash
# 1. 識別慢操作
grep "duration" logs/*.log | sort -t= -k2 -rn | head -20

# 2. 根本原因分析
npm run profile
chrome://inspect

# 3. 實施修復
# ... 優化代碼 ...

# 4. 測試改進
npm run test:performance -- --baseline

# 5. 部署和監控
git push
# 監視指標
```

---

## 最佳實踐

### 開發階段

- [ ] 建立性能預算
- [ ] 在開發中監控 Core Web Vitals
- [ ] 使用 Lighthouse 進行本地測試
- [ ] 在不同網絡速度下測試

### 部署前

- [ ] 運行完整的性能測試
- [ ] 與基準線比較
- [ ] 驗證圖片和資源優化
- [ ] 檢查 bundle 大小

### 部署後

- [ ] 監控實際用戶指標 (RUM)
- [ ] 設置告警規則
- [ ] 定期回顧性能報告
- [ ] 計劃持續優化

---

## 相關文檔

- [docs/DEVELOPMENT.md](DEVELOPMENT.md) - 開發指南
- [docs/CI-CD.md](CI-CD.md) - CI/CD 流程
- [docs/TROUBLESHOOTING.md](TROUBLESHOOTING.md) - 故障排除

---

**最後更新：** 2026-03-26
**版本：** 1.0
