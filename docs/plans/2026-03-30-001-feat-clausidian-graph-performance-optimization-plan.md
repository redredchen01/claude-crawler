---
title: feat: Clausidian 图谱重建性能全面优化
type: feat
status: completed
date: 2026-03-30
origin: null
---

# Clausidian 图谱重建性能全面优化

## Overview

Clausidian 的索引系统采用了合理的 TF-IDF 加权和缓存策略，但在大型 vault（>10K 笔记）上性能严重下降。重建图谱的二次对评分算法复杂度为 O(N²×(T²+W²))，导致 10K 笔记的 vault 需要 20-60 秒。本方案通过 4 大优化维度解决此问题：

1. **算法优化** — 提取共享相似度函数，缓存 TF-IDF 权重，并行计算
2. **缓存策略** — 增量图谱更新，跟踪变化笔记，细粒度失效
3. **并行处理** — Worker 线程池计算无关系对相似度
4. **持久化缓存** — 磁盘缓存搜索结果和图谱数据，冷启动优化（Theme C）

**预期收益**：
- 1K-2K 笔记：50-100ms （当前 200-500ms）
- 10K 笔记：1-3s （当前 20-60s）
- 缓存命中时冷启动：100-300ms （当前 500ms+）

---

## Problem Frame

### 当前瓶颈

**rebuildGraph 的五阶段分析**：

| 阶段 | 复杂度 | 1K 笔记 | 10K 笔记 | 主要操作 |
|------|--------|--------|---------|---------|
| 1. 已有关系映射 | O(N+R) | 2ms | 10ms | related 字段扫描 |
| 2. TF-IDF 权重计算 | O(N*T) | 5ms | 50ms | Math.log 计算 |
| 3. 关键词集合 | O(N*B) | 50-200ms | 500ms-2s | body 完整加载 + 正则 |
| 4. 无关系对评分 ⚠️ | O(N²*(T²+W²)) | 200-500ms | 20-60s | **关键瓶颈** |
| 5. 聚类检测 | O(N*α(N)) | <1ms | <5ms | Union-Find |

**关键问题**：
- 第 4 阶段占总时间 80-90%
- 无增量更新：即使只修改 1 个笔记也重建整个图
- 代码重复：同样的相似度算法在 3 个地方实现
- 缓存粗糙：全局失效，无细粒度跟踪

### 使用场景

- **Watch 命令**：文件变化触发完整 sync()，即使只改了 1 个笔记
- **Batch 操作**：修改多个笔记后重建图谱，当前需要 10-60s
- **MCP 会话**：5+ 分钟长会话，首次搜索/图谱生成导致 500ms+ 延迟

---

## Requirements Trace

- **R1** 算法优化：提取共享相似度函数，消除代码重复
- **R2** 缓存优化：实现增量更新，只处理变化的笔记对
- **R3** 并行计算：使用 Worker 池并发评分无关系对（可选 0-threads 禁用）
- **R4** 性能测试：添加基准测试，监控 1K/10K 场景下的性能回归
- **R5** 持久化缓存：磁盘缓存搜索结果和图谱数据（v3.1.0 Theme C）
- **R6** 监控指标：记录同步时间、缓存命中率、增量更新率

---

## Scope Boundaries

**包含在本方案内**：
- 核心索引管理的性能优化（rebuildGraph、相似度计算）
- 增量更新框架和缓存策略
- Worker 线程池实现（可选）
- 性能基准测试和监控
- Theme C 持久化缓存设计与实现

**不包含（延后）**：
- 多 vault 管理的性能优化
- 分布式 vault 同步
- GPU 加速（over-engineered）
- 插件系统的性能优化

---

## Context & Research

### Relevant Code and Patterns

**性能关键路径**：
- `src/index-manager.mjs` (42-195 行) — rebuildGraph 核心逻辑
- `src/vault.mjs` (13-31, 92-102, 237-277 行) — 缓存和相关笔记查询
- `src/commands/link.mjs` (11-85 行) — 链接建议算法（重复实现）
- `src/commands/watch.mjs` (14-69 行) — Watch 增量检测（但全量重建）

