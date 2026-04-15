/**
 * Phase 8.1.2 事件系统测试
 */

import eventBus from "./services/eventBus.js";
import JobStatusWatcher from "./services/jobStatusWatcher.js";

console.log("=== Phase 8.1.2 Event System Tests ===\n");

let testsPassed = 0;
let testsFailed = 0;

// ============== 测试 1: EventBus 基础功能 ==============
console.log("📝 Test 1: EventBus on/off/emit");
try {
  let callCount = 0;
  const callback = (data) => {
    callCount++;
  };

  eventBus.on("test:event", callback);
  eventBus.emit("test:event", { message: "test" });

  if (callCount === 1) {
    console.log("  ✅ PASS - Event emitted and callback executed");
    testsPassed++;
  } else {
    console.log(`  ❌ FAIL - Expected 1 call, got ${callCount}`);
    testsFailed++;
  }

  // 取消订阅
  eventBus.off("test:event", callback);
  eventBus.emit("test:event", { message: "test2" });

  if (callCount === 1) {
    console.log("  ✅ PASS - Listener removed successfully");
    testsPassed++;
  } else {
    console.log(`  ❌ FAIL - Expected no additional calls, got ${callCount}`);
    testsFailed++;
  }
} catch (err) {
  console.log(`  ❌ FAIL - ${err.message}`);
  testsFailed++;
}
console.log();

// ============== 测试 2: EventBus 链式调用 ==============
console.log("📝 Test 2: EventBus chaining");
try {
  let eventCount = 0;
  const multiCallback = () => {
    eventCount++;
  };

  eventBus
    .on("chain:test1", multiCallback)
    .on("chain:test2", multiCallback)
    .emit("chain:test1")
    .emit("chain:test2");

  if (eventCount === 2) {
    console.log("  ✅ PASS - Chain operations work correctly");
    testsPassed++;
  } else {
    console.log(`  ❌ FAIL - Expected 2 events, got ${eventCount}`);
    testsFailed++;
  }
} catch (err) {
  console.log(`  ❌ FAIL - ${err.message}`);
  testsFailed++;
}
console.log();

// ============== 测试 3: EventBus once 方法 ==============
console.log("📝 Test 3: EventBus once");
try {
  let onceCount = 0;
  const onceCallback = () => {
    onceCount++;
  };

  eventBus.once("once:event", onceCallback);
  eventBus.emit("once:event");
  eventBus.emit("once:event");

  if (onceCount === 1) {
    console.log("  ✅ PASS - Once listener fires only once");
    testsPassed++;
  } else {
    console.log(`  ❌ FAIL - Expected 1 call, got ${onceCount}`);
    testsFailed++;
  }
} catch (err) {
  console.log(`  ❌ FAIL - ${err.message}`);
  testsFailed++;
}
console.log();

// ============== 测试 4: JobStatusWatcher 状态变化检测 ==============
console.log("📝 Test 4: JobStatusWatcher state change detection");
try {
  const mockDb = {
    jobs: new Map([
      [
        "job-test-001",
        {
          id: "job-test-001",
          seed: "test",
          status: "waiting",
          created_at: Date.now(),
          finished_at: null,
          result_count: 0,
        },
      ],
    ]),
  };

  const watcher = new JobStatusWatcher(mockDb, eventBus);

  // 第一次 poll - 初始化（设置 previousStates）
  watcher.poll();

  let statusChangeEvent = null;

  eventBus.once("job:status_changed", (data) => {
    statusChangeEvent = data;
  });

  // 改变状态
  mockDb.jobs.get("job-test-001").status = "running";

  // 第二次 poll - 检测变化
  watcher.poll();

  if (statusChangeEvent && statusChangeEvent.newStatus === "running") {
    console.log("  ✅ PASS - Status change detected and event emitted");
    testsPassed++;
  } else {
    console.log("  ❌ FAIL - Status change event not emitted");
    testsFailed++;
  }
} catch (err) {
  console.log(`  ❌ FAIL - ${err.message}`);
  testsFailed++;
}
console.log();

// ============== 测试 5: JobStatusWatcher 多个任务 ==============
console.log("📝 Test 5: JobStatusWatcher multiple jobs");
try {
  const mockDb = {
    jobs: new Map([
      [
        "job-a",
        {
          id: "job-a",
          seed: "a",
          status: "waiting",
          created_at: Date.now(),
          finished_at: null,
          result_count: 0,
        },
      ],
      [
        "job-b",
        {
          id: "job-b",
          seed: "b",
          status: "running",
          created_at: Date.now(),
          finished_at: null,
          result_count: 5,
        },
      ],
    ]),
  };

  const watcher = new JobStatusWatcher(mockDb, eventBus);
  let eventCount = 0;

  eventBus.on("job:status_changed", () => {
    eventCount++;
  });

  // 初始 poll
  watcher.poll();
  const initialCount = eventCount;

  // 改变两个任务的状态
  mockDb.jobs.get("job-a").status = "running";
  mockDb.jobs.get("job-b").status = "completed";

  // 轮询检测
  watcher.poll();

  if (eventCount === initialCount + 2) {
    console.log(
      `  ✅ PASS - Multiple job changes detected (${eventCount} total events)`,
    );
    testsPassed++;
  } else {
    console.log(
      `  ❌ FAIL - Expected ${initialCount + 2} events, got ${eventCount}`,
    );
    testsFailed++;
  }
} catch (err) {
  console.log(`  ❌ FAIL - ${err.message}`);
  testsFailed++;
}
console.log();

// ============== 测试 6: 事件数据准确性 ==============
console.log("📝 Test 6: Event payload correctness");
try {
  const mockDb = {
    jobs: new Map([
      [
        "job-payload-test",
        {
          id: "job-payload-test",
          seed: "test keyword",
          status: "waiting",
          created_at: 1234567890,
          finished_at: null,
          result_count: 0,
        },
      ],
    ]),
  };

  const watcher = new JobStatusWatcher(mockDb, eventBus);

  // 初始化 previousStates
  watcher.poll();

  let receivedEvent = null;

  eventBus.once("job:status_changed", (data) => {
    receivedEvent = data;
  });

  mockDb.jobs.get("job-payload-test").status = "running";
  watcher.poll();

  const hasAllFields =
    receivedEvent &&
    receivedEvent.jobId === "job-payload-test" &&
    receivedEvent.oldStatus === "waiting" &&
    receivedEvent.newStatus === "running" &&
    receivedEvent.resultCount === 0 &&
    receivedEvent.timestamp;

  if (hasAllFields) {
    console.log("  ✅ PASS - Event payload contains all required fields");
    testsPassed++;
  } else {
    console.log(
      `  ❌ FAIL - Event payload incomplete: ${JSON.stringify(receivedEvent)}`,
    );
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
  console.log("🎉 All Phase 8.1.2 tests passed!");
  process.exit(0);
} else {
  console.log(
    `⚠️  ${testsFailed} test(s) failed. Please review the implementation.`,
  );
  process.exit(1);
}
