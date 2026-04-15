/**
 * Deployment Service
 * Manages cloud deployment configurations, health checks, and operational concerns
 * Phase 2.8: Enables production-ready deployment to Kubernetes and cloud platforms
 */

export type DeploymentEnvironment = "development" | "staging" | "production";
export type CloudProvider = "kubernetes" | "docker" | "aws" | "gcp" | "azure";

export interface DeploymentConfig {
  environment: DeploymentEnvironment;
  cloudProvider: CloudProvider;
  region?: string;
  replicas: number;
  resources: {
    requests: ResourceRequirements;
    limits: ResourceRequirements;
  };
  healthCheck: HealthCheckConfig;
  autoscaling: AutoscalingConfig;
  monitoring: MonitoringConfig;
  logging: LoggingConfig;
  networking: NetworkingConfig;
  security: SecurityConfig;
  backup: BackupConfig;
}

export interface ResourceRequirements {
  cpu: string; // e.g., "500m", "2"
  memory: string; // e.g., "512Mi", "2Gi"
  storage?: string;
}

export interface HealthCheckConfig {
  path: string;
  port: number;
  initialDelaySeconds: number;
  periodSeconds: number;
  timeoutSeconds: number;
  failureThreshold: number;
}

export interface AutoscalingConfig {
  enabled: boolean;
  minReplicas: number;
  maxReplicas: number;
  targetCPUUtilization: number;
  targetMemoryUtilization: number;
}

export interface MonitoringConfig {
  enabled: boolean;
  metricsPort: number;
  metricsPath: string;
  prometheusEnabled: boolean;
  datadogEnabled: boolean;
  datadog?: {
    apiKey: string;
    appKey: string;
  };
}

export interface LoggingConfig {
  level: "debug" | "info" | "warn" | "error";
  format: "json" | "text";
  destination: "stdout" | "file" | "cloudLogging";
  cloudProvider?: "stackdriver" | "cloudwatch" | "azure-monitor";
  retentionDays: number;
}

export interface NetworkingConfig {
  protocol: "http" | "https";
  port: number;
  tlsEnabled: boolean;
  corsEnabled: boolean;
  rateLimiting: {
    enabled: boolean;
    requestsPerMinute: number;
  };
}

export interface SecurityConfig {
  tlsCertificate?: string;
  tlsPrivateKey?: string;
  certificateAuthority?: string;
  securityContext: {
    runAsNonRoot: boolean;
    runAsUser?: number;
    allowPrivilegeEscalation: boolean;
    readOnlyRootFilesystem: boolean;
  };
  networkPolicy: {
    enabled: boolean;
    ingressRules: string[];
    egressRules: string[];
  };
  podSecurityPolicy: {
    enabled: boolean;
    restrictedLevel: boolean;
  };
}

export interface BackupConfig {
  enabled: boolean;
  frequency: "hourly" | "daily" | "weekly" | "monthly";
  retentionDays: number;
  encryptionEnabled: boolean;
  cloudStorage: {
    provider: "s3" | "gcs" | "azure-blob";
    bucket: string;
    path: string;
  };
}

export interface DeploymentStatus {
  status: "healthy" | "degraded" | "unhealthy" | "unknown";
  replicas: {
    desired: number;
    ready: number;
    updated: number;
    available: number;
  };
  conditions: DeploymentCondition[];
  lastUpdateTime: number;
  observedGeneration: number;
}

export interface DeploymentCondition {
  type: "Progressing" | "Available" | "ReplicaFailure" | "HealthyPods";
  status: "True" | "False" | "Unknown";
  reason: string;
  message: string;
  lastUpdateTime: number;
}

export interface MetricsSnapshot {
  timestamp: number;
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  requestsPerSecond: number;
  errorRate: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  activeConnections: number;
  cacheHitRate: number;
}

