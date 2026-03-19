require("dotenv").config();
const { pool } = require("./postgres");

// ============================================================
// Sprint 4C Migration — Persistent word list table
// Seeds all existing hardcoded words from wordEngine.js
// ============================================================

// Current word lists (copied verbatim so migration is self-contained)
const SEED_WORDS = {
  3: [
    "BTC","ETH","SOL","XRP","ADA","DOT","BNB","NFT","DAO","DEX",
    "CEX","GAS","POW","POS","APY","TVL","MEV","AMM","ICO","ATH",
    "FUD","ROI","DCA","RUG","KEY","BOT","ATL","TPS","KYC","AML",
  ],
  4: [
    "HODL","DAPP","HASH","MINT","BURN","DEFI","PUMP","DUMP","GWEI",
    "NODE","PEER","POOL","SWAP","FORK","NEAR","REKT","SATS","FIAT",
    "COLD","SEED","BULL","BEAR","MOON","APES","CHAD","NGMI","NONCE",
    "WBTC","USDC","LINK","CAKE","AAVE","COMP","LIDO","PENL",
  ],
  5: [
    "CHAIN","LAYER","TOKEN","STAKE","YIELD","BLOCK","MINER","VAULT",
    "NONCE","SHARD","SMART","RALLY","WHALE","FLOOR","ALPHA","DEGEN",
    "HALVE","LASER","PROOF","SONIC","PRICE","NODES","HEDGE","DELTA",
    "GAMMA","THETA","SIGMA","MULTI","CROSS","BATCH","PROXY","RELAY",
    "EPOCH","SLOSH","CHAOS","FRENS","BASED","GRIND","ALTCO","BEARS",
  ],
  6: [
    "WALLET","BRIDGE","ORACLE","ESCROW","LEDGER","HODLER","MINING",
    "TOKENS","MINTED","BURNED","LOCKED","STAKED","POOLED","FORKED",
    "HASHED","YIELDS","LAYERS","CHAINS","BLOCKS","VAULTS","SHARDS",
    "SMARTS","RALLYS","WHALES","FLOORS","ALPHAS","DEGENS","HALVES",
    "PROOFS","EPOCHS","HEDGES","DELTAS","MULTIS","RELAYS","BATCHS",
  ],
};

const migrations = [
  {
    version: 12,
    name: "create_word_lists_table",
    sql: `
      CREATE TABLE IF NOT EXISTS word_lists (
        id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        word       VARCHAR(12) NOT NULL,
        length     SMALLINT    NOT NULL CHECK (length IN (3,4,5,6)),
        active     BOOLEAN     NOT NULL DEFAULT TRUE,
        notes      TEXT,
        added_by   VARCHAR(64) NOT NULL DEFAULT 'system',
        added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        removed_at TIMESTAMPTZ,
        CONSTRAINT uq_word_length UNIQUE (word, length)
      );
      CREATE INDEX IF NOT EXISTS idx_wl_length_active ON word_lists(length, active);
    `,
  },
];

async function seed(client) {
  let inserted = 0;
  let skipped  = 0;
  for (const [len, words] of Object.entries(SEED_WORDS)) {
    for (const word of words) {
      const res = await client.query(
        `INSERT INTO word_lists (word, length, added_by)
         VALUES ($1, $2, 'seed')
         ON CONFLICT (word, length) DO NOTHING`,
        [word, parseInt(len)]
      );
      if (res.rowCount > 0) inserted++;
      else skipped++;
    }
  }
  console.log(`  Seeded: ${inserted} words inserted, ${skipped} already existed`);
}

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
      await seed(client);
      await client.query(
        "INSERT INTO schema_migrations(version, name) VALUES($1, $2)",
        [m.version, m.name]
      );
      await client.query("COMMIT");
      console.log(`✅ Migration ${m.version} (${m.name}) applied`);
    }
    console.log("Sprint 4C migrations complete");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
