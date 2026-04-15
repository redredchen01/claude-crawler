# 📊 GA4 运营仪表板 — 使用指南

## 🚀 快速开始

### 方案 A：独立 HTML（推荐 — 无需后端）

```bash
open "/Users/dex/YD 2026/dashboard-standalone.html"
```

✅ **优点**：
- 双击即用，无需安装依赖
- 包含真实 GA4 数据
- 支持 CSV 导入导出
- 支持打印 & 截图

### 方案 B：完整服务器（需要 Node.js）

```bash
cd "/Users/dex/YD 2026"
npm run dashboard
```

访问 http://localhost:3000

✅ **优点**：
- 实时从 GA4 API 拉取最新数据
- 自动刷新
- 支持多属性切换

### 方案 C：Python 脚本（一键拉取数据）

```bash
cd "/Users/dex/YD 2026"
python3 fetch-ga4-data.py
```

生成 CSV 文件，然后在 HTML 仪表板中导入

---

## 📊 仪表板功能

### 1️⃣ 四个指标卡片

| 指标 | 说明 | 警告阈值 |
|-----|------|---------|
| **日活用户** | 今日活跃用户数 | <700 标红 |
| **新增用户** | 今日新注册用户 | 对比昨日 |
| **会话数** | 用户交互次数 | - |
| **用户粘性** | 7日留存率 | - |

### 2️⃣ 两个可视化图表

**7日趋势线**
- 日活用户（蓝线）+ 新增用户（绿虚线）
- 实时跟踪用户增长动向

**渠道分布饼图**
- Direct（直接访问）
- Organic Search（有机搜索）
- Referral（链接推荐）
- Cross-network（跨渠道）
- Unassigned（未归类）

### 3️⃣ 交互功能

| 按钮 | 功能 | 快捷键 |
|-----|------|--------|
| **📥 导入数据** | 上传 CSV 文件 | — |
| **🔄 示例数据** | 加载内置 GA4 数据 | — |
| **📥 导出 CSV** | 导出当前数据 | — |
| **🖨️ 打印** | 打印仪表板 | — |
| **🗑️ 清空数据** | 清除所有数据 | — |
| **双击卡片** | 切换显示模式 | — |

---

## 📋 CSV 格式

### 标准格式（5 列）

```csv
date,activeUsers,newUsers,channel,sessions
2026-04-02,534,344,Unassigned,613
2026-04-01,863,639,Cross-network,1045
```

### 字段说明

| 字段 | 类型 | 示例 |
|-----|------|------|
| `date` | YYYY-MM-DD | 2026-04-02 |
| `activeUsers` | 整数 | 534 |
| `newUsers` | 整数 | 344 |
| `channel` | 字符串 | Organic Search |
| `sessions` | 整数 | 613 |

---

## 🔄 数据流程

### 更新数据的 3 种方式

**方式 1：自动拉取（最新）**
```bash
python3 fetch-ga4-data.py
# → 生成 ga4-data-20260402.csv
# → 在 HTML 中导入此 CSV
```

**方式 2：手动导入 CSV**
1. 打开 `dashboard-standalone.html`
2. 点击 **📥 导入数据**
3. 选择你的 CSV 文件
4. 仪表板自动更新 ✅

**方式 3：实时 API（需要服务器）**
```bash
npm run dashboard
# 访问 http://localhost:3000
# 后端自动从 GA4 API 拉取数据
```

---

## 📁 文件说明

| 文件 | 用途 | 启动方式 |
|-----|------|---------|
| `dashboard-standalone.html` | ⭐ **独立仪表板** | 浏览器直接打开 |
| `dashboard.html` | 配合后端的版本 | `npm run dashboard` |
| `ga4-server.js` | Node.js 后端服务 | `node ga4-server.js` |
| `fetch-ga4-data.py` | Python GA4 拉取脚本 | `python3 fetch-ga4-data.py` |
| `ga4-data-*.csv` | 导出的数据文件 | 用于 HTML 导入 |

---

## 🔐 GA4 配置

### 已配置的参数

| 参数 | 值 |
|-----|-----|
| **属性 ID** | `524298631` |
| **项目 ID** | `openclaw-ga4-488308` |
| **凭证文件** | `openclaw-ga4-488308-b099b607405b.json` ✅ |
| **服务账号** | `openclaw-ga4@openclaw-ga4-488308.iam.gserviceaccount.com` |

### 权限检查

如果遇到 403 权限错误：

1. 打开 [Google Analytics 管理后台](https://analytics.google.com/)
2. 点击 **管理** → **属性用户管理**
3. 添加服务账号邮箱：`openclaw-ga4@openclaw-ga4-488308.iam.gserviceaccount.com`
4. 赋予 **编辑权限** 或更高

---

## 💡 常见问题

### Q: 打开 HTML 后数据为空？
**A:** 点击 **🔄 示例数据** 加载内置的真实 GA4 数据

### Q: 如何导入自己的 CSV？
**A:** 
1. 点击 **📥 导入数据**
2. 选择 CSV 文件
3. 仪表板自动刷新

### Q: 如何更新最新的 GA4 数据？
**A:**
```bash
python3 fetch-ga4-data.py  # 拉取最新数据
# 然后在 HTML 中导入生成的 CSV
```

### Q: 能否在服务器上部署？
**A:** 可以！
```bash
# 方案 1：静态 HTML（无依赖）
# 把 dashboard-standalone.html 上传到任何 Web 服务器

# 方案 2：Node.js 服务器
PORT=3000 npm run dashboard
```

### Q: 支持多属性吗？
**A:** 目前默认配置 524298631，可以修改：
```bash
GA4_PROPERTY_ID=YOUR_ID python3 fetch-ga4-data.py
```

### Q: 数据隐私安全吗？
**A:** 
- 独立 HTML 版本：所有计算本地执行，无网络请求
- 凭证文件：仅用于 Python 脚本和 Node.js 后端，不暴露给浏览器

---

## 🎨 自定义

### 修改警告阈值

编辑 `dashboard-standalone.html` 第 730 行：
```javascript
updateMetric('dau-value', today.activeUsers, 700);  // 改这个数字
```

### 修改颜色主题

编辑 CSS 变量（第 383 行）：
```javascript
const colors = {
    primary: '#00d4ff',    // 蓝色
    success: '#4ade80',    // 绿色
    danger: '#ff3232',     // 红色
    text: '#e0e0e0'        // 文字
};
```

### 添加新渠道

编辑 Python 脚本 `fetch-ga4-data.py` 的 `get_channel_distribution()` 函数

---

## 📞 支持

### 检查环境

```bash
# 检查 Python
python3 --version

# 检查 Node.js
node --version

# 检查 GA4 凭证
ls -la openclaw-ga4-488308-b099b607405b.json
```

### 调试日志

**Python 脚本**
```bash
python3 -u fetch-ga4-data.py  # 实时输出
```

**Node.js 服务器**
```bash
GA4_PROPERTY_ID=524298631 npm run dashboard
# 查看控制台日志
```

---

## 🚀 下一步

1. ✅ **立即使用**：打开 `dashboard-standalone.html`
2. 📊 **定期更新**：运行 `python3 fetch-ga4-data.py` 拉取最新数据
3. 📈 **深度分析**：将仪表板集成到你的报告系统
4. 🔄 **自动化**：设置 cron 任务定期拉取数据

---

*创建于 2026-04-02 | GA4 属性: openclaw-ga4*
