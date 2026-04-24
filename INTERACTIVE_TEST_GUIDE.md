# 🌐 P1 交互式测试指南

**Streamlit 界面地址:** http://localhost:8502

---

## 🎯 3个快速测试场景

### 场景 1️⃣: Unit 6 - 页面检测（2分钟）

**目标:** 验证爬虫能正确识别静态页面而不浪费时间渲染

**操作步骤:**
1. 打开 http://localhost:8502
2. 在 URL 输入框中输入: `https://example.com`
3. 点击 "Start Crawl"
4. 观察日志输出

**预期结果:**
- ✅ 页面爬取成功
- ✅ HTML被正确解析
- 💡 静态页面 = 不使用Playwright渲染，直接解析

**验证方式:**
```bash
# 查看日志中是否有 page_detection
tail -20 /tmp/streamlit.log | grep -i "detection\|static\|spa"
```

---

### 场景 2️⃣: Unit 4 - 无限滚动（3分钟）

**目标:** 验证爬虫能检测并处理无限滚动页面

**操作步骤:**
1. 在爬虫界面勾选 "Enable infinite scroll" 复选框
2. 输入支持无限滚动的URL:
   - `https://news.ycombinator.com/` (Hacker News)
   - 或其他新闻/社交媒体网站
3. 点击 "Start Crawl"
4. 观察页面高度变化

**预期结果:**
- ✅ Playwright 窗口打开
- ✅ 页面向下滚动（可见高度增加）
- ✅ 返回完整的滚动后HTML
- 💡 无限滚动 = 页面高度稳定后停止

**验证方式:**
```bash
# 查看是否有scroll_detected事件
sqlite3 /tmp/crawler.db "SELECT * FROM events WHERE event_type='scroll_detected';"
```

---

### 场景 3️⃣: Unit 7 - 超时降级（2分钟）

**目标:** 验证超时页面返回部分HTML而非失败

**操作步骤:**
1. 勾选 "Force Playwright Rendering"
2. 输入一个慢速URL:
   - `https://httpstat.us/200?sleep=5000` (5秒延迟)
   - 或任何加载较慢的网站
3. 点击 "Start Crawl"
4. 观察是否返回部分内容

**预期结果:**
- ✅ 页面加载到一半时，继续返回已加载的HTML
- ✅ 不会因为超时而失败
- 💡 超时降级 = 部分HTML > 无内容

**验证方式:**
```bash
# 查看是否有render_timeout事件
sqlite3 /tmp/crawler.db "SELECT event_type, COUNT(*) FROM events GROUP BY event_type;"
```

---

## 🔍 监控和调试

### 实时日志查看
```bash
# 终端1: 实时日志
tail -f /tmp/streamlit.log

# 终端2: 数据库查询
sqlite3 /tmp/crawler.db
SELECT * FROM events ORDER BY timestamp DESC LIMIT 20;
```

### 数据库查询示例

**查看所有事件类型:**
```sql
SELECT event_type, COUNT(*) FROM events GROUP BY event_type;
```

**查看特定扫描的事件:**
```sql
SELECT * FROM events WHERE scan_job_id = 1 ORDER BY timestamp;
```

**查看爬取的页面:**
```sql
SELECT url, status, cached FROM pages WHERE scan_job_id = 1;
```

---

## 📊 性能指标

在爬虫界面可以看到:
- **Pages Crawled**: 爬取的页面数
- **Cache Hits**: 缓存命中次数（如果有重复URL）
- **Elapsed Time**: 总耗时
- **Resources Found**: 发现的资源（标签等）

**目标性能:**
- 单页爬取: < 2秒 (静态) / < 5秒 (带渲染)
- 无限滚动: 5-15秒 (取决于滚动次数)

---

## 🧪 高级测试

### 测试 SPA 检测
输入 SPA 框架构建的网站:
- `https://github.com/redredchen01` (GitHub)
- `https://codesandbox.io` (CodeSandbox)

**预期:** 应该触发 Playwright 渲染

### 测试缓存功能
1. 爬取同一个URL两次
2. 第二次应该明显更快（缓存命中）

### 测试错误处理
输入无效URL:
- `https://invalid-domain-12345.com`
- `https://httpstat.us/500`

**预期:** 优雅的错误处理，记录失败原因

---

## 📋 测试清单

- [ ] Unit 6: 静态页面识别正常
- [ ] Unit 4: 无限滚动检测工作
- [ ] Unit 7: 超时页面返回部分HTML
- [ ] 缓存功能: 重复URL更快加载
- [ ] 错误处理: 无效URL不崩溃
- [ ] 日志记录: 事件正确保存

---

## 🎯 测试完成标准

✅ **所有测试通过** 当:
1. 3个主要场景都能正常运行
2. 数据库中有相应的事件记录
3. 没有未处理的异常
4. 性能在预期范围内

---

## 💡 故障排查

**问题: Streamlit无法访问**
```bash
ps aux | grep streamlit  # 检查进程
lsof -i :8502           # 检查端口
```

**问题: 爬虫卡住**
```bash
tail -50 /tmp/streamlit.log | grep -i error
```

**问题: 数据库错误**
```bash
sqlite3 /tmp/crawler.db ".integrity_check"
```

**重新启动:**
```bash
pkill -f streamlit
rm /tmp/crawler.db
streamlit run app.py
```

---

## 📞 需要帮助?

- 查看日志: `tail -f /tmp/streamlit.log`
- 检查数据库: `sqlite3 /tmp/crawler.db`
- 查看源代码: `crawler/core/engine.py` (P1集成)
- 阅读测试: `tests/test_render.py` (Unit 7 示例)

**祝你测试愉快! 🚀**
