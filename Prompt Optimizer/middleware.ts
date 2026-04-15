import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { NextRequestWithAuth } from "next-auth/middleware";

export const config = {
  matcher: ["/api/score", "/api/optimize-full", "/api/admin/:path*"],
};

export default withAuth(
  function middleware(req: NextRequestWithAuth) {
    // Read or generate request ID
    const requestId = req.headers.get("x-request-id") || crypto.randomUUID();

    // Create response and set request ID header
    const response = NextResponse.next();
    response.headers.set("x-request-id", requestId);

    return response;
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: "/login",
    },
  },
);