export class DeploymentService {
  /**
   * Get default deployment configuration for environment
   */
  getDeploymentConfig(environment: DeploymentEnvironment): DeploymentConfig {
    const configs: Record<DeploymentEnvironment, DeploymentConfig> = {
      development: {
        environment: "development",
        cloudProvider: "docker",
        replicas: 1,
        resources: {
          requests: { cpu: "100m", memory: "256Mi" },
          limits: { cpu: "500m", memory: "512Mi" },
        },
        healthCheck: {
          path: "/health",
          port: 3000,
          initialDelaySeconds: 10,
          periodSeconds: 10,
          timeoutSeconds: 3,
          failureThreshold: 3,
        },
        autoscaling: {
          enabled: false,
          minReplicas: 1,
          maxReplicas: 3,
          targetCPUUtilization: 70,
          targetMemoryUtilization: 80,
        },
        monitoring: {
          enabled: true,
          metricsPort: 9090,
          metricsPath: "/metrics",
          prometheusEnabled: true,
          datadogEnabled: false,
        },
        logging: {
          level: "debug",
          format: "text",
          destination: "stdout",
          retentionDays: 7,
        },
        networking: {
          protocol: "http",
          port: 3000,
          tlsEnabled: false,
          corsEnabled: true,
          rateLimiting: {
            enabled: false,
            requestsPerMinute: 1000,
          },
        },
        security: {
          securityContext: {
            runAsNonRoot: false,
            allowPrivilegeEscalation: true,
            readOnlyRootFilesystem: false,
          },
          networkPolicy: {
            enabled: false,
            ingressRules: [],
            egressRules: [],
          },
          podSecurityPolicy: {
            enabled: false,
            restrictedLevel: false,
          },
        },
        backup: {
          enabled: false,
          frequency: "daily",
          retentionDays: 7,
          encryptionEnabled: false,
          cloudStorage: {
            provider: "s3",
            bucket: "dev-backups",
            path: "seo-content",
          },
        },
      },
      staging: {
        environment: "staging",
        cloudProvider: "kubernetes",
        region: "us-central1",
        replicas: 2,
        resources: {
          requests: { cpu: "500m", memory: "512Mi" },
          limits: { cpu: "1000m", memory: "1Gi" },
        },
        healthCheck: {
          path: "/health",
          port: 3000,
          initialDelaySeconds: 30,
          periodSeconds: 10,
          timeoutSeconds: 5,
          failureThreshold: 3,
        },
        autoscaling: {
          enabled: true,
          minReplicas: 2,
          maxReplicas: 5,
          targetCPUUtilization: 70,
          targetMemoryUtilization: 80,
        },
        monitoring: {
          enabled: true,
          metricsPort: 9090,
          metricsPath: "/metrics",
          prometheusEnabled: true,
          datadogEnabled: true,
          datadog: {
            apiKey: process.env.DATADOG_API_KEY || "",
            appKey: process.env.DATADOG_APP_KEY || "",
          },
        },
        logging: {
          level: "info",
          format: "json",
          destination: "cloudLogging",
          cloudProvider: "stackdriver",
          retentionDays: 30,
        },
        networking: {
          protocol: "https",
          port: 443,
          tlsEnabled: true,
          corsEnabled: true,
          rateLimiting: {
            enabled: true,
            requestsPerMinute: 600,
          },
        },
        security: {
          securityContext: {
            runAsNonRoot: true,
            runAsUser: 1001,
            allowPrivilegeEscalation: false,
            readOnlyRootFilesystem: true,
          },
          networkPolicy: {
            enabled: true,
            ingressRules: ["redis", "api"],
            egressRules: ["external-apis"],
          },
          podSecurityPolicy: {
            enabled: true,
            restrictedLevel: false,
          },
        },
        backup: {
          enabled: true,
          frequency: "daily",
          retentionDays: 30,
          encryptionEnabled: true,
          cloudStorage: {
            provider: "gcs",
            bucket: "staging-backups",
            path: "seo-content",
          },
        },
      },
      production: {
        environment: "production",
        cloudProvider: "kubernetes",
        region: "us-central1",
        replicas: 3,
        resources: {
          requests: { cpu: "500m", memory: "512Mi", storage: "50Gi" },
          limits: { cpu: "2000m", memory: "2Gi" },
        },
        healthCheck: {
          path: "/health",
          port: 3000,
          initialDelaySeconds: 30,
          periodSeconds: 10,
          timeoutSeconds: 5,
          failureThreshold: 3,
        },
        autoscaling: {
          enabled: true,
          minReplicas: 3,
          maxReplicas: 10,
          targetCPUUtilization: 60,
          targetMemoryUtilization: 70,
        },
        monitoring: {
          enabled: true,
          metricsPort: 9090,
          metricsPath: "/metrics",
          prometheusEnabled: true,
          datadogEnabled: true,
          datadog: {
            apiKey: process.env.DATADOG_API_KEY || "",
            appKey: process.env.DATADOG_APP_KEY || "",
          },
        },
        logging: {
          level: "info",
          format: "json",
          destination: "cloudLogging",
          cloudProvider: "stackdriver",
          retentionDays: 90,
        },
        networking: {
          protocol: "https",
          port: 443,
          tlsEnabled: true,
          corsEnabled: true,
          rateLimiting: {
            enabled: true,
            requestsPerMinute: 2000,
          },
        },
        security: {
          securityContext: {
            runAsNonRoot: true,
            runAsUser: 1001,
            allowPrivilegeEscalation: false,
            readOnlyRootFilesystem: true,
          },
          networkPolicy: {
            enabled: true,
            ingressRules: ["redis", "api", "monitoring"],
            egressRules: ["external-apis", "dns", "logging"],
          },
          podSecurityPolicy: {
            enabled: true,
            restrictedLevel: true,
          },
        },
        backup: {
          enabled: true,
          frequency: "hourly",
          retentionDays: 365,
          encryptionEnabled: true,
          cloudStorage: {
            provider: "s3",
            bucket: "prod-backups",
            path: "seo-content",
          },
        },
      },
    };

    return configs[environment];
  }

