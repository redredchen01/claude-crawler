import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// Prisma client configuration with optimized connection pooling
const prismaClientOptions = {
  // Logging configuration
  log:
    process.env.NODE_ENV === "development"
      ? [
          { level: "query", emit: "event" as const },
          { level: "error", emit: "stdout" as const },
          { level: "warn", emit: "stdout" as const },
        ]
      : [{ level: "error", emit: "stdout" as const }],
};

export const prisma =
  globalForPrisma.prisma || new PrismaClient(prismaClientOptions);

// Log slow queries in development (> 1000ms)
if (process.env.NODE_ENV === "development") {
  prisma.$on("query", (e: any) => {
    if (e.duration > 1000) {
      console.warn(`[SLOW QUERY] ${e.query} (${e.duration}ms)`);
    }
  });
}

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
