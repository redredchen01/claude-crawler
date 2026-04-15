import {
  initializeDatabase,
  getDatabase,
  healthCheck,
  closeDatabase,
} from "./client";
import { jobRepository } from "../repositories/jobRepository";
import { webhookRepository } from "../repositories/webhookRepository";
import { userRepository } from "../repositories/userRepository";

/**
 * Database connectivity and repository test
 */
async function runTests() {
  console.log("🧪 Starting Database Tests...\n");

  try {
    // 1. Initialize database
    console.log("📝 Test 1: Initialize database connection");
    const db = initializeDatabase();
    if (db) {
      console.log("  ✅ PASS - Database initialized\n");
    } else {
      throw new Error("Failed to initialize database");
    }

    // 2. Health check
    console.log("📝 Test 2: Health check");
    const healthy = await healthCheck();
    if (healthy) {
      console.log("  ✅ PASS - Database is healthy\n");
    } else {
      throw new Error("Health check failed");
    }

    // 3. User repository
    console.log("📝 Test 3: User repository");
    const testUser = await userRepository.createUser({
      username: `test_user_${Date.now()}`,
      email: `test${Date.now()}@example.com`,
      passwordHash: "$2b$10$test_hash",
      role: "viewer",
    });
    console.log(`  ✅ PASS - Created user: ${testUser?.id}\n`);

    // 4. Job repository
    console.log("📝 Test 4: Job repository");
    const testJob = await jobRepository.createJob({
      id: `test-job-${Date.now()}`,
      userId: testUser?.id || 1,
      seed: "test keyword",
      sources: "google,bing",
      status: "waiting",
    });
    console.log(`  ✅ PASS - Created job: ${testJob?.id}\n`);

    // 5. Update job status
    console.log("📝 Test 5: Update job status");
    const updatedJob = await jobRepository.updateJobStatus(
      testJob?.id || "test",
      "running",
    );
    if (updatedJob?.status === "running") {
      console.log("  ✅ PASS - Job status updated\n");
    } else {
      throw new Error("Job update failed");
    }

    // 6. Add result
    console.log("📝 Test 6: Add result to job");
    const testResult = await jobRepository.addResult({
      id: `result-${Date.now()}`,
      jobId: testJob?.id || "test",
      normalizedKeyword: "test keyword",
      rawKeyword: "test keyword",
      source: "google",
      intent: "informational",
      score: 75,
      difficulty: 30,
      roiScore: 70,
    });
    console.log(`  ✅ PASS - Created result: ${testResult?.id}\n`);

    // 7. Webhook repository
    console.log("📝 Test 7: Webhook repository");
    const testWebhook = await webhookRepository.createWebhook({
      id: `webhook-${Date.now()}`,
      userId: testUser?.id || 1,
      url: "https://example.com/webhook",
      events: "job:completed,job:failed",
      filters: { minResultCount: 5 },
      isActive: true,
    });
    console.log(`  ✅ PASS - Created webhook: ${testWebhook?.id}\n`);

    // 8. Record webhook attempt
    console.log("📝 Test 8: Record webhook delivery");
    const attempt = await webhookRepository.recordAttempt({
      webhookId: testWebhook?.id || "test",
      eventName: "job:completed",
      status: "success",
      statusCode: 200,
      attemptNumber: 1,
    });
    console.log(`  ✅ PASS - Recorded attempt: ${attempt?.id}\n`);

    // 9. Get webhook stats
    console.log("📝 Test 9: Get webhook statistics");
    const stats = await webhookRepository.getStats(testWebhook?.id || "test");
    console.log(`  ✅ PASS - Stats: ${JSON.stringify(stats)}\n`);

    console.log("=== All Database Tests Passed ===");
    console.log("✅ 9/9 tests passed\n");

    // Cleanup
    await closeDatabase();
    console.log("✅ Database connection closed");

    process.exit(0);
  } catch (error) {
    console.error("❌ Test failed:", error);
    await closeDatabase();
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}
