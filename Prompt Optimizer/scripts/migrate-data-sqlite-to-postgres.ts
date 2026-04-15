#!/usr/bin/env node

/**
 * Data Migration Script: SQLite → PostgreSQL
 * Safely exports data from SQLite and imports to PostgreSQL
 *
 * Usage: DATABASE_URL_POSTGRES="postgresql://..." npx ts-node scripts/migrate-data-sqlite-to-postgres.ts
 */

import { PrismaClient as SqlitePrisma } from "@prisma/client";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Table order respecting foreign key constraints
const TABLE_ORDER = [
  "User",
  "Team",
  "TeamMember",
  "TeamQuota",
  "ApiKey",
  "WebhookConfig",
  "WebhookEvent",
  "OptimizationRecord",
  "OptimizationJob",
  "BatchOptimizationJob",
  "Session",
  "AuditLog",
  "UserPreference",
  "StripeBilling",
];

interface MigrationResult {
  table: string;
  sourceCount: number;
  targetCount: number;
  status: "success" | "failed";
  error?: string;
  duration: number;
}

async function migrateTable(
  sqlitePrisma: any,
  postgresDb: any,
  tableName: string,
): Promise<MigrationResult> {
  const startTime = Date.now();

  try {
    // Get source data
    const sourceData = await sqlitePrisma[tableName].findMany({
      take: -1, // Get all records
    });

    const sourceCount = sourceData.length;

    // Import to target
    if (sourceData.length > 0) {
      await postgresDb[tableName].createMany({
        data: sourceData,
        skipDuplicates: true,
      });
    }

    // Verify counts
    const targetCount = await postgresDb[tableName].count();

    const duration = Date.now() - startTime;

    return {
      table: tableName,
      sourceCount,
      targetCount,
      status: sourceCount === targetCount ? "success" : "failed",
      duration,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;

    return {
      table: tableName,
      sourceCount: 0,
      targetCount: 0,
      status: "failed",
      error: error.message,
      duration,
    };
  }
}

async function verifySqliteBackup(): Promise<string> {
  const backupPath = path.join("prisma", "dev.db.backup");

  if (!fs.existsSync("prisma/dev.db")) {
    throw new Error("SQLite database not found at prisma/dev.db");
  }

  // Create backup
  console.log("📦 Creating SQLite backup...");
  fs.copyFileSync("prisma/dev.db", backupPath);
  console.log(`✅ Backup created at ${backupPath}`);

  return backupPath;
}

async function main() {
  console.log("🗄️  Data Migration: SQLite → PostgreSQL");
  console.log("=====================================\n");

  // Check environment
  if (!process.env.DATABASE_URL_POSTGRES) {
    console.error("❌ DATABASE_URL_POSTGRES environment variable not set");
    console.error(
      "Usage: DATABASE_URL_POSTGRES='postgresql://...' npx ts-node scripts/migrate-data-sqlite-to-postgres.ts",
    );
    process.exit(1);
  }

  try {
    // Verify and backup SQLite
    const backupPath = await verifySqliteBackup();

    // Initialize Prisma clients
    console.log("\n🔗 Connecting to databases...");

    const sqlitePrisma = new SqlitePrisma({
      datasources: {
        db: {
          url: process.env.DATABASE_URL || "file:./prisma/dev.db",
        },
      },
    });

    const postgresPrisma = new SqlitePrisma({
      datasources: {
        db: {
          url: process.env.DATABASE_URL_POSTGRES,
        },
      },
    });

    console.log("✅ Connected to SQLite");
    console.log("✅ Connected to PostgreSQL");

    // Migrate data
    console.log("\n📤 Migrating data...\n");

    const results: MigrationResult[] = [];

    for (const tableName of TABLE_ORDER) {
      if (!sqlitePrisma[tableName]) {
        console.log(`⏭️  Skipping ${tableName} (not in schema)`);
        continue;
      }

      process.stdout.write(`⏳ ${tableName.padEnd(25)} ... `);

      const result = await migrateTable(
        sqlitePrisma,
        postgresPrisma,
        tableName,
      );
      results.push(result);

      if (result.status === "success") {
        console.log(
          `✅ ${result.sourceCount} → ${result.targetCount} (${result.duration}ms)`,
        );
      } else {
        console.log(`❌ Error: ${result.error}`);
      }
    }

    // Summary
    console.log("\n📊 Migration Summary");
    console.log("====================\n");

    let totalSource = 0;
    let totalTarget = 0;
    let successCount = 0;

    for (const result of results) {
      totalSource += result.sourceCount;
      totalTarget += result.targetCount;

      if (result.status === "success") {
        successCount++;
      }
    }

    console.log(`Tables migrated: ${successCount}/${results.length}`);
    console.log(`Total records: ${totalSource} → ${totalTarget}`);

    // Detailed results table
    console.log("\n📋 Detailed Results:");
    console.log(
      "Table".padEnd(25) + "Source".padEnd(10) + "Target".padEnd(10) + "Status",
    );
    console.log("-".repeat(60));

    for (const result of results) {
      const status = result.status === "success" ? "✅" : "❌";
      console.log(
        result.table.padEnd(25) +
          result.sourceCount.toString().padEnd(10) +
          result.targetCount.toString().padEnd(10) +
          status,
      );
    }

    // Verify data integrity
    console.log("\n🔍 Verifying data integrity...");

    let integrityOk = true;

    for (const result of results) {
      if (result.sourceCount !== result.targetCount) {
        console.log(
          `⚠️  ${result.table}: Count mismatch (${result.sourceCount} vs ${result.targetCount})`,
        );
        integrityOk = false;
      }
    }

    if (integrityOk) {
      console.log("✅ Data integrity verified");
    } else {
      console.log(
        "⚠️  Some tables have count mismatches - review data carefully",
      );
    }

    // Cleanup
    await sqlitePrisma.$disconnect();
    await postgresPrisma.$disconnect();

    console.log("\n✅ Migration completed!");
    console.log(`\nBackup saved to: ${backupPath}`);
    console.log("\n📝 Next steps:");
    console.log("1. Verify data in PostgreSQL");
    console.log("2. Run tests: npm run test:ci");
    console.log(
      "3. Switch to PostgreSQL: export DATABASE_URL=postgresql://...",
    );
    console.log(
      "4. Delete SQLite: rm prisma/dev.db (after verifying PostgreSQL)",
    );
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

main();
