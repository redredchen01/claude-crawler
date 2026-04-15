#!/usr/bin/env node

/**
 * Load Testing Script for Prompt Optimizer API
 *
 * Usage:
 *   node load-test.js
 *
 * Measures:
 * - API response times
 * - Concurrent request handling
 * - Error rates under load
 * - Memory usage
 */

const http = require("http");
const https = require("https");

// Configuration
const CONFIG = {
  baseUrl: "http://localhost:3000",
  endpoints: [
    { method: "POST", path: "/api/score", name: "Score API" },
    {
      method: "POST",
      path: "/api/optimize-full",
      name: "Optimize Full API",
    },
    { method: "GET", path: "/api/demo", name: "Demo API" },
  ],
  concurrency: 5, // Number of concurrent requests
  duration: 30, // Duration in seconds
  warmupDuration: 5, // Warmup time in seconds
};

// Test data
const demoPayload = JSON.stringify({
  raw_prompt: "Write code to process data",
});

// Metrics collection
class Metrics {
  constructor() {
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.responseTimes = [];
    this.errors = [];
    this.startTime = Date.now();
  }

  recordRequest(time, success, error = null) {
    this.totalRequests++;
    if (success) {
      this.successfulRequests++;
      this.responseTimes.push(time);
    } else {
      this.failedRequests++;
      if (error) this.errors.push(error);
    }
  }

  getStats() {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const responseTimes = this.responseTimes.sort((a, b) => a - b);
    const p50 = responseTimes[Math.floor(responseTimes.length * 0.5)];
    const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)];
    const p99 = responseTimes[Math.floor(responseTimes.length * 0.99)];
    const avg =
      this.responseTimes.reduce((a, b) => a + b, 0) /
      (this.responseTimes.length || 1);
    const min = Math.min(...this.responseTimes, Infinity);
    const max = Math.max(...this.responseTimes, -Infinity);
    const rps = this.totalRequests / elapsed;

    return {
      duration: elapsed.toFixed(2),
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      successRate: (
        (this.successfulRequests / this.totalRequests) *
        100
      ).toFixed(2),
      requestsPerSecond: rps.toFixed(2),
      avgResponseTime: avg.toFixed(2),
      minResponseTime: min === Infinity ? "N/A" : min.toFixed(2),
      maxResponseTime: max === -Infinity ? "N/A" : max.toFixed(2),
      p50ResponseTime: p50?.toFixed(2) || "N/A",
      p95ResponseTime: p95?.toFixed(2) || "N/A",
      p99ResponseTime: p99?.toFixed(2) || "N/A",
      errors: this.errors,
    };
  }
}

// HTTP request helper
function makeRequest(url, method, body = null, onResponse) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const protocol = url.startsWith("https") ? https : http;
    const urlObj = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "LoadTestClient/1.0",
      },
    };

    if (body) {
      options.headers["Content-Length"] = Buffer.byteLength(body);
    }

    const req = protocol.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        const responseTime = Date.now() - startTime;
        const success = res.statusCode >= 200 && res.statusCode < 400;

        onResponse(responseTime, success, res.statusCode);
        resolve();
      });
    });

    req.on("error", (error) => {
      const responseTime = Date.now() - startTime;
      onResponse(responseTime, false, error.message);
      resolve();
    });

    req.setTimeout(10000, () => {
      req.destroy();
      const responseTime = Date.now() - startTime;
      onResponse(responseTime, false, "Timeout");
      resolve();
    });

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

