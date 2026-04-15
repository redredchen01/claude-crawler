/**
 * Phase 8.2.2 分析缓存测试
 */

import AnalysisCache from "./services/analysisCache.js";

console.log("=== Phase 8.2.2 Analysis Cache Tests ===\n");

let testsPassed = 0;
let testsFailed = 0;

// 创建模拟数据库
const mockDb = {
  analyses: new Map(),
};

// ============== 测试 1: 缓存基本操作 ==============
console.log("📝 Test 1: Basic cache operations");
try {
  const cache = new AnalysisCache(mockDb);
  const jobId = "test-job-001";
  const analysisType = "difficulty_insights";
  const content = "This is test analysis content.";

  // 检查初始不存在
  if (!cache.hasCache(jobId, analysisType)) {
    console.log("  ✅ Cache miss detected");
    testsPassed++;
  } else {
    console.log("  ❌ FAIL - Cache should be empty");
    testsFailed++;
  }

  // 保存分析
  const saved = cache.saveAnalysis(jobId, analysisType, content);
  if (saved && saved.content === content) {
    console.log("  ✅ Analysis saved successfully");
    testsPassed++;
  } else {
    console.log("  ❌ FAIL - Failed to save analysis");
    testsFailed++;
  }

  // 检查缓存存在
  if (cache.hasCache(jobId, analysisType)) {
    console.log("  ✅ Cache hit detected");
    testsPassed++;
  } else {
    console.log("  ❌ FAIL - Cache should exist");
    testsFailed++;
  }

  // 获取缓存
  const cached = cache.getCache(jobId, analysisType);
  if (cached && cached.fromCache && cached.content === content) {
    console.log("  ✅ Cached analysis retrieved");
    testsPassed++;
  } else {
    console.log("  ❌ FAIL - Failed to retrieve cache");
    testsFailed++;
  }
} catch (err) {
  console.log(`  ❌ FAIL - ${err.message}`);
  testsFailed++;
}
console.log();

// Clear mockDb between tests
mockDb.analyses.clear();

// ============== 测试 2: 多个分析类型 ==============
console.log("📝 Test 2: Multiple analysis types");
try {
  const cache = new AnalysisCache(mockDb);
  const jobId = "test-job-002";
  const types = ["difficulty_insights", "roi_opportunities", "competitor_gaps"];
  const contents = {
    difficulty_insights: "Difficulty analysis content",
    roi_opportunities: "ROI analysis content",
    competitor_gaps: "Competitor analysis content",
  };

  // 保存多个分析
  for (const type of types) {
    cache.saveAnalysis(jobId, type, contents[type]);
  }

  // 验证所有分析都被保存
  const jobAnalyses = cache.getJobAnalyses(jobId);
  if (jobAnalyses.length === 3) {
    console.log(`  ✅ All 3 analysis types saved for job ${jobId}`);
    testsPassed++;
  } else {
    console.log(`  ❌ FAIL - Expected 3 analyses, got ${jobAnalyses.length}`);
    testsFailed++;
  }

  // 验证可以单独检索
  for (const type of types) {
    if (cache.hasCache(jobId, type)) {
      const cached = cache.getCache(jobId, type);
      if (cached.content === contents[type]) {
        // Individual validation passed
      } else {
        console.log(`  ❌ FAIL - Content mismatch for ${type}`);
        testsFailed++;
      }
    } else {
      console.log(`  ❌ FAIL - Cache missing for ${type}`);
      testsFailed++;
    }
  }

  console.log("  ✅ All analysis types independently accessible");
  testsPassed++;
} catch (err) {
  console.log(`  ❌ FAIL - ${err.message}`);
  testsFailed++;
}
console.log();

// Clear mockDb between tests
mockDb.analyses.clear();

// ============== 测试 3: 删除操作 ==============
console.log("📝 Test 3: Cache deletion");
try {
  const cache = new AnalysisCache(mockDb);
  const jobId = "test-job-003";

  // 保存分析
  cache.saveAnalysis(jobId, "difficulty_insights", "Content 1");
  cache.saveAnalysis(jobId, "roi_opportunities", "Content 2");

  // 删除单个
  const deleted = cache.deleteAnalysis(jobId, "difficulty_insights");
  if (deleted && !cache.hasCache(jobId, "difficulty_insights")) {
    console.log("  ✅ Single analysis deleted");
    testsPassed++;
  } else {
    console.log("  ❌ FAIL - Failed to delete");
    testsFailed++;
  }

  // 另一个应该仍然存在
  if (cache.hasCache(jobId, "roi_opportunities")) {
    console.log("  ✅ Other analyses unaffected");
    testsPassed++;
  } else {
    console.log("  ❌ FAIL - Other analyses affected");
    testsFailed++;
  }

  // 删除所有任务分析
  cache.saveAnalysis(jobId, "difficulty_insights", "Content 1");
  const deletedCount = cache.deleteJobAnalyses(jobId);
  if (deletedCount === 2 && cache.getJobAnalyses(jobId).length === 0) {
    console.log("  ✅ All job analyses deleted");
    testsPassed++;
  } else {
    console.log(`  ❌ FAIL - Deletion count: ${deletedCount}`);
    testsFailed++;
  }
} catch (err) {
  console.log(`  ❌ FAIL - ${err.message}`);
  testsFailed++;
}
console.log();

