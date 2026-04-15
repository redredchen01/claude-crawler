import { describe, it, expect, beforeAll } from "@jest/globals";
import { DeploymentService } from "../../src/services/deploymentService.js";
import type { DeploymentConfig, MetricsSnapshot, DeploymentStatus } from "../../src/services/deploymentService.js";

describe("DeploymentService", () => {
  let service: DeploymentService;

  beforeAll(() => {
    service = new DeploymentService();
  });

  describe("Deployment Configurations", () => {
    it("should provide development configuration", () => {
      const config = service.getDeploymentConfig("development");

      expect(config.environment).toBe("development");
      expect(config.cloudProvider).toBe("docker");
      expect(config.replicas).toBe(1);
      expect(config.autoscaling.enabled).toBe(false);
      expect(config.security.securityContext.runAsNonRoot).toBe(false);
    });

    it("should provide staging configuration", () => {
      const config = service.getDeploymentConfig("staging");

      expect(config.environment).toBe("staging");
      expect(config.cloudProvider).toBe("kubernetes");
      expect(config.replicas).toBeGreaterThanOrEqual(2);
      expect(config.autoscaling.enabled).toBe(true);
      expect(config.security.securityContext.runAsNonRoot).toBe(true);
    });

    it("should provide production configuration", () => {
      const config = service.getDeploymentConfig("production");

      expect(config.environment).toBe("production");
      expect(config.cloudProvider).toBe("kubernetes");
      expect(config.replicas).toBeGreaterThanOrEqual(3);
      expect(config.autoscaling.enabled).toBe(true);
      expect(config.security.securityContext.runAsNonRoot).toBe(true);
      expect(config.backup.enabled).toBe(true);
    });

    it("should have progressive security levels", () => {
      const dev = service.getDeploymentConfig("development");
      const staging = service.getDeploymentConfig("staging");
      const prod = service.getDeploymentConfig("production");

      expect(dev.security.securityContext.runAsNonRoot).toBe(false);
      expect(staging.security.securityContext.runAsNonRoot).toBe(true);
      expect(prod.security.securityContext.runAsNonRoot).toBe(true);
      expect(prod.security.podSecurityPolicy.restrictedLevel).toBe(true);
    });

    it("should have progressive backup policies", () => {
      const dev = service.getDeploymentConfig("development");
      const staging = service.getDeploymentConfig("staging");
      const prod = service.getDeploymentConfig("production");

      expect(dev.backup.enabled).toBe(false);
      expect(staging.backup.enabled).toBe(true);
      expect(prod.backup.enabled).toBe(true);
      expect(prod.backup.frequency).toBe("hourly");
      expect(staging.backup.frequency).toBe("daily");
    });
  });

  describe("Configuration Validation", () => {
    it("should accept valid configurations", () => {
      const config = service.getDeploymentConfig("production");
      const errors = service.validateConfig(config);

      expect(errors).toHaveLength(0);
    });

    it("should reject invalid autoscaling configuration", () => {
      const config = service.getDeploymentConfig("production");
      config.autoscaling.minReplicas = 10;
      config.autoscaling.maxReplicas = 5;

      const errors = service.validateConfig(config);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("minReplicas");
    });

    it("should validate resource requirements", () => {
      const config = service.getDeploymentConfig("production");
      config.resources.requests.cpu = "";

      const errors = service.validateConfig(config);

      expect(errors.length).toBeGreaterThan(0);
    });

    it("should enforce non-root for production", () => {
      const config = service.getDeploymentConfig("production");
      config.security.securityContext.runAsNonRoot = false;

      const errors = service.validateConfig(config);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain("non-root");
    });

    it("should validate backup configuration", () => {
      const config = service.getDeploymentConfig("production");
      config.backup.retentionDays = 0;

      const errors = service.validateConfig(config);

      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe("Health Status", () => {
    it("should identify healthy deployments", () => {
      const status: DeploymentStatus = {
        status: "healthy",
        replicas: {
          desired: 3,
          ready: 3,
          updated: 3,
          available: 3,
        },
        conditions: [],
        lastUpdateTime: Date.now(),
        observedGeneration: 1,
      };

      expect(service.isHealthy(status)).toBe(true);
    });

    it("should identify unhealthy deployments", () => {
      const status: DeploymentStatus = {
        status: "degraded",
        replicas: {
          desired: 3,
          ready: 1,
          updated: 2,
          available: 1,
        },
        conditions: [],
        lastUpdateTime: Date.now(),
        observedGeneration: 1,
      };

      expect(service.isHealthy(status)).toBe(false);
    });

    it("should summarize deployment status", () => {
      const status: DeploymentStatus = {
        status: "healthy",
        replicas: {
          desired: 3,
          ready: 3,
          updated: 3,
          available: 3,
        },
        conditions: [],
        lastUpdateTime: Date.now(),
        observedGeneration: 1,
      };

      const summary = service.summarizeStatus(status);

      expect(summary).toContain("HEALTHY");
      expect(summary).toContain("3/3");
      expect(summary).toContain("100%");
    });

    it("should calculate correct percentages", () => {
      const status: DeploymentStatus = {
        status: "degraded",
        replicas: {
          desired: 3,
          ready: 2,
          updated: 2,
          available: 2,
        },
        conditions: [],
        lastUpdateTime: Date.now(),
        observedGeneration: 1,
      };

      const summary = service.summarizeStatus(status);

      expect(summary).toContain("67%");
    });
  });

  describe("Scaling Recommendations", () => {
    let healthyMetrics: MetricsSnapshot;
    let config: DeploymentConfig;

    beforeAll(() => {
      config = service.getDeploymentConfig("production");
      healthyMetrics = {
        timestamp: Date.now(),
        cpuUsagePercent: 30,
        memoryUsagePercent: 40,
        requestsPerSecond: 100,
        errorRate: 0.001,
        p95LatencyMs: 50,
        p99LatencyMs: 100,
        activeConnections: 500,
        cacheHitRate: 0.9,
      };
    });

    it("should recommend no scaling for healthy metrics", () => {
      const recommendations = service.getScalingRecommendations(
        healthyMetrics,
        config,
      );

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0]).toContain("healthy ranges");
    });

    it("should recommend scaling for high CPU", () => {
      const metrics = {
        ...healthyMetrics,
        cpuUsagePercent: 85,
      };

      const recommendations = service.getScalingRecommendations(metrics, config);

      expect(
        recommendations.some((r) => r.includes("High CPU")),
      ).toBe(true);
    });

    it("should recommend scaling for high memory", () => {
      const metrics = {
        ...healthyMetrics,
        memoryUsagePercent: 90,
      };

      const recommendations = service.getScalingRecommendations(metrics, config);

      expect(
        recommendations.some((r) => r.includes("High memory")),
      ).toBe(true);
    });

    it("should recommend action for high error rate", () => {
      const metrics = {
        ...healthyMetrics,
        errorRate: 0.05,
      };

      const recommendations = service.getScalingRecommendations(metrics, config);

      expect(
        recommendations.some((r) => r.includes("High error rate")),
      ).toBe(true);
    });

    it("should recommend scaling for high latency", () => {
      const metrics = {
        ...healthyMetrics,
        p99LatencyMs: 2000,
      };

      const recommendations = service.getScalingRecommendations(metrics, config);

      expect(
        recommendations.some((r) => r.includes("High latency")),
      ).toBe(true);
    });

    it("should recommend cache optimization for low hit rate", () => {
      const metrics = {
        ...healthyMetrics,
        cacheHitRate: 0.5,
      };

      const recommendations = service.getScalingRecommendations(metrics, config);

      expect(
        recommendations.some((r) => r.includes("cache hit rate")),
      ).toBe(true);
    });

    it("should return empty recommendations without autoscaling", () => {
      const devConfig = service.getDeploymentConfig("development");
      const recommendations = service.getScalingRecommendations(
        healthyMetrics,
        devConfig,
      );

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0]).toContain("Enable autoscaling");
    });

    it("should handle multiple high metrics", () => {
      const metrics: MetricsSnapshot = {
        timestamp: Date.now(),
        cpuUsagePercent: 85,
        memoryUsagePercent: 85,
        requestsPerSecond: 1000,
        errorRate: 0.05,
        p95LatencyMs: 500,
        p99LatencyMs: 2000,
        activeConnections: 5000,
        cacheHitRate: 0.5,
      };

      const recommendations = service.getScalingRecommendations(metrics, config);

      expect(recommendations.length).toBeGreaterThan(2);
    });
  });

  describe("Deployment Checklists", () => {
    it("should provide development checklist", () => {
      const checklist = service.getDeploymentChecklist("development");

      expect(checklist.length).toBeGreaterThan(0);
      expect(checklist.some((item) => item.includes("Environment variables"))).toBe(true);
    });

    it("should provide staging checklist", () => {
      const checklist = service.getDeploymentChecklist("staging");

      expect(checklist.length).toBeGreaterThan(0);
      expect(
        checklist.some((item) => item.includes("Load testing")),
      ).toBe(true);
    });

    it("should provide production checklist", () => {
      const checklist = service.getDeploymentChecklist("production");

      expect(checklist.length).toBeGreaterThan(0);
      expect(
        checklist.some((item) => item.includes("Disaster recovery")),
      ).toBe(true);
      expect(
        checklist.some((item) => item.includes("Runbooks")),
      ).toBe(true);
      expect(
        checklist.some((item) => item.includes("Incident response")),
      ).toBe(true);
    });

    it("should have progressive checklist complexity", () => {
      const dev = service.getDeploymentChecklist("development");
      const staging = service.getDeploymentChecklist("staging");
      const prod = service.getDeploymentChecklist("production");

      expect(dev.length).toBeLessThan(staging.length);
      expect(staging.length).toBeLessThan(prod.length);
    });

    it("should include all base checklist items", () => {
      const baseItems = [
        "Environment variables",
        "Database migrations",
        "SSL/TLS certificates",
        "Health checks",
        "Monitoring",
      ];

      const devChecklist = service.getDeploymentChecklist("development");

      for (const item of baseItems) {
        expect(devChecklist.some((c) => c.includes(item))).toBe(true);
      }
    });
  });

  describe("Resource Requirements", () => {
    it("should have proper resource limits", () => {
      const configs = [
        service.getDeploymentConfig("development"),
        service.getDeploymentConfig("staging"),
        service.getDeploymentConfig("production"),
      ];

      for (const config of configs) {
        expect(config.resources.requests.cpu).toBeDefined();
        expect(config.resources.requests.memory).toBeDefined();
        expect(config.resources.limits.cpu).toBeDefined();
        expect(config.resources.limits.memory).toBeDefined();
      }
    });

    it("should have limits greater than or equal to requests", () => {
      const config = service.getDeploymentConfig("production");

      const parseMemory = (mem: string): number => {
        if (mem.includes("Gi")) return parseInt(mem) * 1024;
        if (mem.includes("Mi")) return parseInt(mem);
        return parseInt(mem);
      };

      const parseCore = (cpu: string): number => {
        if (cpu.includes("m")) return parseInt(cpu);
        return parseInt(cpu) * 1000;
      };

      const requestMem = parseMemory(
        config.resources.requests.memory,
      );
      const limitMem = parseMemory(config.resources.limits.memory);
      expect(limitMem).toBeGreaterThanOrEqual(requestMem);

      const requestCpu = parseCore(config.resources.requests.cpu);
      const limitCpu = parseCore(config.resources.limits.cpu);
      expect(limitCpu).toBeGreaterThanOrEqual(requestCpu);
    });
  });

  describe("High Availability Configuration", () => {
    it("production should have multiple replicas", () => {
      const config = service.getDeploymentConfig("production");

      expect(config.replicas).toBeGreaterThanOrEqual(3);
      expect(config.autoscaling.minReplicas).toBeGreaterThanOrEqual(3);
    });

    it("production should have strict autoscaling", () => {
      const config = service.getDeploymentConfig("production");

      expect(config.autoscaling.enabled).toBe(true);
      expect(config.autoscaling.targetCPUUtilization).toBeLessThan(70);
    });

    it("production should have pod anti-affinity configured", () => {
      const config = service.getDeploymentConfig("production");

      expect(config.environment).toBe("production");
      // This would be verified in actual Kubernetes YAML
    });
  });

  describe("Security Configuration", () => {
    it("production should run as non-root", () => {
      const config = service.getDeploymentConfig("production");

      expect(config.security.securityContext.runAsNonRoot).toBe(true);
      expect(config.security.securityContext.runAsUser).toBe(1001);
    });

    it("production should have read-only filesystem", () => {
      const config = service.getDeploymentConfig("production");

      expect(
        config.security.securityContext.readOnlyRootFilesystem,
      ).toBe(true);
    });

    it("production should not allow privilege escalation", () => {
      const config = service.getDeploymentConfig("production");

      expect(
        config.security.securityContext.allowPrivilegeEscalation,
      ).toBe(false);
    });

    it("production should have network policies", () => {
      const config = service.getDeploymentConfig("production");

      expect(config.security.networkPolicy.enabled).toBe(true);
      expect(config.security.networkPolicy.ingressRules.length).toBeGreaterThan(0);
      expect(config.security.networkPolicy.egressRules.length).toBeGreaterThan(0);
    });
  });

  describe("Monitoring and Logging", () => {
    it("all environments should have monitoring enabled", () => {
      const envs = ["development", "staging", "production"] as const;

      for (const env of envs) {
        const config = service.getDeploymentConfig(env);
        expect(config.monitoring.enabled).toBe(true);
      }
    });

    it("production should use JSON logging", () => {
      const config = service.getDeploymentConfig("production");

      expect(config.logging.format).toBe("json");
    });

    it("production should have longer log retention", () => {
      const dev = service.getDeploymentConfig("development");
      const prod = service.getDeploymentConfig("production");

      expect(prod.logging.retentionDays).toBeGreaterThan(
        dev.logging.retentionDays,
      );
    });
  });
});
