import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

let pool: Pool | null = null;
let db: ReturnType<typeof drizzle> | null = null;

/**
 * 初始化数据库连接池
 */
export function initializeDatabase() {
  if (db) {
    console.log("[Database] Already initialized");
    return db;
  }

  const databaseUrl =
    process.env.DATABASE_URL ||
    "postgresql://user:password@localhost:5432/seo_crawler";

  pool = new Pool({
    connectionString: databaseUrl,
    max: parseInt(process.env.DB_POOL_MAX || "10"),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || "30000"),
    connectionTimeoutMillis: parseInt(
      process.env.DB_CONNECTION_TIMEOUT || "2000",
    ),
  });

  pool.on("error", (err) => {
    console.error("[Database] Unexpected error on idle client", err);
  });

  db = drizzle(pool, { schema });
  console.log("[Database] Connected to PostgreSQL");

  return db;
}

/**
 * 获取数据库实例
 */
export function getDatabase() {
  if (!db) {
    throw new Error(
      "Database not initialized. Call initializeDatabase() first.",
    );
  }
  return db;
}

/**
 * 获取连接池
 */
export function getPool() {
  if (!pool) {
    throw new Error(
      "Database pool not initialized. Call initializeDatabase() first.",
    );
  }
  return pool;
}

/**
 * 健康检查
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const result = await getDatabase().execute("SELECT 1");
    return true;
  } catch (err) {
    console.error("[Database] Health check failed:", err);
    return false;
  }
}

/**
 * 关闭数据库连接
 */
export async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
    console.log("[Database] Connection closed");
  }
}

/**
 * 执行原始 SQL 查询
 */
export async function execute(sql: string, params?: any[]) {
  const client = await getPool().connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

export default db;
