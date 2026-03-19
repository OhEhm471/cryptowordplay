require("dotenv").config();
const { pool } = require("./postgres");

// ============================================================
// CONSOLIDATED MIGRATION RUNNER
// All 13 migrations in sequence — single source of truth.
// Supersedes: migrate.js, migrations_s3.js, migrations_s4.js,
//             migrations_s4c.js, migrations_s4d.js
//
// Usage:
//   node src/db/migrate_all.js          # apply all pending
//   node src/db/migrate_all.js rollback # rollback latest
//   node src/db/migrate_all.js status   # print applied versions
// ============================================================

// ── Word list seed data (used by migration 12) ────────────────
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

// ── All migrations ────────────────────────────────────────────
const migrations = [
  // ── Sprint 1-2: Core tables ────────────────────────────────
  {
    version: 1,
    name: "create_players_table",
    up: `
      CREATE TABLE IF NOT EXISTS players (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address VARCHAR(42) UNIQUE,
        farcaster_fid  VARCHAR(64) UNIQUE,
        username       VARCHAR(64) NOT NULL DEFAULT 'Anonymous',
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_players_wallet ON players(wallet_address);
      CREATE INDEX IF NOT EXISTS idx_players_fid    ON players(farcaster_fid);
    `,
    down: `DROP TABLE IF EXISTS players CASCADE;`,
  },
  {
    version: 2,
    name: "create_game_sessions_table",
    up: `
      CREATE TABLE IF NOT EXISTS game_sessions (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        player_id     UUID REFERENCES players(id) ON DELETE CASCADE,
        word_length   SMALLINT NOT NULL CHECK (word_length IN (3,4,5,6)),
        target_word   VARCHAR(6) NOT NULL,
        play_date     DATE NOT NULL DEFAULT CURRENT_DATE,
        guesses       JSONB NOT NULL DEFAULT '[]',
        evaluations   JSONB NOT NULL DEFAULT '[]',
        state         VARCHAR(16) NOT NULL DEFAULT 'playing'
                        CHECK (state IN ('playing','win','loss')),
        attempts_used SMALLINT NOT NULL DEFAULT 0,
        score         INTEGER NOT NULL DEFAULT 0,
        completed_at  TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_player_date_length UNIQUE (player_id, play_date, word_length)
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_player ON game_sessions(player_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_date   ON game_sessions(play_date);
      CREATE INDEX IF NOT EXISTS idx_sessions_state  ON game_sessions(state);
    `,
    down: `DROP TABLE IF EXISTS game_sessions CASCADE;`,
  },
  {
    version: 3,
    name: "create_leaderboard_table",
    up: `
      CREATE TABLE IF NOT EXISTS leaderboard_entries (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        player_id   UUID REFERENCES players(id) ON DELETE CASCADE,
        session_id  UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
        play_date   DATE NOT NULL DEFAULT CURRENT_DATE,
        word_length SMALLINT NOT NULL,
        score       INTEGER NOT NULL DEFAULT 0,
        attempts    SMALLINT NOT NULL,
        won         BOOLEAN NOT NULL DEFAULT FALSE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_lb_player_date_length UNIQUE (player_id, play_date, word_length)
      );
      CREATE INDEX IF NOT EXISTS idx_lb_date        ON leaderboard_entries(play_date);
      CREATE INDEX IF NOT EXISTS idx_lb_score       ON leaderboard_entries(score DESC);
      CREATE INDEX IF NOT EXISTS idx_lb_player_date ON leaderboard_entries(player_id, play_date);
    `,
    down: `DROP TABLE IF EXISTS leaderboard_entries CASCADE;`,
  },
  {
    version: 4,
    name: "create_player_stats_table",
    up: `
      CREATE TABLE IF NOT EXISTS player_stats (
        player_id      UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
        current_streak INTEGER NOT NULL DEFAULT 0,
        max_streak     INTEGER NOT NULL DEFAULT 0,
        total_wins     INTEGER NOT NULL DEFAULT 0,
        total_played   INTEGER NOT NULL DEFAULT 0,
        total_score    INTEGER NOT NULL DEFAULT 0,
        best_score     INTEGER NOT NULL DEFAULT 0,
        last_played    DATE,
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_stats_score       ON player_stats(total_score DESC);
      CREATE INDEX IF NOT EXISTS idx_stats_last_played ON player_stats(last_played);
      CREATE INDEX IF NOT EXISTS idx_stats_streak      ON player_stats(current_streak DESC);
    `,
    down: `DROP TABLE IF EXISTS player_stats CASCADE;`,
  },
  {
    version: 5,
    name: "create_analytics_events_table",
    up: `
      CREATE TABLE IF NOT EXISTS analytics_events (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        player_id  UUID REFERENCES players(id) ON DELETE SET NULL,
        event_name VARCHAR(64) NOT NULL,
        properties JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_events_name   ON analytics_events(event_name);
      CREATE INDEX IF NOT EXISTS idx_events_time   ON analytics_events(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_events_player ON analytics_events(player_id);
    `,
    down: `DROP TABLE IF EXISTS analytics_events CASCADE;`,
  },
  {
    version: 6,
    name: "create_triggers",
    up: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    INTEGER PRIMARY KEY,
        name       VARCHAR(128) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
      $$ LANGUAGE plpgsql;

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_players_updated_at') THEN
          CREATE TRIGGER trg_players_updated_at
            BEFORE UPDATE ON players FOR EACH ROW EXECUTE FUNCTION update_updated_at();
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sessions_updated_at') THEN
          CREATE TRIGGER trg_sessions_updated_at
            BEFORE UPDATE ON game_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_stats_updated_at') THEN
          CREATE TRIGGER trg_stats_updated_at
            BEFORE UPDATE ON player_stats FOR EACH ROW EXECUTE FUNCTION update_updated_at();
        END IF;
      END $$;
    `,
    down: `DROP TABLE IF EXISTS schema_migrations; DROP FUNCTION IF EXISTS update_updated_at CASCADE;`,
  },

  // ── Sprint 3: Achievements, notifications ──────────────────
  {
    version: 7,
    name: "create_player_achievements_table",
    up: `
      CREATE TABLE IF NOT EXISTS player_achievements (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        player_id      UUID REFERENCES players(id) ON DELETE CASCADE,
        achievement_id VARCHAR(64) NOT NULL,
        unlocked_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_player_achievement UNIQUE (player_id, achievement_id)
      );
      CREATE INDEX IF NOT EXISTS idx_achievements_player ON player_achievements(player_id);
      CREATE INDEX IF NOT EXISTS idx_achievements_id     ON player_achievements(achievement_id);
    `,
    down: `DROP TABLE IF EXISTS player_achievements CASCADE;`,
  },
  {
    version: 8,
    name: "create_notification_tokens_table",
    up: `
      CREATE TABLE IF NOT EXISTS player_notification_tokens (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        farcaster_fid      VARCHAR(64) NOT NULL,
        notification_token VARCHAR(256) NOT NULL,
        notification_url   VARCHAR(512),
        is_active          BOOLEAN NOT NULL DEFAULT TRUE,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_fid_token UNIQUE (farcaster_fid, notification_token)
      );
      CREATE INDEX IF NOT EXISTS idx_notif_fid    ON player_notification_tokens(farcaster_fid);
      CREATE INDEX IF NOT EXISTS idx_notif_active ON player_notification_tokens(is_active);
    `,
    down: `DROP TABLE IF EXISTS player_notification_tokens CASCADE;`,
  },
  {
    version: 9,
    name: "add_share_count_to_player_stats",
    up:   `ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS share_count INTEGER NOT NULL DEFAULT 0;`,
    down: `ALTER TABLE player_stats DROP COLUMN IF EXISTS share_count;`,
  },

  // ── Sprint 4: Badge minting ────────────────────────────────
  {
    version: 10,
    name: "create_badge_vouchers_table",
    up: `
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
    down: `DROP TABLE IF EXISTS badge_vouchers CASCADE;`,
  },
  {
    version: 11,
    name: "create_badge_mints_table",
    up: `
      CREATE TABLE IF NOT EXISTS badge_mints (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address VARCHAR(42) NOT NULL,
        achievement_id VARCHAR(64) NOT NULL,
        token_id       INTEGER NOT NULL,
        tx_hash        VARCHAR(66),
        minted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_badge_mint UNIQUE (wallet_address, achievement_id)
      );
      CREATE INDEX IF NOT EXISTS idx_mints_wallet      ON badge_mints(wallet_address);
      CREATE INDEX IF NOT EXISTS idx_mints_achievement ON badge_mints(achievement_id);
    `,
    down: `DROP TABLE IF EXISTS badge_mints CASCADE;`,
  },

  // ── Sprint 4C: Persistent word lists ──────────────────────
  {
    version: 12,
    name: "create_word_lists_table",
    up: `
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
    down: `DROP TABLE IF EXISTS word_lists CASCADE;`,
    // Seed function runs after this migration (see runner below)
    seed: true,
  },

  // ── Sprint 4D: A/B testing ─────────────────────────────────
  {
    version: 13,
    name: "create_ab_testing_tables",
    up: `
      CREATE TABLE IF NOT EXISTS ab_experiments (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        slug        VARCHAR(64) NOT NULL UNIQUE,
        name        VARCHAR(128) NOT NULL,
        description TEXT,
        status      VARCHAR(16) NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','active','paused','archived')),
        traffic_pct SMALLINT    NOT NULL DEFAULT 100
                      CHECK (traffic_pct BETWEEN 0 AND 100),
        variants    JSONB       NOT NULL DEFAULT '[]',
        goal_metric VARCHAR(64) NOT NULL DEFAULT 'game_won',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at  TIMESTAMPTZ,
        ended_at    TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS ab_assignments (
        id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        experiment_id UUID        NOT NULL REFERENCES ab_experiments(id) ON DELETE CASCADE,
        identity_key  VARCHAR(128) NOT NULL,
        identity_type VARCHAR(16) NOT NULL DEFAULT 'player'
                        CHECK (identity_type IN ('player','anonymous')),
        variant_id    VARCHAR(64) NOT NULL,
        assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_ab_assignment UNIQUE (experiment_id, identity_key)
      );
      CREATE INDEX IF NOT EXISTS idx_ab_assignments_exp ON ab_assignments(experiment_id);
      CREATE INDEX IF NOT EXISTS idx_ab_assignments_key ON ab_assignments(identity_key);

      CREATE TABLE IF NOT EXISTS ab_events (
        id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        assignment_id UUID        NOT NULL REFERENCES ab_assignments(id) ON DELETE CASCADE,
        experiment_id UUID        NOT NULL,
        variant_id    VARCHAR(64) NOT NULL,
        event_name    VARCHAR(64) NOT NULL,
        properties    JSONB       NOT NULL DEFAULT '{}',
        occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_ab_events_exp     ON ab_events(experiment_id);
      CREATE INDEX IF NOT EXISTS idx_ab_events_variant ON ab_events(experiment_id, variant_id);

      INSERT INTO ab_experiments (slug, name, description, status, traffic_pct, variants, goal_metric)
      VALUES
        ('max_attempts', 'Max Attempts: 4 vs 5',
         'Test whether 5 attempts improves win rate without hurting engagement.',
         'draft', 50,
         '[{"id":"control","name":"4 Attempts (current)","weight":50},{"id":"treatment","name":"5 Attempts","weight":50}]',
         'game_won'),
        ('default_word_length', 'Default Word Length: 4L vs 5L',
         'Test whether 4-letter words improve day-2 retention for new users.',
         'draft', 100,
         '[{"id":"control","name":"5 Letters (current)","weight":50},{"id":"four_letters","name":"4 Letters","weight":50}]',
         'game_won'),
        ('score_multiplier', 'Score Multiplier: 1× vs 1.5×',
         'Test whether a new-player score boost increases streak formation.',
         'draft', 30,
         '[{"id":"control","name":"Standard scoring","weight":50},{"id":"boosted","name":"1.5× boost","weight":50}]',
         'game_won')
      ON CONFLICT (slug) DO NOTHING;
    `,
    down: `
      DROP TABLE IF EXISTS ab_events CASCADE;
      DROP TABLE IF EXISTS ab_assignments CASCADE;
      DROP TABLE IF EXISTS ab_experiments CASCADE;
    `,
  },
];

// ── Seed function for migration 12 ───────────────────────────
async function seedWordLists(client) {
  let inserted = 0, skipped = 0;
  for (const [len, words] of Object.entries(SEED_WORDS)) {
    for (const word of words) {
      const { rowCount } = await client.query(
        `INSERT INTO word_lists (word, length, added_by)
         VALUES ($1, $2, 'seed')
         ON CONFLICT (word, length) DO NOTHING`,
        [word, parseInt(len)]
      );
      rowCount > 0 ? inserted++ : skipped++;
    }
  }
  console.log(`  Seeded word_lists: ${inserted} inserted, ${skipped} already existed`);
}

// ── Migration runner ──────────────────────────────────────────
async function runMigrations(direction = "up") {
  const client = await pool.connect();
  try {
    // Bootstrap migrations table first
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    INTEGER PRIMARY KEY,
        name       VARCHAR(128) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows } = await client.query("SELECT version FROM schema_migrations ORDER BY version");
    const applied  = new Set(rows.map(r => r.version));

    if (direction === "status") {
      console.log(`\nApplied migrations (${applied.size}/${migrations.length}):`);
      for (const m of migrations) {
        const tick = applied.has(m.version) ? "✅" : "⬜";
        const when = rows.find(r => r.version === m.version)?.applied_at?.toISOString().slice(0, 10) || "";
        console.log(`  ${tick}  v${m.version.toString().padStart(2, "0")}  ${m.name}  ${when}`);
      }
      console.log();
      return;
    }

    if (direction === "up") {
      let count = 0;
      for (const m of migrations) {
        if (applied.has(m.version)) {
          console.log(`  ✓  v${m.version.toString().padStart(2, "0")} ${m.name} (already applied)`);
          continue;
        }
        await client.query("BEGIN");
        await client.query(m.up);
        if (m.seed) await seedWordLists(client);
        await client.query(
          "INSERT INTO schema_migrations (version, name) VALUES ($1, $2)",
          [m.version, m.name]
        );
        await client.query("COMMIT");
        console.log(`  ✅  v${m.version.toString().padStart(2, "0")} ${m.name}`);
        count++;
      }
      console.log(`\n${count > 0 ? `✅ ${count} migration(s) applied` : "✓ Already up to date"}`);

    } else if (direction === "down") {
      const latest = [...migrations].reverse().find(m => applied.has(m.version));
      if (!latest) { console.log("Nothing to rollback"); return; }
      if (!latest.down) { console.log(`Migration ${latest.version} has no rollback`); return; }
      await client.query("BEGIN");
      await client.query(latest.down);
      await client.query("DELETE FROM schema_migrations WHERE version = $1", [latest.version]);
      await client.query("COMMIT");
      console.log(`✅ Rolled back v${latest.version} (${latest.name})`);
    }

  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("❌ Migration failed:", err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

const cmd = process.argv[2];
const direction = cmd === "rollback" ? "down" : cmd === "status" ? "status" : "up";

runMigrations(direction).catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