**已有缓存机制**：
- 双层缓存：`_notesCache`（轻量） vs `_notesCacheWithBody`（完整）
- 全局失效：任何写入触发 `invalidateCache()`
- 命中时性能优秀：<1ms

**性能测试框架**：
- `test/commands.test.mjs` 有功能测试，但无性能基准
- Watch 命令的 debounce（500ms）很聪慧但仍全量重建

### Institutional Learnings

1. **v3.0.0 性能优化经验**（git history）：
   - 邻居图遍历从 O(n²) 优化到 O(edges)，快 40%（0c75d26）
   - 缓存键生成优化（Buffer 到字符串拼接，v3.0.1）
   - 经验：预计算反向索引避免重复扫描

2. **Union-Find 最佳实践**：
   - 使用路径压缩，复杂度接近 O(1)
   - Clausidian 的聚类检测实现已经最优

3. **TF-IDF 权重合理性**：
   - 稀有标签得更高权重（log(N/df)），符合信息检索最佳实践
   - 建议数量限制为 25，避免信息过载

### External References

- Node.js Worker Threads：官方文档支持线程池，适合 CPU 密集型任务
- Incremental Indexing 模式：git/Lucene 的增量索引设计
- 缓存失效策略：选择性失效（Selective Invalidation）比全局失效更高效

---

## Key Technical Decisions

1. **增量更新采用变更跟踪** 而非 watch-only 方案
   - **Rationale**：Watch 虽然检测增量，但最后仍调用 `idx.sync()` 全量重建。需要真正的 delta 机制：维护 dirty set，只对变化的笔记重新评分。

2. **相似度计算采用共享函数 + 缓存** 而非三处重复
   - **Rationale**：当前相似度算法在 index-manager、link、vault 三处重复实现。提取到 `similarity-engine.mjs`，支持缓存 TF-IDF 权重，减少重复计算。

3. **并行计算采用可选 Worker 池** 而非强制多线程
   - **Rationale**：Worker 有启动成本（~5ms），小型 vault 不划算。添加 `--threads N` 参数，0 表示禁用（默认 4）。

4. **持久化缓存采用双层策略**：内存 + 磁盘
   - **Rationale**：搜索缓存 TTL 5 分钟足够 MCP 会话，但冷启动时磁盘缓存消除 500ms 延迟。Vault 版本变化时自动清除过期缓存。

5. **增量更新细粒度** 到笔记级别而非标签级别
   - **Rationale**：笔记级粒度简单，实现成本低。标签级会增加复杂度（标签重组时需要全量重新评分）。

---

## Open Questions

### Resolved During Planning

- **Q: Worker 线程何时启用？**
  - A: 仅当 --threads > 0 且笔记对数 > 1000 时启用。小型 vault 单线程更快。

- **Q: 增量更新如何处理标签变化？**
  - A: 笔记标签变化时，标记该笔记及其所有相关笔记为 dirty，重新评分涉及的对。

- **Q: 缓存键如何设计以避免碰撞？**
  - A: `${vaultRoot}:${noteFile}:${contentHash}` 组合，使用 xxHash 加速。

### Deferred to Implementation

- **Worker 线程池的最优数量**：需要在实现中通过基准测试确定
- **磁盘缓存的存储格式**：JSON vs 二进制，需要与 Theme C 协调
- **增量更新的触发条件**：是否跟踪 file mtime 或使用内容哈希

---

## High-Level Technical Design

> *这是实现方向的架构示意，非实现规范。实现者应将其作为上下文参考。*

### 系统架构流

