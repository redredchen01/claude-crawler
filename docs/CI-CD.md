---
title: CI/CD Pipeline Guide
type: resource
tags: [cicd, infrastructure, reference]
created: 2026-04-07
updated: 2026-04-07
status: active
heat: hot
summary: "YD 2026 持續集成和部署流程：GitHub Actions、自動化測試與安全掃描"
---

# CI/CD Pipeline Guide

YD 2026 工作區的持續集成和持續部署流程。

---

## 概述

自動化的 CI/CD 流程確保代碼質量、安全性和可靠的部署。

```
代碼推送
    ↓
GitHub Webhook
    ↓
GitHub Actions (CI)
    ├─ 代碼檢查 (Lint)
    ├─ 單元測試
    ├─ 集成測試
    └─ 安全掃描
    ↓
代碼審查 (PR)
    ├─ 人工審查
    └─ Approval
    ↓
合併到 develop
    ↓
自動測試 (完整套件)
    ↓
部署到 Staging
    ↓
Staging 驗證
    ↓
合併到 main
    ↓
自動部署到生產
    ↓
部署後驗證
    ↓
監控和告警
```

---

## 工作流

### 開發分支工作流

**分支：** `feature/*`, `bugfix/*`, `refactor/*`

```yaml
Trigger: Push 到 feature 分支

Steps:
1. Checkout 代碼
2. 安裝依賴
3. Lint 檢查
4. 單元測試
5. 構建驗證
6. 安全掃描

Duration: 5-10 分鐘
On Success: 綠色
On Failure: 紅色 + 通知
```

**GitHub Actions 工作流配置：**

```yaml
name: Feature Branch CI

on:
  push:
    branches:
      - feature/*
      - bugfix/*
  pull_request:
    branches:
      - develop

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run lint
      - run: npm run lint:security

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm test -- --coverage
      - uses: codecov/codecov-action@v3

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run build
      - run: npm run bundle-analysis
```

### Develop 分支工作流

**分支：** `develop`

```yaml
Trigger: Merge 到 develop

Steps:
1. 所有 feature 分支檢查
2. 完整的單元測試
3. 集成測試
4. 安全掃描 (完整)
5. 性能基準測試
6. 構建生產版本
7. 部署到 Staging
8. Staging 煙霧測試

Duration: 15-30 分鐘
On Success: 綠色 + Staging 部署
On Failure: 紅色 + 告警 + 回滾
```

### Main 分支工作流

**分支：** `main`/`master`

```yaml
Trigger: Merge 到 main

Steps:
1. 簽名驗證
2. 所有 CI 檢查
3. 完整的 CD 流程
4. 部署到生產
5. 生產驗證
6. 煙霧測試
7. 監控和告警

Duration: 20-40 分鐘
On Success: 生產部署完成
On Failure: 立即告警 + 自動回滾
```

---

## 詳細配置

### 代碼檢查

```yaml
Lint:
  Tool: ESLint, Prettier
  Rules: Standard + Custom
  Severity: Warning (fix) | Error (fail)

Security Lint:
  Tool: npm audit, snyk
  Level: moderate
  Auto-fix: Weekly

Type Check:
  Tool: TypeScript
  Strict: true
```

### 測試

```yaml
Unit Tests:
  Framework: Jest
  Coverage: >80%
  Timeout: 30s per test

Integration Tests:
  Framework: Mocha + SuperTest
  Database: PostgreSQL (container)
  Cache: Redis (container)
  Timeout: 60s per test

E2E Tests:
  Framework: Playwright / Cypress
  Environment: Staging
  Browsers: Chrome, Firefox
  Parallel: 4 threads
```

### 安全掃描

```yaml
Dependency Check:
  Tool: npm audit, safety
  Frequency: Every push
  Action: Block on critical

SAST (Static Analysis):
  Tool: SonarQube / Checkmarx
  Frequency: Daily
  Rules: OWASP Top 10

DAST (Dynamic Analysis):
  Tool: OWASP ZAP / Burp
  Frequency: Weekly
  Environment: Staging
```

### 構建

```yaml
Build Steps:
  1. Install dependencies
  2. Generate types
  3. Compile/bundle
  4. Optimize (minify, tree-shake)
  5. Generate sourcemaps
  6. Bundle analysis
  7. Size comparison

Artifacts:
  - dist/
  - coverage/
  - bundle-report.html
```

---

## 部署流程

### Staging 部署

**觸發：** develop 分支合併

```bash
# 1. Docker 構建
docker build -t myapp:sha-$(git rev-parse --short HEAD) .

# 2. 推送到 Registry
docker push myapp:sha-xxxxx

# 3. 更新 Staging
kubectl set image deployment/app app=myapp:sha-xxxxx -n staging

# 4. 等待 Ready
kubectl rollout status deployment/app -n staging

# 5. 煙霧測試
npm run test:smoke -- https://staging.example.com

# 6. 性能檢查
npm run test:performance
```

