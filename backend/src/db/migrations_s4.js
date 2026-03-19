require("dotenv").config();
const { pool } = require("./postgres");

// ============================================================
// Sprint 4 Migration — Badge minting tables
// ============================================================

const migrations = [
  {
    version: 10,
    name: "create_badge_vouchers_table",
    sql: `
      CREATE TABLE IF NOT EXISTS badge_vouchers (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address VARCHAR(42) NOT NULL,
        achievement_id VARCHAR(64) NOT NULL,
        token_id       INTEGER NOT NULL,
        nonce          VARCHAR(66) NOT NULL,
        signature      VARCHAR(132) NOT NULL,
        used           BOOLEAN NOT NULL DEFAULT FALSE,
        expires_at     TIMESTAMPTZ NOT NULL,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_voucher_wallet_achievement UNIQUE (wallet_address, achievement_id)
      );
      CREATE INDEX IF NOT EXISTS idx_vouchers_wallet ON badge_vouchers(wallet_address);
    `,
  },
  {
    version: 11,
    name: "create_badge_mints_table",
    sql: `
      CREATE TABLE IF NOT EXISTS badge_mints (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address VARCHAR(42) NOT NULL,
        achievement_id VARCHAR(64) NOT NULL,
        token_id       INTEGER NOT NULL,
        tx_hash        VARCHAR(66),
        minted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_badge_mint UNIQUE (wallet_address, achievement_id)
      );
      CREATE INDEX IF NOT EXISTS idx_mints_wallet ON badge_mints(wallet_address);
      CREATE INDEX IF NOT EXISTS idx_mints_achievement ON badge_mints(achievement_id);
    `,
  },
];

(async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    INTEGER PRIMARY KEY,
        name       VARCHAR(128) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const { rows } = await client.query("SELECT version FROM schema_migrations");
    const applied  = new Set(rows.map(r => r.version));

    for (const m of migrations) {
      if (applied.has(m.version)) {
        console.log(`Migration ${m.version} already applied`);
        continue;
      }
      await client.query("BEGIN");
      await client.query(m.sql);
      await client.query(
        "INSERT INTO schema_migrations(version, name) VALUES($1, $2)",
        [m.version, m.name]
      );
      await client.query("COMMIT");
      console.log(`✅ Migration ${m.version} (${m.name}) applied`);
    }
    console.log("Sprint 4 migrations complete");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
