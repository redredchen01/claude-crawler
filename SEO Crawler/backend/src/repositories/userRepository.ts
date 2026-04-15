import { getDatabase } from "../db/client";
import { users, apiKeys } from "../db/schema";
import { eq } from "drizzle-orm";

export class UserRepository {
  /**
   * Create user
   */
  async createUser(data: {
    username: string;
    email: string;
    passwordHash: string;
    role?: string;
  }) {
    const db = getDatabase();
    const result = await db
      .insert(users)
      .values({
        ...data,
        role: data.role || "viewer",
        isActive: true,
      })
      .returning();
    return result[0];
  }

  /**
   * Get user by ID
   */
  async getUser(userId: number) {
    const db = getDatabase();
    const result = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return result[0] || null;
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string) {
    const db = getDatabase();
    const result = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return result[0] || null;
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username: string) {
    const db = getDatabase();
    const result = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    return result[0] || null;
  }

  /**
   * Update user
   */
  async updateUser(userId: number, data: Partial<any>) {
    const db = getDatabase();
    const result = await db
      .update(users)
      .set(data)
      .where(eq(users.id, userId))
      .returning();
    return result[0];
  }

  /**
   * Create API key
   */
  async createApiKey(data: {
    userId: number;
    keyHash: string;
    name: string;
    expiresAt?: Date;
  }) {
    const db = getDatabase();
    const result = await db.insert(apiKeys).values(data).returning();
    return result[0];
  }

  /**
   * Get API key by hash
   */
  async getApiKeyByHash(keyHash: string) {
    const db = getDatabase();
    const result = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))
      .limit(1);
    return result[0] || null;
  }

  /**
   * Get user API keys
   */
  async getUserApiKeys(userId: number) {
    const db = getDatabase();
    const result = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId));
    return result;
  }

  /**
   * Deactivate API key
   */
  async deactivateApiKey(keyId: number) {
    const db = getDatabase();
    const result = await db
      .update(apiKeys)
      .set({ isActive: false })
      .where(eq(apiKeys.id, keyId))
      .returning();
    return result[0];
  }

  /**
   * Update API key last used time
   */
  async updateApiKeyLastUsed(keyHash: string) {
    const db = getDatabase();
    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.keyHash, keyHash));
  }

  /**
   * Delete API key
   */
  async deleteApiKey(keyId: number) {
    const db = getDatabase();
    await db.delete(apiKeys).where(eq(apiKeys.id, keyId));
    return true;
  }
}

export const userRepository = new UserRepository();
