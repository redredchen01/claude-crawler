/**
 * Database migration runner
 *
 * Executes SQL migration files to set up database schema
 */

import { readFileSync } from "fs";
import path from "path";
import { db } from "./index";

export async function runMigrations() {
  try {
    // Read migration file
    const migrationPath = path.resolve(
      __dirname,
      "migrations",
      "0001_add_tdk_fields.sql",
    );
    const migrationSQL = readFileSync(migrationPath, "utf-8");

    // Execute migration
    const statements = migrationSQL
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      db.run(statement);
    }

    console.log("✓ Database migrations completed successfully");
  } catch (error) {
    console.error("✗ Database migration failed:", error);
    throw error;
  }
}

// Run migrations if executed directly
if (require.main === module) {
  runMigrations().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