```
┌─────────────────────────────────────────────────────────┐
│ Watch / Batch / 手动调用 rebuildGraph()                │
└──────────────────────┬──────────────────────────────────┘
                       ↓
        ┌──────────────────────────────┐
        │  变更检测 (Dirty Tracking)    │
        │  - 追踪修改的笔记             │
        │  - 触发增量更新标志          │
        └──────────────────┬───────────┘
                           ↓
        ┌──────────────────────────────┐
        │  缓存一致性检查               │
        │  - 验证缓存 TF-IDF 有效性     │
        │  - vault 版本校验            │
        └──────────────────┬───────────┘
                           ↓
        ┌──────────────────────────────┐
        │  相似度计算 (SimilarityEngine)│
        │  ┌──────────────────────┐    │
        │  │ 单线程 (threads=0)   │    │
        │  │ O(N²) 顺序评分       │    │
        │  └──────────────────────┘    │
        │  ┌──────────────────────┐    │
        │  │ 多线程 (threads>0)   │    │
        │  │ Worker 池并发分块    │    │
        │  └──────────────────────┘    │
        └──────────────────┬───────────┘
                           ↓
        ┌──────────────────────────────┐
        │  增量更新 (Incremental Merge)│
        │  - 合并新的关系             │
        │  - 清理过期建议             │
        └──────────────────┬───────────┘
                           ↓
        ┌──────────────────────────────┐
        │  聚类检测 (Union-Find)        │
        │  - 发现连通分量             │
        └──────────────────┬───────────┘
                           ↓
        ┌──────────────────────────────┐
        │  持久化与缓存更新            │
        │  - 更新 _graph.md            │
        │  - 磁盘缓存 (async)          │
        │  - 性能指标记录             │
        └──────────────────────────────┘
```

### 相似度引擎接口

```javascript
// src/similarity-engine.mjs (新建)
class SimilarityEngine {
  constructor(vault, options = {}) {
    this.vault = vault;
    this.threads = options.threads ?? 4;
    this.includeBody = options.includeBody ?? false;

    // 缓存 TF-IDF 权重
    this.tfidfCache = null;
    this.tfidfVersion = null;
  }

  // 计算成对相似度（支持单线程和多线程）
  async scorePairs(notes, options = {}) {
    // options: { minScore, maxResults, incremental, dirtySet }
    // 返回: { relationships, suggested, stats }
  }

  // 缓存 TF-IDF 权重（一次计算多次使用）
  getTFIDF(notes) {
    // 检查缓存版本，无效则重新计算
    // 缓存键: vaultRoot + contentHash
  }

  // Worker 线程池管理
  #ensureWorkerPool() { ... }
  #terminateWorkerPool() { ... }
}
```

### 增量更新追踪

```javascript
// src/incremental-tracker.mjs (新建)
class IncrementalTracker {
  constructor(vault) {
    this.vault = vault;
    this.dirtyNotes = new Set();  // 变化的笔记
    this.lastGraphUpdate = null;   // 上次更新时间戳
  }

  markDirty(noteFile) {
    this.dirtyNotes.add(noteFile);
  }

  shouldRebuild() {
    // 判断是否需要增量更新
    return this.dirtyNotes.size > 0;
  }

  getDirtySet() {
    // 返回变化的笔记及其所有相关笔记
    return expandRelated(this.dirtyNotes);
  }

  clear() {
    this.dirtyNotes.clear();
    this.lastGraphUpdate = Date.now();
  }
}
```

---

## Implementation Units

- [ ] **Unit 1: 提取共享相似度计算函数**

**Goal：** 消除代码重复，创建可复用的相似度引擎

**Requirements：** R1（算法优化）

**Dependencies：** 无

**Files：**
- Create: `src/similarity-engine.mjs`
- Modify: `src/index-manager.mjs`（使用 SimilarityEngine）
- Modify: `src/commands/link.mjs`（使用 SimilarityEngine）
- Modify: `src/vault.mjs` findRelated()（使用 SimilarityEngine）
- Test: `test/similarity-engine.test.mjs`

**Approach：**
- 提取第 2-4 阶段（TF-IDF、关键词、评分对）到 `SimilarityEngine` 类
- 支持参数化：includeBody、minScore、maxResults
- 保持 API 向后兼容（rebuildGraph 调用不变）
- 在三个调用点替换为 engine 方法

**Patterns to follow：**
- 参考 vault.mjs 的双缓存模式
- 参考 link.mjs 的 TF-IDF 实现（已验证）

**Test scenarios：**
- Happy path：给定 10 个笔记，返回相似对评分正确（验证 TF-IDF 权重）
- Edge case：无标签笔记处理、孤立笔记、完全重复标签
- Edge case：body 为空时的关键词计算
- Edge case：笔记对已有关系时跳过
- Integration：rebuildGraph、link 命令、findRelated 都返回相同的相似度排序

