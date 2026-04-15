/**
 * OpenTelemetry Distributed Tracing
 * Exports traces to Jaeger for performance analysis
 */

import { NodeSDK } from "@opentelemetry/auto-instrumentations-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { JaegerExporter } from "@opentelemetry/exporter-jaeger-basic";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { TracerProvider } from "@opentelemetry/sdk-trace-node";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { trace, SpanStatusCode, context } from "@opentelemetry/api";
import logger from "@/lib/logger";

// Initialize Jaeger exporter
const jaegerExporter = new JaegerExporter({
  host: process.env.JAEGER_HOST || "localhost",
  port: parseInt(process.env.JAEGER_PORT || "6831"),
  maxPacketSize: 65000,
});

// Create tracer provider
const tracerProvider = new TracerProvider({
  resource: Resource.default().merge(
    new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]:
        process.env.OTEL_SERVICE_NAME || "prompt-optimizer",
      [SemanticResourceAttributes.SERVICE_VERSION]:
        process.env.npm_package_version || "0.1.0",
      environment: process.env.NODE_ENV || "development",
    })
  ),
});

// Add span processor
tracerProvider.addSpanProcessor(new BatchSpanProcessor(jaegerExporter));

// Set global tracer provider
trace.setGlobalTracerProvider(tracerProvider);

// Get tracer
export const tracer = trace.getTracer(
  "prompt-optimizer",
  process.env.npm_package_version || "0.1.0"
);

// Span helper functions
export function createSpan(name: string, attributes?: Record<string, any>) {
  const span = tracer.startSpan(name);

  if (attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttributes({ [key]: value });
    });
  }

  return span;
}

export function endSpan(
  span: any,
  status: "success" | "error" = "success",
  error?: Error
) {
  if (status === "error" && error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    span.addEvent("exception", {
      "exception.type": error.name,
      "exception.message": error.message,
      "exception.stacktrace": error.stack,
    });
  } else if (status === "success") {
    span.setStatus({ code: SpanStatusCode.OK });
  }

  span.end();
}

export function withSpan<T>(
  name: string,
  fn: (span: any) => T,
  attributes?: Record<string, any>
): T {
  const span = createSpan(name, attributes);

  try {
    const result = context.with(trace.setSpan(context.active(), span), () =>
      fn(span)
    );
    endSpan(span, "success");
    return result;
  } catch (error: any) {
    endSpan(span, "error", error);
    throw error;
  }
}

export async function withAsyncSpan<T>(
  name: string,
  fn: (span: any) => Promise<T>,
  attributes?: Record<string, any>
): Promise<T> {
  const span = createSpan(name, attributes);

  try {
    const result = await context.with(trace.setSpan(context.active(), span), () =>
      fn(span)
    );
    endSpan(span, "success");
    return result;
  } catch (error: any) {
    endSpan(span, "error", error);
    throw error;
  }
}

// Initialize Node SDK with auto-instrumentations
const sdk = new NodeSDK({
  traceExporter: jaegerExporter,
  instrumentations: [getNodeAutoInstrumentations()],
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("Shutting down tracer provider");
  await tracerProvider.shutdown();
  process.exit(0);
});

export { tracerProvider };

logger.info("OpenTelemetry tracing initialized");