// Clear mockDb between tests
mockDb.analyses.clear();

// ============== 测试 4: 统计功能 ==============
console.log("📝 Test 4: Statistics tracking");
try {
  const cache = new AnalysisCache(mockDb);

  // 保存多个分析
  cache.saveAnalysis("job-a", "difficulty_insights", "Short content");
  cache.saveAnalysis(
    "job-b",
    "roi_opportunities",
    "Much longer content with more details",
  );
  cache.saveAnalysis("job-c", "competitor_gaps", "Medium length content");

  const stats = cache.getStats();

  if (
    stats.totalAnalyses === 3 &&
    stats.totalSize > 0 &&
    stats.totalTokens > 0
  ) {
    console.log(
      `  ✅ Stats: ${stats.totalAnalyses} analyses, ${stats.totalSize}B, ~${stats.totalTokens} tokens`,
    );
    testsPassed++;
  } else {
    console.log("  ❌ FAIL - Stats calculation error");
    testsFailed++;
  }

  if (Object.keys(stats.byType).length === 3) {
    console.log("  ✅ All 3 types tracked in stats");
    testsPassed++;
  } else {
    console.log("  ❌ FAIL - Type tracking incomplete");
    testsFailed++;
  }
} catch (err) {
  console.log(`  ❌ FAIL - ${err.message}`);
  testsFailed++;
}
console.log();

// Clear mockDb between tests
mockDb.analyses.clear();

// ============== 测试 5: 缓存年龄计算 ==============
console.log("📝 Test 5: Cache age tracking");
try {
  const cache = new AnalysisCache(mockDb);
  const jobId = "test-job-005";

  cache.saveAnalysis(jobId, "difficulty_insights", "Content");
  const cached = cache.getCache(jobId, "difficulty_insights");

  if (
    cached.cacheAge !== undefined &&
    cached.cacheAge >= 0 &&
    cached.cacheAge < 100
  ) {
    console.log(`  ✅ Cache age: ${cached.cacheAge}ms`);
    testsPassed++;
  } else {
    console.log("  ❌ FAIL - Cache age tracking failed");
    testsFailed++;
  }
} catch (err) {
  console.log(`  ❌ FAIL - ${err.message}`);
  testsFailed++;
}
console.log();

// Clear mockDb between tests
mockDb.analyses.clear();

// ============== 测试 6: 清空缓存 ==============
console.log("📝 Test 6: Clear all cache");
try {
  const cache = new AnalysisCache(mockDb);

  // 保存多个分析
  cache.saveAnalysis("job-1", "type-1", "Content 1");
  cache.saveAnalysis("job-2", "type-2", "Content 2");
  cache.saveAnalysis("job-3", "type-3", "Content 3");

  const countBefore = mockDb.analyses.size;
  const cleared = cache.clear();

  if (cleared === countBefore && mockDb.analyses.size === 0) {
    console.log(`  ✅ Cleared ${cleared} analyses, cache empty`);
    testsPassed++;
  } else {
    console.log(`  ❌ FAIL - Clear failed: ${cleared} vs ${countBefore}`);
    testsFailed++;
  }
} catch (err) {
  console.log(`  ❌ FAIL - ${err.message}`);
  testsFailed++;
}
console.log();

// ============== 测试总结 ==============
console.log("=== Test Summary ===");
console.log(`✅ Passed: ${testsPassed}`);
console.log(`❌ Failed: ${testsFailed}`);
console.log(`Total: ${testsPassed + testsFailed}`);
console.log();

if (testsFailed === 0) {
  console.log("🎉 All Phase 8.2.2 tests passed!");
  process.exit(0);
} else {
  console.log(
    `⚠️  ${testsFailed} test(s) failed. Please review the implementation.`,
  );
  process.exit(1);
}