**Verification：**
- 所有现有测试通过（无回归）
- 新建相似度函数的返回值与原有三处实现结果一致
- 代码重复度下降（link.mjs 行数减少 >30）

---

- [ ] **Unit 2: 实现增量更新追踪机制**

**Goal：** 支持变更跟踪，避免全量重建

**Requirements：** R2（缓存优化）

**Dependencies：** Unit 1

**Files：**
- Create: `src/incremental-tracker.mjs`
- Modify: `src/vault.mjs` write() 方法（调用 markDirty）
- Modify: `src/index-manager.mjs` rebuildGraph()（支持 incremental 参数）
- Modify: `src/commands/watch.mjs`（使用增量追踪）
- Test: `test/incremental-tracker.test.mjs`

**Approach：**
- 创建 `IncrementalTracker` 类，追踪 dirty notes
- 在 `vault.write()` 时调用 `markDirty(noteFile)`
- `rebuildGraph()` 接收 `{ incremental: true }` 参数，只评分变化的笔记对
- Watch 命令使用追踪器，避免不必要的全量重建

**Patterns to follow：**
- 参考 watch.mjs 的文件变化检测机制
- 参考 git 的增量索引设计

**Test scenarios：**
- Happy path：修改 1 个笔记，dirty set 包含该笔记及其所有相关笔记
- Happy path：修改 5 个笔记，增量更新时间 <100ms（1K 笔记）
- Edge case：标签变化时，所有共享该标签的笔记标记为 dirty
- Edge case：首次运行（无上次状态），fallback 到全量更新
- Integration：Watch 命令触发修改，增量更新成功，图谱一致

**Verification：**
- 增量更新时间相比全量更新快 >5 倍（10 个笔记变化）
- Dirty set 计算正确（覆盖直接相关和标签相关）
- 最终图谱与全量重建结果一致

---

- [ ] **Unit 3: 添加性能基准测试框架**

**Goal：** 建立性能监控，防止回归

**Requirements：** R4（性能测试）、R6（监控指标）

**Dependencies：** Unit 1, Unit 2

**Files：**
- Create: `test/performance.test.mjs`
- Create: `test/fixtures/large-vault/` （1K + 10K 笔记测试数据）
- Modify: `package.json`（添加 `npm run test:perf` 脚本）
- Modify: `ARCHITECTURE.md`（性能特性文档）

**Approach：**
- 创建合成 vault 数据：1K 笔记（快速反馈）和 10K 笔记（压力测试）
- 编写基准测试：rebuildGraph、search、scan 等
- 记录时间戳、缓存命中率、增量更新率
- CI 中运行性能测试（可选告警）

**Patterns to follow：**
- Node.js `console.time()` 测量执行时间
- 参考 obsidian-agent 的大型数据集测试

**Test scenarios：**
- Baseline：1K 笔记的 rebuildGraph 耗时 <200ms
- Baseline：10K 笔记的 rebuildGraph 耗时 <5s（未优化）
- Regression：缓存命中时 <10ms
- Regression：增量更新 10 笔变化 <100ms
- Stress：100K 笔记能启动（不一定快）

**Verification：**
- 基准测试运行通过，建立性能基线
- 后续 PR 中可对比性能差异
- 大型 vault 测试数据生成正确

---

- [ ] **Unit 4: 实现 Worker 线程池（可选并行计算）**

**Goal：** 支持多线程加速无关系对评分

**Requirements：** R3（并行处理）

**Dependencies：** Unit 1, Unit 2

**Files：**
- Create: `src/worker-pool.mjs`
- Modify: `src/similarity-engine.mjs`（集成 worker 池）
- Modify: `src/commands/graph.mjs`（添加 `--threads` 参数）
- Test: `test/worker-pool.test.mjs`

**Approach：**
- 实现 `WorkerPool` 类，管理 N 个 Worker 线程
- 在 SimilarityEngine 中，将无关系对分块分配给 workers
- 支持 `--threads N` 参数（0 禁用，默认 4）
- 自动选择：笔记对 <1000 时单线程，>1000 时多线程

**Execution note：** 实现应该采用增量优化——先完成单线程版本，再添加可选的 Worker 支持

