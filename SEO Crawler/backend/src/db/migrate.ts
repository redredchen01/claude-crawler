import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDatabase, getPool } from "./client";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Run pending migrations
 */
export async function runMigrations() {
  try {
    const pool = getPool();
    const migrationsFolder = path.join(__dirname, "migrations");

    console.log("[Migrations] Running migrations from:", migrationsFolder);

    await migrate(getDatabase(), {
      migrationsFolder,
    });

    console.log("[Migrations] ✅ All migrations completed successfully");
    return true;
  } catch (error) {
    console.error("[Migrations] ❌ Migration failed:", error);
    throw error;
  }
}

/**
 * Initialize database schema from scratch
 */
export async function initializeSchema() {
  try {
    const db = getDatabase();

    console.log("[Database] Initializing schema...");

    // Create extensions
    await db.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await db.execute('CREATE EXTENSION IF NOT EXISTS "citext"');

    console.log("[Database] ✅ Schema initialized successfully");
    return true;
  } catch (error) {
    console.error("[Database] ❌ Schema initialization failed:", error);
    throw error;
  }
}

// Run migrations if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await runMigrations();
    console.log("[Migrations] Done");
    process.exit(0);
  } catch (error) {
    console.error("[Migrations] Error:", error);
    process.exit(1);
  }
}
