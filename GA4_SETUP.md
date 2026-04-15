# GA4 Dashboard 设置指南

## 快速开始

### 1️⃣ 安装依赖
```bash
cd /Users/dex/YD\ 2026
npm install
```

### 2️⃣ 启动服务
```bash
npm run dashboard
```

> 📍 访问：http://localhost:3000

### 3️⃣ 设置说明

| 项目 | 值 |
|-----|-----|
| **属性 ID** | `524298631` |
| **凭证文件** | `openclaw-ga4-488308-b099b607405b.json` ✅（已配置） |
| **项目 ID** | `openclaw-ga4-488308` |
| **服务账号** | `openclaw-ga4@openclaw-ga4-488308.iam.gserviceaccount.com` |

---

## 功能特性

✅ **实时 GA4 数据拉取**
- 日活用户数（DAU）
- 新增用户数
- 会话统计
- 渠道分布

✅ **交互式仪表板**
- 深色主题
- 双击卡片切换模式
- 实时图表（趋势 + 饼图）

✅ **灵活数据源**
- 自动从 GA4 拉取（服务器模式）
- 手动上传 CSV 文件
- 示例数据快速预览

---

## 常见问题

### Q: 403 权限错误
**A:** 检查服务账号是否有 GA4 属性 524298631 的读权限
- 打开 GA4 → Admin → Property User Management
- 添加服务账号（`openclaw-ga4@openclaw-ga4-488308.iam.gserviceaccount.com`）
- 赋予 Editor 或 Analyst 权限

### Q: 模块加载失败
**A:** 确保已安装依赖
```bash
npm install @google-analytics/data
```

### Q: 数据显示不出来
**A:** 检查服务是否正常运行
```bash
# 查看 server 日志
npm run dashboard
# 或测试 API 端点
curl http://localhost:3000/api/ga4-data
```

---

## 文件说明

| 文件 | 用途 |
|-----|-----|
| `ga4-server.js` | GA4 API 服务器 |
| `dashboard.html` | 前端仪表板 UI |
| `data.csv` | 示例数据（可选） |
| `openclaw-ga4-488308-b099b607405b.json` | GA4 凭证（敏感）|

---

## 环境变量

可选：自定义属性 ID
```bash
GA4_PROPERTY_ID=524298631 npm run dashboard
```

默认端口：3000（可自定义）
```bash
PORT=3001 npm run dashboard
```

---

## 停止服务
```
Ctrl+C
```

---

✨ 仪表板已就绪！访问 http://localhost:3000 开始探索数据