// Main load test function
async function runLoadTest() {
  console.log("🚀 Starting Load Test for Prompt Optimizer API\n");
  console.log("⚙️  Configuration:");
  console.log(`  Base URL: ${CONFIG.baseUrl}`);
  console.log(`  Concurrency: ${CONFIG.concurrency}`);
  console.log(`  Warmup Duration: ${CONFIG.warmupDuration}s`);
  console.log(`  Test Duration: ${CONFIG.duration}s`);
  console.log();

  // Initialize metrics for each endpoint
  const endpointMetrics = {};
  CONFIG.endpoints.forEach((ep) => {
    endpointMetrics[ep.path] = new Metrics();
  });

  // Warmup phase
  console.log("🔥 Warmup Phase...");
  const warmupStart = Date.now();
  let warmupCount = 0;

  while (Date.now() - warmupStart < CONFIG.warmupDuration * 1000) {
    const endpoint = CONFIG.endpoints[warmupCount % CONFIG.endpoints.length];
    const url = `${CONFIG.baseUrl}${endpoint.path}`;
    const body = endpoint.method === "POST" ? demoPayload : null;

    await makeRequest(url, endpoint.method, body, (time, success) => {
      endpointMetrics[endpoint.path].recordRequest(time, success);
    });

    warmupCount++;
  }

  console.log(`✓ Warmup Complete (${warmupCount} requests)\n`);

  // Main test phase
  console.log("📊 Running Load Test...");
  const testStart = Date.now();
  let requestCount = 0;

  while (Date.now() - testStart < CONFIG.duration * 1000) {
    // Create concurrent requests
    const promises = [];

    for (let i = 0; i < CONFIG.concurrency; i++) {
      const endpoint =
        CONFIG.endpoints[(requestCount + i) % CONFIG.endpoints.length];
      const url = `${CONFIG.baseUrl}${endpoint.path}`;
      const body = endpoint.method === "POST" ? demoPayload : null;

      promises.push(
        makeRequest(url, endpoint.method, body, (time, success, error) => {
          endpointMetrics[endpoint.path].recordRequest(time, success, error);
        }),
      );
    }

    await Promise.all(promises);
    requestCount += CONFIG.concurrency;

    // Progress indicator
    const elapsed = ((Date.now() - testStart) / 1000).toFixed(1);
    process.stdout.write(
      `\r  Progress: ${elapsed}s / ${CONFIG.duration}s (${requestCount} requests)`,
    );
  }

  console.log("\n\n✅ Load Test Complete\n");

  // Print results
  console.log("📈 Results by Endpoint:\n");
  CONFIG.endpoints.forEach((endpoint) => {
    console.log(`${endpoint.name} (${endpoint.path})`);
    console.log("─".repeat(60));

    const stats = endpointMetrics[endpoint.path].getStats();
    console.log(`  Total Requests:        ${stats.totalRequests}`);
    console.log(
      `  Successful:            ${stats.successfulRequests} (${stats.successRate}%)`,
    );
    console.log(`  Failed:                ${stats.failedRequests}`);
    console.log(`  Requests/Second:       ${stats.requestsPerSecond}`);
    console.log();
    console.log("  Response Times:");
    console.log(`    Average:             ${stats.avgResponseTime}ms`);
    console.log(`    Min:                 ${stats.minResponseTime}ms`);
    console.log(`    Max:                 ${stats.maxResponseTime}ms`);
    console.log(`    P50 (Median):        ${stats.p50ResponseTime}ms`);
    console.log(`    P95:                 ${stats.p95ResponseTime}ms`);
    console.log(`    P99:                 ${stats.p99ResponseTime}ms`);
    console.log();

    if (stats.errors.length > 0) {
      console.log("  Errors:");
      const errorCounts = {};
      stats.errors.forEach((err) => {
        errorCounts[err] = (errorCounts[err] || 0) + 1;
      });

      Object.entries(errorCounts).forEach(([error, count]) => {
        console.log(`    ${error}: ${count}`);
      });
      console.log();
    }
  });

  // Overall summary
  console.log("📋 Overall Summary:");
  console.log("─".repeat(60));
  let totalRequests = 0;
  let totalSuccessful = 0;
  let totalFailed = 0;

  CONFIG.endpoints.forEach((endpoint) => {
    const stats = endpointMetrics[endpoint.path].getStats();
    totalRequests += stats.totalRequests;
    totalSuccessful += stats.successfulRequests;
    totalFailed += stats.failedRequests;
  });

  const overallSuccessRate = ((totalSuccessful / totalRequests) * 100).toFixed(
    2,
  );
  console.log(`  Total Requests:        ${totalRequests}`);
  console.log(
    `  Total Successful:      ${totalSuccessful} (${overallSuccessRate}%)`,
  );
  console.log(`  Total Failed:          ${totalFailed}`);
  console.log();

  // Performance assessment
  console.log("💡 Performance Assessment:");
  console.log("─".repeat(60));

  const scoreMetrics = endpointMetrics["/api/score"].getStats();
  const optimizeMetrics = endpointMetrics["/api/optimize-full"].getStats();

  if (parseFloat(scoreMetrics.avgResponseTime) < 5000) {
    console.log("  ✅ Score API: Good performance (< 5s average)");
  } else if (parseFloat(scoreMetrics.avgResponseTime) < 10000) {
    console.log("  ⚠️  Score API: Acceptable (5-10s average)");
  } else {
    console.log("  ❌ Score API: Slow (> 10s average)");
  }

  if (parseFloat(optimizeMetrics.avgResponseTime) < 10000) {
    console.log("  ✅ Optimize API: Good performance (< 10s average)");
  } else if (parseFloat(optimizeMetrics.avgResponseTime) < 15000) {
    console.log("  ⚠️  Optimize API: Acceptable (10-15s average)");
  } else {
    console.log("  ❌ Optimize API: Slow (> 15s average)");
  }

  if (parseFloat(overallSuccessRate) >= 95) {
    console.log("  ✅ Success Rate: Excellent (>= 95%)");
  } else if (parseFloat(overallSuccessRate) >= 90) {
    console.log("  ⚠️  Success Rate: Good (90-95%)");
  } else {
    console.log("  ❌ Success Rate: Poor (< 90%)");
  }

  console.log();
}

// Run the test
runLoadTest().catch(console.error);