**Patterns to follow：**
- Node.js Worker Threads 官方文档
- 参考 obsidian-agent 的并行处理模式

**Test scenarios：**
- Happy path：threads=4，10K 笔记评分快 3-4 倍
- Happy path：threads=0，单线程执行一致
- Edge case：threads>CPU 数量时降级到 CPU 数
- Edge case：小型 vault（<1K 笔记）使用单线程
- Integration：Worker 错误处理和超时管理

**Verification：**
- 多线程版本相比单线程快 2-4 倍（10K 笔记）
- 启用和禁用 Worker 的结果一致
- 不引入内存泄漏（Worker 资源正确释放）

---

- [ ] **Unit 5: 优化 body 加载策略**

**Goal：** 减少内存压力和 I/O 开销

**Requirements：** R2（缓存优化）

**Dependencies：** Unit 1

**Files：**
- Modify: `src/similarity-engine.mjs` getTFIDF() / scorePairs()
- Modify: `src/index-manager.mjs` rebuildGraph()（支持 bodyLimit 参数）
- Test: 性能测试（Unit 3 的一部分）

**Approach：**
- 默认截断 body 到 500 字符（与 link.mjs 一致）
- 添加 `includeBody` 参数：false（默认）/ true（完整）/ number（字符限制）
- 关键词计算使用截断 body，避免大文件全量加载
- 文档化何时使用完整 body（仅高精度场景）

**Patterns to follow：**
- 参考 link.mjs 的 body 截断策略（已验证）

**Test scenarios：**
- Happy path：body 截断到 500 字符不影响相似度排序
- Edge case：无 body 或 body <500 字符的笔记处理
- Integration：includeBody=true 时覆盖默认截断

**Verification：**
- 大型 vault（>10K 笔记）内存占用 <500MB
- Body 截断不改变排序结果（验证精度）

---

- [ ] **Unit 6: 实现持久化缓存（Theme C）**

**Goal：** 优化 MCP 冷启动性能

**Requirements：** R5（持久化缓存）

**Dependencies：** Unit 1, Unit 2

**Files：**
- Create: `src/persistent-cache.mjs`
- Modify: `src/search-cache.mjs`（添加磁盘存储）
- Modify: `src/commands/cache.mjs`（新建或扩展）
- Modify: `src/index-manager.mjs`（缓存图谱数据）
- Test: `test/persistent-cache.test.mjs`

**Approach：**
- 缓存位置：`<vault>/.clausidian/cache.json`
- 缓存内容：搜索结果 + 图谱数据 + 元数据（vault 版本、时间戳）
- 写入策略：异步 write-through（不阻塞）
- 读取策略：进程启动时加载，验证有效性
- 失效策略：vault 变更时自动清除（与 SelectiveInvalidation 协作）
- CLI 命令：`clausidian cache stats` / `cache clear`

**Patterns to follow：**
- 参考 vault.mjs 的缓存版本管理
- 参考 watch.mjs 的文件变化检测

**Test scenarios：**
- Happy path：缓存存活跨进程重启（MCP 会话）
- Happy path：缓存失效时自动重建
- Edge case：损坏的缓存文件自动清除
- Edge case：vault 版本变化时缓存清除
- Integration：Theme C 的缓存统计命令正常运作

**Verification：**
- MCP 冷启动延迟从 500ms+ 降低到 100-200ms
- 缓存命中率 >80%（MCP 5 分钟会话）
- 缓存文件大小 <10MB

---

- [ ] **Unit 7: 性能指标记录与监控**

**Goal：** 建立可观测性，支持性能调优

**Requirements：** R6（监控指标）

**Dependencies：** Unit 2, Unit 3

**Files：**
- Create: `src/performance-monitor.mjs`
- Modify: `src/index-manager.mjs`（集成监控）
- Modify: `ARCHITECTURE.md`（性能特性文档）

**Approach：**
- 记录关键操作的耗时：rebuildGraph 各阶段、worker 池调度、缓存命中率
- 导出指标格式：JSON（可作为 CI 输入）
- 可选打印到日志（debug 模式）
- 累计统计：同步次数、增量更新率、缓存命中率趋势

**Patterns to follow：**
- 参考 obsidian-agent 的性能日志

