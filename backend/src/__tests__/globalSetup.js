// ============================================================
// Jest globalSetup — runs ONCE before the entire test suite.
// Applies all DB migrations to the test database.
// Skips silently if DATABASE_URL is unreachable (e.g. unit/mock runs).
// ============================================================

const path = require("path");

// Load test env first
require("dotenv").config({ path: path.join(__dirname, "../../.env.test") });
require("dotenv").config();

module.exports = async function globalSetup() {
  if (!process.env.DATABASE_URL) return;

  const { Pool } = require("pg");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 3000,
  });

  try {
    await pool.query("SELECT 1");
  } catch {
    // DB not available — unit and mock tests don't need it
    await pool.end().catch(() => {});
    return;
  }

  try {
    const { execSync } = require("child_process");
    const runner = path.join(__dirname, "../../db/migrate_all.js");
    execSync(`node "${runner}"`, {
      env:   { ...process.env },
      stdio: "pipe",
    });
    console.log("\n✅ Test DB migrations applied\n");
  } finally {
    await pool.end().catch(() => {});
  }
};
