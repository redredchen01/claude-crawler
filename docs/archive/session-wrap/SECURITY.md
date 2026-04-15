# Security Policy

YD 2026 工作區的安全政策和最佳實踐。

---

## 目錄

- [報告安全漏洞](#報告安全漏洞)
- [安全政策](#安全政策)
- [依賴管理](#依賴管理)
- [代碼安全](#代碼安全)
- [密鑰管理](#密鑰管理)
- [訪問控制](#訪問控制)
- [安全清單](#安全清單)

---

## 報告安全漏洞

### 如果發現安全漏洞

**請勿**在 public Issue 上報告。

改為：

1. 發送郵件至項目維護者
2. 提供漏洞詳細描述
3. 包括重現步驟
4. 包括潛在影響評估

**預期回應時間：** 48 小時內

### 漏洞披露

- 給予 90 天的修復時間
- 披露前協調披露時間
- 承認報告者（如願意）

---

## 安全政策

### 原則

1. **最小權限** - 只請求所需的訪問權限
2. **深度防禦** - 多層安全控制
3. **審計日誌** - 記錄所有安全相關操作
4. **定期審計** - 季度安全審計

### 責任

| 角色 | 責任 |
|------|------|
| 開發者 | 安全編碼、漏洞報告 |
| Reviewer | 安全代碼審查 |
| 維護者 | 安全補丁、事件響應 |
| 用戶 | 報告漏洞 |

---

## 依賴管理

### 自動檢查

```bash
# npm 安全審計
npm audit
npm audit fix

# Python 依賴檢查
pip install safety
safety check

# Go 依賴檢查
go mod tidy && go list -json -m all | nancy sleuth
```

### 政策

- **更新頻率：** 每週檢查過時依賴
- **緊急修復：** 關鍵漏洞 24 小時內修復
- **大版本更新：** 評估兼容性後計劃更新
- **棄用跟踪：** 監控棄用的依賴

### CI/CD 檢查

在每個 PR 上自動運行：

```bash
npm audit --audit-level=moderate
safety check
go mod tidy
```

### 供應鏈安全

- ✅ 檢查包簽名
- ✅ 使用 lockfiles
- ✅ 監控依賴來源
- ✅ 定期更新依賴
- ✅ 版本固定（避免通配符）

---

## 代碼安全

### 代碼審查檢查清單

在合併前檢查：

- [ ] 沒有硬編碼的密鑰或密碼
- [ ] 沒有 SQL 注入漏洞（使用參數化查詢）
- [ ] 沒有 XSS 漏洞（正確轉義輸出）
- [ ] 輸入驗證完整
- [ ] 錯誤消息不洩露信息
- [ ] 沒有過度寬鬆的權限
- [ ] 日誌不包含敏感信息
- [ ] 依賴已審計
- [ ] 沒有已知漏洞

### 常見漏洞預防

#### SQL 注入預防
- 使用參數化查詢（PreparedStatements）
- 不要字符串連接 SQL
- 使用 ORM 框架（避免原始 SQL）

#### XSS 預防
- 自動轉義用戶輸入
- 避免動態 HTML 生成
- 使用內容安全政策（CSP）頭

#### 不安全的反序列化
- 驗證輸入
- 使用安全的解析方法
- 不評估用戶代碼

### OWASP Top 10

定期檢查：

1. **Broken Access Control** - 訪問控制檢查
2. **Cryptographic Failures** - 加密驗證
3. **Injection** - SQL/NoSQL/OS 注入預防
4. **Insecure Design** - 架構檢查
5. **Security Misconfiguration** - 配置審計
6. **Vulnerable Components** - 依賴檢查
7. **Auth Failures** - 認證和會話管理
8. **Data Integrity Failures** - 數據驗證
9. **Logging Failures** - 日誌和監控
10. **SSRF** - URL 和請求驗證

---

## 密鑰管理

### 密鑰位置

```
✅ 允許
├─ 環境變數
├─ .env.local （本地，Git 忽略）
├─ 密鑰保管庫（Vault）
└─ 密鑰管理服務（AWS Secrets Manager）

❌ 不允許
├─ 源代碼
├─ Git 歷史
├─ Docker 鏡像
├─ 公開倉庫
└─ 日誌文件
```

### 環境變數配置

**.env.example（公開，模板）**
```
DATABASE_URL=postgresql://user:password@localhost/db
API_KEY=your-api-key-here
JWT_SECRET=your-secret-key
```

**.env.local（私有，實際值）**
```
# 不提交到 Git！存儲實際的密鑰
```

### 密鑰旋轉政策

```bash
# 定期更新密鑰（至少每 90 天）
# 1. 生成新密鑰
openssl rand -base64 32

# 2. 更新到密鑰管理服務
# 3. 部署應用
# 4. 驗證新密鑰工作
# 5. 撤銷舊密鑰
```

### 密鑰洩露應對

如果密鑰被意外提交：

1. 立即撤銷密鑰（在密鑰管理服務中）
2. 從 Git 歷史中移除（使用 git-filter-branch）
3. 強制推送（僅在緊急情況下）
4. 通知團隊
5. 生成和部署新密鑰

---

## 訪問控制

### 倉庫訪問規則

- **main/master 分支：** 受保護，需要 PR 審查
- **develop 分支：** 受保護，至少 1 個審查者
- **feature 分支：** 開放，author 可推送

### 分支保護設置

```yaml
main:
  - 需要至少 1 個批准審查
  - 需要通過 CI/CD
  - 拒絕強制推送
  - 拒絕刪除

develop:
  - 需要至少 1 個批准審查
  - 需要通過 CI/CD
  - 允許管理員推送
```

### 訪問級別和權限

| 級別 | 權限 | 用途 |
|------|------|------|
| **Owner** | 全部 | 項目所有者 |
| **Maintainer** | 合併、發布 | 核心開發者 |
| **Developer** | 推送、PR | 貢獻者 |
| **Reporter** | Issue、PR | 報告者 |
| **Guest** | 閱讀 | 外部人員 |

---

## 安全清單

### 開發階段安全

- [ ] 代碼審查檢查清單完成
- [ ] 無硬編碼密鑰
- [ ] 輸入驗證完整
- [ ] 使用參數化查詢
- [ ] 正確轉義輸出
- [ ] 適當的錯誤處理
- [ ] 日誌不含敏感信息
- [ ] 依賴已審計

### 部署安全

- [ ] 環境變數設置正確
- [ ] HTTPS/TLS 啟用
- [ ] CORS 正確配置
- [ ] 安全頭設置（CSP、HSTS）
- [ ] 數據庫加密啟用
- [ ] 備份策略已配置
- [ ] 監控和告警啟用
- [ ] 日誌記錄配置完整

### 定期審計

**每週：**
- npm/pip 依賴審計
- 依賴過時檢查

**每月：**
- 代碼安全掃描
- 訪問控制審查

**每季度：**
- 完整安全審計
- 漏洞評估
- 合規性檢查

---

## 安全工具和掃描

### 自動依賴掃描

```bash
# npm 安全
npm audit
npm audit fix

# Python 安全
pip install safety
safety check

# 代碼掃描
npm run lint
npm run lint:security
```

### 推薦的安全工具

- **npm audit** - npm 依賴漏洞
- **Safety** - Python 包漏洞
- **Snyk** - 多語言依賴掃描
- **SonarQube** - 代碼質量和安全
- **OWASP ZAP** - 動態安全掃描

---

## 事件響應流程

### 安全事件應對步驟

1. **檢測** - 發現漏洞或安全事件
2. **隔離** - 停止受影響的服務（如需）
3. **調查** - 確定根本原因
4. **修復** - 開發和部署修復
5. **驗證** - 確認修復有效
6. **通知** - 通知受影響方
7. **分析** - 事後分析以改進

### 聯繫和報告

- **安全問題：** 見「報告安全漏洞」章節
- **緊急情況：** 直接聯繫項目維護者

---

## 合規性和標準

### 遵循的安全標準

- **OWASP Top 10** - Web 應用安全最佳實踐
- **CWE Top 25** - 常見軟件缺陷
- **CERT Secure Coding** - 安全編碼指南

### 定期審計計劃

- 季度代碼審查
- 年度安全審計
- 事件響應演習

---

## 安全資源和參考

- [OWASP.org](https://owasp.org/) - Web 應用安全項目
- [CWE.mitre.org](https://cwe.mitre.org/) - 常見弱點列表
- [cert.org](https://www.cert.org/) - CERT 安全指南
- [npm Security Advisories](https://www.npmjs.com/advisories) - npm 漏洞數據庫
- [Python Safety DB](https://safety.aio.com/) - Python 漏洞數據庫

---

**最後更新：** 2026-03-26
**版本：** 1.0
