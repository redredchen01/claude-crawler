const { ContextEstimator } = require("../src/estimator");

describe("ContextEstimator", () => {
  let estimator;

  beforeEach(() => {
    estimator = new ContextEstimator({ maxTokens: 200_000 });
  });

  describe("constructor", () => {
    it("should initialize with default 200K context window", () => {
      const e = new ContextEstimator();
      expect(e.maxTokens).toBe(200_000);
    });

    it("should accept custom context window size", () => {
      const e = new ContextEstimator({ maxTokens: 128_000 });
      expect(e.maxTokens).toBe(128_000);
    });

    it("should start at 0 usage", () => {
      expect(estimator.usedTokens).toBe(0);
      expect(estimator.percentage).toBe(0);
    });
  });

  describe("trackEvent", () => {
    it("should track user message tokens", () => {
      estimator.trackEvent("user_message", { chars: 500 });
      expect(estimator.usedTokens).toBeGreaterThan(0);
    });

    it("should track assistant response tokens", () => {
      estimator.trackEvent("assistant_response", { chars: 1000 });
      expect(estimator.usedTokens).toBeGreaterThan(0);
    });

    it("should track file read tokens", () => {
      estimator.trackEvent("file_read", { lines: 100 });
      expect(estimator.usedTokens).toBeGreaterThan(0);
    });

    it("should track tool call result tokens", () => {
      estimator.trackEvent("tool_result", { chars: 2000 });
      expect(estimator.usedTokens).toBeGreaterThan(0);
    });

    it("should accumulate multiple events", () => {
      estimator.trackEvent("user_message", { chars: 500 });
      const after1 = estimator.usedTokens;
      estimator.trackEvent("user_message", { chars: 500 });
      expect(estimator.usedTokens).toBeGreaterThan(after1);
    });

    it("should throw on unknown event type", () => {
      expect(() => estimator.trackEvent("unknown", {})).toThrow();
    });
  });

  describe("percentage", () => {
    it("should return 0-100 range", () => {
      expect(estimator.percentage).toBeGreaterThanOrEqual(0);
      expect(estimator.percentage).toBeLessThanOrEqual(100);
    });

    it("should increase as tokens are used", () => {
      for (let i = 0; i < 50; i++) {
        estimator.trackEvent("user_message", { chars: 2000 });
        estimator.trackEvent("assistant_response", { chars: 3000 });
      }
      expect(estimator.percentage).toBeGreaterThan(0);
    });

    it("should cap at 100", () => {
      // Force way over limit
      for (let i = 0; i < 1000; i++) {
        estimator.trackEvent("file_read", { lines: 500 });
      }
      expect(estimator.percentage).toBeLessThanOrEqual(100);
    });
  });

  describe("threshold", () => {
    it("should return 'green' when under 40%", () => {
      expect(estimator.threshold).toBe("green");
    });

    it("should return 'yellow' at 40-60%", () => {
      // Simulate ~50% usage
      estimator._usedTokens = 100_000;
      expect(estimator.threshold).toBe("yellow");
    });

    it("should return 'orange' at 60-80%", () => {
      estimator._usedTokens = 140_000;
      expect(estimator.threshold).toBe("orange");
    });

    it("should return 'red' above 80%", () => {
      estimator._usedTokens = 170_000;
      expect(estimator.threshold).toBe("red");
    });
  });

  describe("shouldCheckpoint", () => {
    it("should not checkpoint when green", () => {
      expect(estimator.shouldCheckpoint()).toBe(false);
    });

    it("should checkpoint at yellow threshold (first time)", () => {
      estimator._usedTokens = 90_000;
      expect(estimator.shouldCheckpoint()).toBe(true);
    });

    it("should not checkpoint twice at same threshold", () => {
      estimator._usedTokens = 90_000;
      estimator.shouldCheckpoint(); // marks as done
      expect(estimator.shouldCheckpoint()).toBe(false);
    });

    it("should checkpoint again at higher threshold", () => {
      estimator._usedTokens = 90_000;
      estimator.shouldCheckpoint();
      estimator._usedTokens = 140_000;
      expect(estimator.shouldCheckpoint()).toBe(true);
    });
  });

  describe("recommendations", () => {
    it("should return empty array when green", () => {
      expect(estimator.recommendations).toEqual([]);
    });

    it("should suggest targeted reads at yellow", () => {
      estimator._usedTokens = 90_000;
      const recs = estimator.recommendations;
      expect(recs.length).toBeGreaterThan(0);
      expect(recs.some((r) => r.includes("read"))).toBe(true);
    });

    it("should suggest saving at orange", () => {
      estimator._usedTokens = 140_000;
      const recs = estimator.recommendations;
      expect(recs.some((r) => r.includes("save"))).toBe(true);
    });

    it("should suggest new session at red", () => {
      estimator._usedTokens = 170_000;
      const recs = estimator.recommendations;
      expect(recs.some((r) => r.includes("new session"))).toBe(true);
    });
  });

  describe("reset", () => {
    it("should reset all counters", () => {
      estimator.trackEvent("user_message", { chars: 5000 });
      estimator.reset();
      expect(estimator.usedTokens).toBe(0);
      expect(estimator.percentage).toBe(0);
    });
  });

  describe("toJSON", () => {
    it("should serialize state for checkpoint files", () => {
      estimator.trackEvent("user_message", { chars: 500 });
      const json = estimator.toJSON();
      expect(json).toHaveProperty("usedTokens");
      expect(json).toHaveProperty("maxTokens");
      expect(json).toHaveProperty("percentage");
      expect(json).toHaveProperty("threshold");
      expect(json).toHaveProperty("events");
    });
  });
});
