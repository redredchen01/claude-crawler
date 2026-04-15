# 缓存接口设计 — Phase 3 第一步

**日期**: 2026-04-01 18:25 UTC
**目的**: 定义技能间数据共享的标准格式
**实现**: JSON 文件 + 内存缓存

---

## 🎯 设计原则

```
1. 简单 — 易于编程和调试
2. 易扩展 — 支持新数据类型无需改规范
3. 易失效 — 缓存过期自动清理
4. 易验证 — 能检查完整性和时效性
```

---

## 📋 Vault Query Cache 接口设计

### 缓存文件格式

**文件位置**: `/tmp/vault_query_cache_{workflow_name}_{timestamp}.json`

**生命周期**: 5 分钟 (单个工作流执行期间)

**示例**:
```json
{
  "__metadata__": {
    "version": "1.0",
    "source": "vault-query-cache",
    "timestamp": "2026-04-01T18:20:00Z",
    "expires_at": "2026-04-01T18:25:00Z",
    "ttl_seconds": 300,
    "vault_path": "/Users/dex/YD 2026/obsidian",
    "hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  },

  "stats": {
    "total_notes": 52,
    "by_type": {
      "project": 14,
      "resource": 14,
      "journal": 12,
      "idea": 9,
      "area": 3
    },
    "by_status": {
      "active": 41,
      "draft": 11
    }
  },

  "projects": [
    {
      "id": "project_001",
      "name": "gwx",
      "file": "[[gwx]]",
      "type": "project",
      "status": "active",
      "summary": "Gateway Exchange Service",
      "tags": ["automation", "reference"],
      "updated_at": "2026-03-31T18:00:00Z"
    },
    {
      "id": "project_002",
      "name": "TG Bot",
      "file": "[[TG Bot]]",
      "type": "project",
      "status": "active",
      "summary": "Telegram Bot Integration",
      "tags": ["automation"],
      "updated_at": "2026-03-30T15:00:00Z"
    },
    {
      "id": "project_003",
      "name": "VWRS",
      "file": "[[VWRS]]",
      "type": "project",
      "status": "active",
      "summary": "Video Watermark Removal System",
      "tags": ["reference"],
      "updated_at": "2026-03-29T12:00:00Z"
    }
    // ... 11 more projects
  ],

  "recent": [
    {
      "name": "Daily 2026-03-31",
      "type": "journal",
      "file": "[[Daily 2026-03-31]]",
      "updated_at": "2026-03-31T23:00:00Z"
    },
    {
      "name": "Daily 2026-03-30",
      "type": "journal",
      "file": "[[Daily 2026-03-30]]",
      "updated_at": "2026-03-30T23:00:00Z"
    }
    // ... up to 10 recent
  ],

  "tags": {
    "automation": {
      "count": 14,
      "notes": ["gwx", "TG Bot", ...],
      "tier": "monitored",
      "p1_eligible": false
    },
    "reference": {
      "count": 12,
      "notes": ["gwx", "VWRS", ...],
      "tier": "active",
      "p1_eligible": false
    },
    "skill": {
      "count": 8,
      "notes": [...],
      "tier": "monitored",
      "p1_eligible": false
    }
    // ... all tags
  },

  "errors": []
}
```

---

### 缓存验证规则

```bash
# 检查缓存有效性
validate_cache() {
  local cache_file="$1"

  # 1. 文件存在?
  [ -f "$cache_file" ] || return 1

  # 2. JSON 有效?
  jq empty "$cache_file" 2>/dev/null || return 1

  # 3. 未过期?
  local expires_at=$(jq -r '.__metadata__.expires_at' "$cache_file")
  local now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  [ "$now" < "$expires_at" ] || return 1

  # 4. Hash 正确? (可选)
  local stored_hash=$(jq -r '.__metadata__.hash' "$cache_file")
  local current_hash=$(echo "$vault_path" | sha256sum)
  [ "$stored_hash" == "$current_hash" ] || return 1

  return 0
}
```

---

## 🔄 Skill 集成方式

### vault-query-cache (生产者)

```bash
#!/bin/bash
# 输出到标准格式 + 缓存文件

WORKFLOW_NAME="${WORKFLOW_NAME:-generic}"
CACHE_FILE="/tmp/vault_query_cache_${WORKFLOW_NAME}_$(date +%s).json"

# 生成缓存数据
vault_stats=$(OA_VAULT="$OA_VAULT" clausidian stats)
projects=$(OA_VAULT="$OA_VAULT" clausidian list project)
recent=$(OA_VAULT="$OA_VAULT" clausidian recent 10)
tags=$(OA_VAULT="$OA_VAULT" clausidian tag list)

# 生成 JSON 并写入缓存文件
cat > "$CACHE_FILE" << 'EOF'
{
  "__metadata__": {
    "version": "1.0",
    "source": "vault-query-cache",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "expires_at": "$(date -u -v+5m +%Y-%m-%dT%H:%M:%SZ)",
    "ttl_seconds": 300,
    "vault_path": "$OA_VAULT",
    "hash": "$(echo '$OA_VAULT' | sha256sum | cut -d' ' -f1)"
  },
  "stats": $vault_stats,
  "projects": $projects,
  "recent": $recent,
  "tags": $tags,
  "errors": []
}
EOF

# 导出缓存文件路径供后续技能使用
export VAULT_QUERY_CACHE="$CACHE_FILE"

# 输出到 stdout (兼容旧行为)
cat "$CACHE_FILE"
```

### vault-progress-sync (消费者)

