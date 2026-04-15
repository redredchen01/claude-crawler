import { getAuthSession } from "./auth";

export class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function requireAdmin() {
  const session = await getAuthSession();

  if (!session || !session.user) {
    throw new UnauthorizedError("Authentication required");
  }

  if (session.user.role !== "ADMIN") {
    throw new UnauthorizedError("Admin access required");
  }

  return session;
}

export async function requireAuth() {
  const session = await getAuthSession();

  if (!session || !session.user) {
    throw new UnauthorizedError("Authentication required");
  }

  return session;
}

export function isAdmin(role?: string): boolean {
  return role === "ADMIN";
}

export function isUser(role?: string): boolean {
  return role === "USER" || role === "ADMIN";
}