**Test scenarios：**
- Happy path：性能指标正确记录
- Integration：性能测试能读取指标进行断言

**Verification：**
- 性能指标精度 ±10%
- 无明显的监控开销（<1%）

---

- [ ] **Unit 8: 集成测试与文档同步**

**Goal：** 验证全链路性能优化，更新用户文档

**Requirements：** R4, R6（测试和监控）

**Dependencies：** Unit 1-7

**Files：**
- Modify: `README.md`（性能建议章节）
- Modify: `ARCHITECTURE.md`（复杂度分析、缓存策略）
- Modify: `CHANGELOG.md`（v3.1.0 性能优化内容）
- Test: 集成测试覆盖所有优化路径

**Approach：**
- 编写集成测试：watch + batch + 手动 rebuildGraph
- 验证最终图谱的一致性和性能
- 更新文档：推荐参数、性能特征、调优指南
- 性能建议：何时启用 Worker、body 完整加载等

**Test scenarios：**
- Integration：watch 命令 + batch 修改 + 缓存 = 最终图谱一致
- Integration：增量更新与全量重建结果相同
- Integration：Worker 池和单线程结果相同

**Verification：**
- 所有 4 个优化维度在集成测试中验证
- 文档反映实际性能特征
- 最终性能指标达到预期（1K <200ms，10K <5s）

---

## System-Wide Impact

### 交互图谱
- **vault.write()** → 调用 tracker.markDirty()
- **rebuildGraph()** → 使用 SimilarityEngine，支持 incremental
- **watch 命令** → 使用 tracker，避免全量重建
- **MCP 会话** → 从磁盘缓存加载，冷启动快

### 失败传播
- 增量更新失败 → fallback 到全量重建，保证正确性
- Worker 线程失败 → 单线程重试，不中断
- 磁盘缓存失败 → 正常运行，缓存清除，下次重建

### 状态生命周期风险
- **缓存一致性**：vault 版本变化时缓存清除
- **Dirty set 泄漏**：markDirty 过多导致假增量，定期全量验证
- **Worker 资源泄漏**：确保 worker 池在异常时正确释放

### API 兼容性
- rebuildGraph() 签名不变，新增可选参数 `{ incremental, threads, includeBody }`
- 向后兼容：旧代码不传参仍正常运作
- 性能改进透明（缓存自动）

### 集成覆盖
- watch 增量检测与 rebuildGraph 增量更新
- batch 操作与自动缓存失效
- MCP 会话与磁盘缓存加载

### 不变量
- _graph.md 格式不变（markdown 表格 + 聚类）
- related 字段语义不变
- 链接建议排序逻辑不变（仍基于 TF-IDF）

---

## Risks & Dependencies

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| Worker 线程内存泄漏 | 中 | 长连接 MCP 内存溢出 | 单元测试 + 5 分钟会话限制 |
| 缓存不一致（磁盘版本过旧） | 低 | 建议链接过期 | vault 版本哈希校验 + TTL |
| 增量更新遗漏关系 | 低 | 图谱缺失链接 | 定期全量验证 + 测试覆盖 |
| 相似度引擎性能倒退 | 中 | 缓存不起作用 | 性能基准测试 + 每个 PR 对比 |
| 大型 vault 启动慢（磁盘 I/O） | 低 | 缓存加载时间 >1s | 异步加载 + 后台预热 |

---

## Documentation / Operational Notes

- **性能调优指南**：文档化 --threads、includeBody 参数及推荐值
- **监控告警**：Performance test CI 中设置基线，超过 1.5 倍基线时告警
- **缓存清除指令**：`clausidian cache clear` 命令使用说明
- **v3.1.0 发布说明**：包含性能改进对比（1K/10K 场景）
- **已知限制**：Worker 池不支持 Windows 沙箱模式（文档说明）

---

## Sources & References

- Origin document: 无（全新规划）
- Related code: `/Users/dex/YD 2026/projects/tools/clausidian/src/`
- Performance analysis: 详见 深度性能分析报告（本文上文）
- Roadmap: v3.1.0 Theme C（持久化缓存）已设计，本方案实现
- External: Node.js Worker Threads 官方文档
