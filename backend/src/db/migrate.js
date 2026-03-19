require("dotenv").config();
const { pool } = require("./postgres");
const logger = require("../utils/logger");

// ============================================================
// MIGRATIONS — run in order
// ============================================================

const migrations = [
  {
    version: 1,
    name: "create_players_table",
    up: `
      CREATE TABLE IF NOT EXISTS players (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address VARCHAR(42) UNIQUE,
        farcaster_fid  VARCHAR(64) UNIQUE,
        username       VARCHAR(64) NOT NULL DEFAULT 'Anonymous',
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_players_wallet ON players(wallet_address);
      CREATE INDEX IF NOT EXISTS idx_players_fid ON players(farcaster_fid);
    `,
    down: `DROP TABLE IF EXISTS players;`,
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
    down: `DROP TABLE IF EXISTS game_sessions;`,
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
    down: `DROP TABLE IF EXISTS leaderboard_entries;`,
  },
  {
    version: 4,
    name: "create_player_stats_table",
    up: `
      CREATE TABLE IF NOT EXISTS player_stats (
        player_id       UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
        current_streak  INTEGER NOT NULL DEFAULT 0,
        max_streak      INTEGER NOT NULL DEFAULT 0,
        total_wins      INTEGER NOT NULL DEFAULT 0,
        total_played    INTEGER NOT NULL DEFAULT 0,
        total_score     INTEGER NOT NULL DEFAULT 0,
        best_score      INTEGER NOT NULL DEFAULT 0,
        last_played     DATE,
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
    down: `DROP TABLE IF EXISTS player_stats;`,
  },
  {
    version: 5,
    name: "create_analytics_events_table",
    up: `
      CREATE TABLE IF NOT EXISTS analytics_events (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        player_id   UUID REFERENCES players(id) ON DELETE SET NULL,
        event_name  VARCHAR(64) NOT NULL,
        properties  JSONB NOT NULL DEFAULT '{}',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_events_name    ON analytics_events(event_name);
      CREATE INDEX IF NOT EXISTS idx_events_time    ON analytics_events(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_events_player  ON analytics_events(player_id);
    `,
    down: `DROP TABLE IF EXISTS analytics_events;`,
  },
  {
    version: 6,
    name: "create_schema_migrations_table_and_triggers",
    up: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     INTEGER PRIMARY KEY,
        name        VARCHAR(128) NOT NULL,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_players_updated_at') THEN
          CREATE TRIGGER trg_players_updated_at
            BEFORE UPDATE ON players
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sessions_updated_at') THEN
          CREATE TRIGGER trg_sessions_updated_at
            BEFORE UPDATE ON game_sessions
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_stats_updated_at') THEN
          CREATE TRIGGER trg_stats_updated_at
            BEFORE UPDATE ON player_stats
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
        END IF;
      END $$;
    `,
    down: `DROP TABLE IF EXISTS schema_migrations; DROP FUNCTION IF EXISTS update_updated_at CASCADE;`,
  },
];

// ============================================================
// Migration runner
// ============================================================

async function runMigrations(direction = "up") {
  const client = await pool.connect();
  try {
    // Bootstrap migrations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows: applied } = await client.query("SELECT version FROM schema_migrations");
    const appliedVersions = new Set(applied.map((r) => r.version));

    if (direction === "up") {
      for (const m of migrations) {
        if (appliedVersions.has(m.version)) {
          logger.debug(`Migration ${m.version} (${m.name}) already applied`);
          continue;
        }
        logger.info(`Applying migration ${m.version}: ${m.name}`);
        await client.query("BEGIN");
        await client.query(m.up);
        await client.query("INSERT INTO schema_migrations (version, name) VALUES ($1, $2)", [m.version, m.name]);
        await client.query("COMMIT");
        logger.info(`Migration ${m.version} applied successfully`);
      }
      logger.info("All migrations applied");
    } else {
      const toRollback = migrations.filter((m) => appliedVersions.has(m.version)).reverse()[0];
      if (!toRollback) { logger.info("Nothing to rollback"); return; }
      logger.info(`Rolling back migration ${toRollback.version}: ${toRollback.name}`);
      await client.query("BEGIN");
      await client.query(toRollback.down);
      await client.query("DELETE FROM schema_migrations WHERE version = $1", [toRollback.version]);
      await client.query("COMMIT");
      logger.info("Rollback complete");
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("Migration failed", { error: err.message });
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

const direction = process.argv[2] === "rollback" ? "down" : "up";
runMigrations(direction).catch((err) => {
  console.error("Fatal migration error:", err.message);
  process.exit(1);
});
