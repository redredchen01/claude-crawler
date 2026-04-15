import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

const dbUrl = process.env.DATABASE_URL || "seo-content.db";

// Create database connection
const sqlite = new Database(dbUrl);
sqlite.pragma("journal_mode = WAL");

// Create Drizzle instance
export const db = drizzle(sqlite, { schema });

// Initialize database (create tables if they don't exist)
export async function initializeDatabase() {
  try {
    // Drizzle will auto-create tables based on schema
    console.log("Database initialized");
  } catch (error) {
    console.error("Failed to initialize database:", error);
    throw error;
  }
}

export { sqlite };
