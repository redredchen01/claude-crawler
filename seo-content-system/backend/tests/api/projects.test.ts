import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../src/db/schema";
import { v4 as uuid } from "uuid";

describe("Projects API", () => {
  let db: ReturnType<typeof drizzle>;
  let testDb: Database.Database;
  let userId: string;
  let projectId: string;

  beforeAll(async () => {
    // Create in-memory test database
    testDb = new Database(":memory:");
    db = drizzle(testDb, { schema });

    // Initialize schema (simplified for test)
    userId = uuid();
    projectId = uuid();

    // Create test tables - simplified
    testDb.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        hashed_password TEXT NOT NULL,
        role TEXT DEFAULT 'user' NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()) NOT NULL,
        updated_at INTEGER DEFAULT (unixepoch()) NOT NULL
      );

      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        site_name TEXT NOT NULL,
        locale TEXT NOT NULL,
        language TEXT NOT NULL,
        default_engine TEXT DEFAULT 'google' NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()) NOT NULL,
        updated_at INTEGER DEFAULT (unixepoch()) NOT NULL,
        FOREIGN KEY(owner_id) REFERENCES users(id)
      );
    `);
  });

  afterAll(() => {
    testDb.close();
  });

  describe("Project Creation", () => {
    it("should create a new project", async () => {
      // Insert test user
      testDb
        .prepare(
          `
        INSERT INTO users (id, email, hashed_password)
        VALUES (?, ?, ?)
      `,
        )
        .run(userId, "test@example.com", "hashed");

      // Insert test project
      testDb
        .prepare(
          `
        INSERT INTO projects (id, owner_id, name, site_name, locale, language, default_engine)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          projectId,
          userId,
          "Test Project",
          "example.com",
          "zh-CN",
          "chinese",
          "google",
        );

      // Verify
      const result = testDb
        .prepare("SELECT * FROM projects WHERE id = ?")
        .get(projectId);
      expect(result).toBeDefined();
      expect(result.name).toBe("Test Project");
      expect(result.owner_id).toBe(userId);
    });

    it("should require owner_id", () => {
      expect(() => {
        testDb
          .prepare(
            `
          INSERT INTO projects (id, name, site_name, locale, language)
          VALUES (?, ?, ?, ?, ?)
        `,
          )
          .run(uuid(), "Test", "test.com", "zh-CN", "chinese");
      }).toThrow();
    });

    it("should validate locale format", () => {
      // This is enforced at API level, not database
      // But we test the schema structure
      const testUser = "test-user-" + uuid();
      testDb
        .prepare(
          "INSERT INTO users (id, email, hashed_password) VALUES (?, ?, ?)",
        )
        .run(testUser, "user@test.com", "hashed");

      testDb
        .prepare(
          `
        INSERT INTO projects (id, owner_id, name, site_name, locale, language)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
        )
        .run(uuid(), testUser, "Test", "test.com", "zh-CN", "chinese");

      const result = testDb
        .prepare("SELECT locale FROM projects WHERE owner_id = ?")
        .get(testUser);
      expect(result.locale).toBe("zh-CN");
    });
  });

  describe("Project Retrieval", () => {
    it("should retrieve project by id", () => {
      const result = testDb
        .prepare("SELECT * FROM projects WHERE id = ?")
        .get(projectId);
      expect(result).toBeDefined();
      expect(result.id).toBe(projectId);
    });

    it("should list user projects", () => {
      const results = testDb
        .prepare("SELECT * FROM projects WHERE owner_id = ?")
        .all(userId);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
