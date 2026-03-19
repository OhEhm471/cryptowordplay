const { Pool } = require("pg");
const logger = require("../utils/logger");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  min: parseInt(process.env.DB_POOL_MIN || "2"),
  max: parseInt(process.env.DB_POOL_MAX || "10"),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

pool.on("connect", () => {
  logger.debug("New PostgreSQL client connected");
});

pool.on("error", (err) => {
  logger.error("Unexpected PostgreSQL pool error", { error: err.message });
});

/**
 * Execute a parameterized query
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug("DB query executed", { duration, rows: result.rowCount });
    return result;
  } catch (err) {
    logger.error("DB query error", { error: err.message, query: text });
    throw err;
  }
}

/**
 * Execute within a transaction
 */
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Health check
 */
async function healthCheck() {
  try {
    const result = await query("SELECT NOW() as time");
    return { healthy: true, time: result.rows[0].time };
  } catch (err) {
    return { healthy: false, error: err.message };
  }
}

module.exports = { query, withTransaction, healthCheck, pool };