### 生產部署

**觸發：** main 分支合併

```bash
# 1. 驗證構建（來自 develop）
docker pull myapp:sha-xxxxx

# 2. 藍綠部署
kubectl set image deployment/app-blue app=myapp:sha-xxxxx -n prod
kubectl rollout status deployment/app-blue -n prod

# 3. 煙霧測試
npm run test:smoke -- https://example.com

# 4. 流量切換（如果通過）
kubectl patch service app -p '{"spec":{"selector":{"version":"blue"}}}'

# 5. 監控（5 分鐘）
- 檢查錯誤率
- 檢查性能
- 檢查系統資源

# 6. 自動回滾（如果失敗）
kubectl patch service app -p '{"spec":{"selector":{"version":"green"}}}'
```

---

## 環境配置

### Staging 環境

```yaml
Environment: staging.example.com
Database: Production clone (每日)
Cache: 獨立 Redis
Secrets: Staging 密鑰
SSL: 自簽證書
Monitoring: 啟用
Alerts: 發送到 #staging

Cleanup:
  - 每週清理日誌（30 天）
  - 每月清理舊版本（保留最新 5 個）
```

### 生產環境

```yaml
Environment: example.com
Database: Production (備份)
Cache: Redis Cluster
Secrets: KMS 管理
SSL: 有效證書
Monitoring: 完整
Alerts: 頁面尋呼 + Slack

Backup:
  - 每日數據庫備份
  - 異地存儲
  - 月度恢復測試

Disaster Recovery:
  - RTO: 1 小時
  - RPO: 15 分鐘
```

---

## 監控和告警

### 關鍵指標

```yaml
Performance:
  - Response time (p99 < 200ms)
  - Throughput (> 1000 req/s)
  - Error rate (< 0.1%)

Availability:
  - Uptime (> 99.9%)
  - Deployment success rate
  - Rollback rate

Security:
  - Failed auth attempts
  - Suspicious activities
  - Vulnerability detections
```

### 告警規則

```yaml
Critical:
  - 應用無法啟動
  - 數據庫無法連接
  - 500 錯誤率 > 5%
  - 部署失敗
  → Action: 立即通知 + 自動回滾

High:
  - Response time > 1000ms
  - 4xx 錯誤率 > 10%
  - CPU > 80% for 5min
  - 磁盤 > 80%
  → Action: 通知 + 日誌

Medium:
  - 警告日誌增多
  - 內存使用上升
  - 連接池接近滿
  → Action: 監視
```

---

## 故障排除

### 構建失敗

```bash
# 檢查依賴
npm ci --verbose

# 檢查 Node 版本
node --version

# 清理緩存
npm cache clean --force

# 重新構建
npm run build --verbose
```

### 測試失敗

```bash
# 運行本地
npm test -- --verbose

# 查看日誌
docker logs <container-id>

# 重新運行特定測試
npm test -- --testNamePattern="test name"
```

### 部署失敗

```bash
# 檢查 Docker 鏡像
docker images | grep myapp

# 查看部署日誌
kubectl logs -f deployment/app -n staging

# 檢查資源
kubectl describe pod <pod-name> -n staging

# 手動回滾
kubectl rollout undo deployment/app -n prod
```

---

## 最佳實踐

### 代碼審查

- [ ] 所有 PR 需要至少 1 個批准
- [ ] CI 必須通過
- [ ] 代碼覆蓋率 > 80%
- [ ] 沒有安全警告

### 部署檢查

- [ ] 版本號已更新
- [ ] CHANGELOG 已更新
- [ ] 遷移已測試
- [ ] 回滾計劃已準備

### 監控

- [ ] 部署後 5 分鐘內監控
- [ ] 設置告警規則
- [ ] 定期審查日誌
- [ ] 月度容量規劃

---

## CI/CD 工具棧

| 工具 | 用途 | 狀態 |
|------|------|------|
| GitHub Actions | CI/CD 執行 | ✅ |
| Docker | 容器化 | ✅ |
| Kubernetes | 編排 | ✅ |
| SonarQube | 代碼質量 | ⚠️ 可選 |
| Snyk | 依賴掃描 | ✅ |
| DataDog / New Relic | 監控 | 可選 |

---

## 相關文檔

- [WORKSPACE_STRUCTURE.md](WORKSPACE_STRUCTURE.md) - 工作區結構
- [ARCHITECTURE.md](ARCHITECTURE.md) - 當前工作區架構
- [CONTRIBUTING.md](CONTRIBUTING.md) - 貢獻流程

---

**最後更新：** 2026-03-26
**版本：** 1.0
