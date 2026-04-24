# P1 功能测试指南

**爬虫地址:** http://localhost:8501

## 🎯 P1 三大功能说明

### 1️⃣ Unit 6: Smart Page Detection (页面类型检测)
**功能:** 自动判断页面是否需要JavaScript渲染
- ✅ SPA (Vue/React/Next.js) → 使用Playwright渲染
- ✅ 静态页面 → 直接解析HTML，不渲染
- ✅ 混合页面 → 智能决策

**工作原理:**
```
HTML → 检查 <script type="module"> (SPA指标)
     → 检查 <5KB + 空body (SPA shell)
     → 检查 ≥20KB + 丰富metadata (静态)
     → 无明确指标 → 交给 needs_js_rendering() 决定
```

**测试方法:**
1. 进入 http://localhost:8501
2. 输入网址（推荐用例见下）
3. 观察日志中的 "Page detection heuristic triggered" 事件
4. 检查是否正确识别页面类型

### 2️⃣ Unit 4: Infinite Scroll Detection (无限滚动)
**功能:** 自动检测和处理无限滚动页面
- 监测页面高度变化
- 自动向下滚动加载更多内容
- 检测滚动稳定性（连续3次相同高度）

**工作原理:**
```
enable_scroll=True
  → while 页面高度不稳定:
       scroll_pause (500ms)
       记录高度
       检查稳定性阈值
  → 返回完整页面内容
```

**测试方法:**
1. 在爬虫UI中勾选 "Enable infinite scroll"
2. 输入支持无限滚动的网址（如新闻网站）
3. 观察页面高度变化
4. 查看是否正确加载了滚动后的内容

### 3️⃣ Unit 7: Timeout Fallback (超时降级)
**功能:** 页面加载超时时返回已加载的部分HTML
- 不放弃超时页面，返回部分内容
- 发出 RENDER_TIMEOUT 事件用于监控
- 解析器接收部分HTML而非None

**工作原理:**
```
page.goto(timeout=30s)
  → [超时] → 捕获 page.content()
           → 返回 RenderResult(html, timed_out=True)
           → 跳过重试（最佳努力）
  → [成功] → 返回 RenderResult(html, timed_out=False)
```

**测试方法:**
1. 使用 httpstat.us 模拟慢速加载:
   - https://httpstat.us/200?sleep=5000 (5秒延迟)
   - https://httpstat.us/200?sleep=35000 (35秒，会超时)
2. 观察日志中的 "render_timeout" 事件
3. 确认部分HTML被成功捕获和解析

## 📝 推荐测试URL集合

### 静态页面 (Page Detection → 不渲染)
```
https://example.com
https://example.org
https://www.wikipedia.org
```

### SPA应用 (Page Detection → 渲染)
```
https://github.com/redredchen01
https://www.instagram.com/ (会发出多个请求)
```

### 带无限滚动的页面
```
https://news.ycombinator.com/
https://www.reddit.com/r/programming/
```

### 模拟超时/慢速
```
https://httpstat.us/200?sleep=5000    (5秒，正常)
https://httpstat.us/200?sleep=35000   (35秒，会超时)
```

## 🔍 如何查看事件日志

### 方式1: Streamlit 界面
在爬虫的结果页面查看：
- "Page detection heuristic triggered" → SPA/静态判断
- "render_timeout" → 超时事件
- "scroll_detected" → 无限滚动检测

### 方式2: 查看数据库
```bash
sqlite3 /tmp/crawler.db
SELECT event_type, COUNT(*) FROM events GROUP BY event_type;
```

### 方式3: 查看日志文件
```bash
tail -f /tmp/crawler.log | grep -E "PAGE_DETECTION|RENDER_TIMEOUT|SCROLL"
```

## ✅ 测试清单

### Unit 6 验证 (Page Detection)
- [ ] 静态页面：识别为 static → 无Playwright窗口
- [ ] SPA页面：识别为 spa_shell → 启动Playwright  
- [ ] 混合页面：正确降级处理
- [ ] 日志显示正确的heuristic原因

### Unit 4 验证 (Infinite Scroll)  
- [ ] enable_scroll=True 时页面高度增加
- [ ] 检测到稳定后停止滚动
- [ ] 返回完整的滚动后内容
- [ ] 日志显示 scroll_detected 事件

### Unit 7 验证 (Timeout Fallback)
- [ ] 快速页面：正常返回完整HTML
- [ ] 慢速页面（5s）：返回partial HTML，标记 timed_out=true
- [ ] 超时页面（35s）：返回已加载部分，发出 RENDER_TIMEOUT 事件
- [ ] 解析器接收部分HTML，能够提取可用数据

## 🐛 调试技巧

### 查看完整日志
```bash
tail -100 /tmp/crawler.log
```

### 启用详细调试
编辑 `app.py` 或设置环境变量：
```bash
PYTHONUNBUFFERED=1 streamlit run app.py --logger.level=debug
```

### 检查数据库中的事件
```bash
sqlite3 /tmp/crawler.db ".mode column" "SELECT * FROM events ORDER BY timestamp DESC LIMIT 20;"
```

### 查看page_detector的决策过程
在Python中直接测试：
```python
from crawler.page_detector import should_render

html = "<html><script type='module'>...</script></html>"
should_render, reason = should_render(html, "https://example.com")
print(f"Should render: {should_render}, Reason: {reason}")
```

## 📊 期望结果

| 场景 | Page Detection | Render | Timeout | Scroll |
|------|---|---|---|---|
| 静态页面 | static | ❌ | - | - |
| SPA页面 | spa_shell | ✅ | - | - |
| 混合页面 | no_indicator | 按needs_js决定 | - | - |
| 无限滚动 | - | ✅ | - | ✅ |
| 超时页面 | - | ✅ | ✅ (partial) | - |

## 💡 提示

1. **启用DEBUG日志** 查看详细信息
2. **使用httpstat.us** 模拟各种网络场景
3. **检查数据库** 验证数据正确保存
4. **观察事件** 确认监控事件正确触发

## 🚀 下一步

完成以上测试后：
1. ✅ 记录测试结果
2. ✅ 验证P1功能正常工作
3. ✅ 考虑生产部署
4. ✅ 设置监控警告（RENDER_TIMEOUT频率）
