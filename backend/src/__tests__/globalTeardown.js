// ============================================================
// Jest globalTeardown — runs ONCE after the entire test suite.
// ============================================================

const path = require("path");

module.exports = async function globalTeardown() {
  // Close the pg pool so Jest exits cleanly (without --forceExit)
  try {
    // Only the db module will have opened a pool — grab it if loaded
    const db = require(path.join(__dirname, "../db/postgres"));
    if (db.pool && typeof db.pool.end === "function") {
      await db.pool.end();
    }
  } catch {
    // Module may not have been loaded (unit/mock runs) — ignore
  }
  console.log("✅ Test suite complete");
};