  /**
   * Validate deployment configuration
   */
  validateConfig(config: DeploymentConfig): string[] {
    const errors: string[] = [];

    // Validate replicas
    if (config.autoscaling.minReplicas > config.autoscaling.maxReplicas) {
      errors.push("Autoscaling minReplicas cannot exceed maxReplicas");
    }

    // Validate resources
    if (!config.resources.requests.cpu || !config.resources.requests.memory) {
      errors.push("Request resources must specify both CPU and memory");
    }

    if (!config.resources.limits.cpu || !config.resources.limits.memory) {
      errors.push("Limit resources must specify both CPU and memory");
    }

    // Validate security for production
    if (
      config.environment === "production" &&
      !config.security.securityContext.runAsNonRoot
    ) {
      errors.push("Production deployments must run as non-root user");
    }

    // Validate logging
    if (
      config.logging.destination === "cloudLogging" &&
      !config.logging.cloudProvider
    ) {
      errors.push("Cloud logging requires cloudProvider specification");
    }

    // Validate backup
    if (config.backup.enabled && config.backup.retentionDays < 1) {
      errors.push("Backup retention must be at least 1 day");
    }

    return errors;
  }

  /**
   * Generate deployment status summary
   */
  summarizeStatus(status: DeploymentStatus): string {
    const readyPercent =
      status.replicas.desired > 0
        ? Math.round((status.replicas.ready / status.replicas.desired) * 100)
        : 0;

    return `${status.status.toUpperCase()}: ${status.replicas.ready}/${status.replicas.desired} replicas ready (${readyPercent}%)`;
  }

  /**
   * Check if deployment is healthy
   */
  isHealthy(status: DeploymentStatus): boolean {
    return (
      status.status === "healthy" &&
      status.replicas.ready === status.replicas.desired &&
      status.replicas.available === status.replicas.desired
    );
  }

  /**
   * Get recommended scaling actions based on metrics
   */
  getScalingRecommendations(
    metrics: MetricsSnapshot,
    config: DeploymentConfig,
  ): string[] {
    const recommendations: string[] = [];

    if (!config.autoscaling.enabled) {
      return ["Enable autoscaling to improve resilience"];
    }

    const cpuPercent = metrics.cpuUsagePercent;
    const memoryPercent = metrics.memoryUsagePercent;
    const errorRate = metrics.errorRate;
    const p99Latency = metrics.p99LatencyMs;

    // CPU scaling
    if (cpuPercent > config.autoscaling.targetCPUUtilization) {
      recommendations.push(
        `High CPU usage (${cpuPercent}%) - consider increasing CPU limits or scaling up replicas`,
      );
    }

    // Memory scaling
    if (memoryPercent > config.autoscaling.targetMemoryUtilization) {
      recommendations.push(
        `High memory usage (${memoryPercent}%) - consider increasing memory limits or optimizing cache`,
      );
    }

    // Error rate scaling
    if (errorRate > 0.01) {
      // More than 1% error rate
      recommendations.push(
        `High error rate (${(errorRate * 100).toFixed(2)}%) - investigate and scale if needed`,
      );
    }

    // Latency scaling
    if (p99Latency > 1000) {
      recommendations.push(
        `High latency (${p99Latency}ms p99) - consider scaling up or optimizing queries`,
      );
    }

    // Cache performance
    if (metrics.cacheHitRate < 0.7) {
      recommendations.push(
        `Low cache hit rate (${(metrics.cacheHitRate * 100).toFixed(1)}%) - increase cache size or TTL`,
      );
    }

    if (recommendations.length === 0) {
      recommendations.push("Deployment metrics are within healthy ranges");
    }

    return recommendations;
  }

  /**
   * Get deployment checklist for environment
   */
  getDeploymentChecklist(environment: DeploymentEnvironment): string[] {
    const baseChecklist = [
      "✓ Environment variables configured",
      "✓ Database migrations completed",
      "✓ SSL/TLS certificates installed",
      "✓ Health checks passing",
      "✓ All secrets loaded",
      "✓ Monitoring enabled",
      "✓ Backups configured",
      "✓ Rate limiting configured",
    ];

    const additionalChecks: Record<DeploymentEnvironment, string[]> = {
      development: [],
      staging: [
        "✓ Load testing completed",
        "✓ Security scan passed",
        "✓ Performance benchmarks met",
      ],
      production: [
        "✓ Load testing completed",
        "✓ Security scan passed",
        "✓ Performance benchmarks met",
        "✓ Disaster recovery tested",
        "✓ Runbooks prepared",
        "✓ On-call rotation configured",
        "✓ Incident response plan ready",
      ],
    };

    return [...baseChecklist, ...additionalChecks[environment]];
  }
}
