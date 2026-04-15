import { NextRequest, NextResponse } from "next/server";
import { tracer } from "@/lib/tracing";

export function traceMiddleware(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const span = tracer.startSpan("http.request", {
      attributes: {
        "http.method": req.method,
        "http.url": req.nextUrl.pathname,
        "http.target": req.nextUrl.search,
      },
    });

    const startTime = Date.now();

    try {
      const response = await handler(req);

      span.setAttributes({
        "http.status_code": response.status,
        "http.duration_ms": Date.now() - startTime,
      });

      return response;
    } catch (error: any) {
      span.recordException(error);
      span.setStatus({ code: 2, message: error.message });
      throw error;
    } finally {
      span.end();
    }
  };
}