```bash
#!/bin/bash
# 优先使用缓存，回退到直接查询

# 1. 检查缓存
if [ -n "$VAULT_QUERY_CACHE" ] && validate_cache "$VAULT_QUERY_CACHE"; then
  echo "Using cached vault data from $VAULT_QUERY_CACHE" >&2
  PROJECTS=$(jq '.projects' "$VAULT_QUERY_CACHE")
else
  echo "Cache miss, querying vault directly" >&2
  PROJECTS=$(OA_VAULT="$OA_VAULT" clausidian list project | jq '.')
fi

# 2. 处理项目列表（同之前逻辑）
echo "$PROJECTS" | jq -c '.[]' | while read -r project; do
  VAULT_NAME=$(echo "$project" | jq -r '.name')
  # ... sync to GitHub/Linear
done
```

### skill-orchestrator (缓存管理器)

```bash
#!/bin/bash
# 在工作流执行期间管理缓存

WORKFLOW_NAME="$1"
TIMESTAMP=$(date +%s)
CACHE_DIR="/tmp"
CACHE_FILE="$CACHE_DIR/vault_query_cache_${WORKFLOW_NAME}_${TIMESTAMP}.json"

# 执行工作流
execute_workflow() {
  local workflow_name="$1"

  # 清空环境中的旧缓存
  unset VAULT_QUERY_CACHE

  # 运行工作流（缓存在技能间传递）
  for skill in $SKILLS; do
    # 导出当前缓存（如果存在）
    [ -n "$VAULT_QUERY_CACHE" ] && export VAULT_QUERY_CACHE

    # 执行技能，接收新缓存
    VAULT_QUERY_CACHE=$($skill)

    # 验证缓存
    if validate_cache "$VAULT_QUERY_CACHE"; then
      echo "[cache] $skill produced valid vault cache" >&2
    fi
  done

  # 清理缓存
  rm -f "$CACHE_FILE"
}

execute_workflow "$WORKFLOW_NAME"
```

---

## 📊 缓存效果预期

### vault-sync-daily
```
不使用缓存 (当前):
  [1] vault-query-cache      5s  (查询 vault)
  [2] vault-progress-sync   10s  (内部再查询 vault?)
  [3] tool-ecosystem-bridge 10s
  [4] obsidian-daily-snapshot 5s
  总计: 30s

使用缓存 (新):
  [1] vault-query-cache      5s  (查询 vault) → 缓存 JSON
  [2] vault-progress-sync    8s  (使用缓存，节省 2s)
  [3] tool-ecosystem-bridge  9s  (使用缓存，节省 1s)
  [4] obsidian-daily-snapshot 4s (使用缓存，节省 1s)
  总计: 26s → 27% 时间改进？ 不对...

实际分析:
  如果 vault-progress-sync 内部也调用 vault-query-cache
  那么使用缓存能节省时间

  如果没有，那效果有限
```

### 缓存大小估计
```
JSON 文件大小: 约 50-100 KB (52 笔记)
生成时间: ~100ms
I/O 时间: ~50ms
总体额外开销: ~150ms (可接受)
```

---

## 🛡️ 安全与一致性

### 防止数据不一致
```
问题: 缓存在工作流执行期间可能过期

解决:
  1. 使用工作流级别的 TTL (5 分钟)
  2. 工作流开始时生成缓存，结束时清理
  3. 缓存文件名包含 timestamp
  4. 每次缓存创建都 hash vault 路径
```

### 并发安全
```
问题: 多个工作流同时运行，缓存冲突?

解决:
  1. 缓存文件名包含 workflow_name + timestamp
  2. 每个 skill 执行在独立的 shell ($$)
  3. 使用 atomic write (write to temp, then mv)
```

---

## 📝 实施步骤

### Step 1: 修改 vault-query-cache (现在)
```bash
# 添加 JSON 输出到 /tmp/vault_query_cache_{workflow}_{ts}.json
# 导出 VAULT_QUERY_CACHE 环境变量
```

### Step 2: 修改 vault-progress-sync (2 天内)
```bash
# 检查 VAULT_QUERY_CACHE 环境变量
# 如果存在且有效，使用缓存
# 否则直接查询
```

### Step 3: 修改 skill-orchestrator (3 天内)
```bash
# 在工作流执行期间维护 VAULT_QUERY_CACHE
# 技能间传递缓存
# 工作流结束时清理
```

### Step 4: 添加监控 (可选)
```bash
# 记录缓存命中率
# 监控缓存大小
# 定期清理过期缓存
```

---

## 🎯 验收标准

```
✅ vault-query-cache 生成有效的 JSON
✅ JSON 包含所有必要字段 (stats, projects, recent, tags)
✅ vault-progress-sync 能读取缓存 JSON
✅ 缓存命中率 > 80% (同一工作流内)
✅ 性能改进 > 5% (实际时间)
✅ 无数据一致性问题
✅ 无并发冲突
```

---

## 📊 版本升级路径

### v1.0 (当前)
- JSON 格式固定
- 5 分钟 TTL
- 单个工作流作用域

### v2.0 (可能)
- MessagePack 格式 (更小)
- 配置化 TTL
- 跨工作流共享

### v3.0 (可能)
- Redis 缓存
- 细粒度失效
- 分布式缓存

---

## 🚀 立即行动

**本周任务**:
1. 修改 vault-query-cache 生成 JSON
2. 测试 JSON 有效性
3. 修改 vault-progress-sync 读取缓存
4. 端到端测试

**预期成果**:
- ✅ vault-sync-daily 从 30s → 25-27s
- ✅ 缓存命中率 > 80%

**时间**: ~4-6 小时

---

**状态**: 🟢 Ready for Implementation
**下一步**: 修改 vault-query-cache 实现 JSON 输出
