require("dotenv").config();
const { pool } = require("./postgres");

// ============================================================
// Sprint 4D Migration — A/B Testing Framework
// ============================================================

const migrations = [
  {
    version: 13,
    name: "create_ab_testing_tables",
    sql: `
      -- Experiments definition
      CREATE TABLE IF NOT EXISTS ab_experiments (
        id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        slug         VARCHAR(64) NOT NULL UNIQUE,
        name         VARCHAR(128) NOT NULL,
        description  TEXT,
        status       VARCHAR(16) NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','active','paused','archived')),
        traffic_pct  SMALLINT    NOT NULL DEFAULT 100
                       CHECK (traffic_pct BETWEEN 0 AND 100),
        variants     JSONB       NOT NULL DEFAULT '[]',
        goal_metric  VARCHAR(64) NOT NULL DEFAULT 'game_won',
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at   TIMESTAMPTZ,
        ended_at     TIMESTAMPTZ
      );

      -- One assignment per (experiment, identity) — stable once assigned
      CREATE TABLE IF NOT EXISTS ab_assignments (
        id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        experiment_id UUID        NOT NULL REFERENCES ab_experiments(id) ON DELETE CASCADE,
        identity_key  VARCHAR(128) NOT NULL,  -- player_id UUID or anon session UUID
        identity_type VARCHAR(16) NOT NULL DEFAULT 'player'
                        CHECK (identity_type IN ('player','anonymous')),
        variant_id    VARCHAR(64) NOT NULL,
        assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_ab_assignment UNIQUE (experiment_id, identity_key)
      );
      CREATE INDEX IF NOT EXISTS idx_ab_assignments_exp ON ab_assignments(experiment_id);
      CREATE INDEX IF NOT EXISTS idx_ab_assignments_key ON ab_assignments(identity_key);

      -- Goal conversions — one row per tracked event per assignment
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

      -- Seed three starter experiments (status=draft so nothing is live yet)
      INSERT INTO ab_experiments (slug, name, description, status, traffic_pct, variants, goal_metric)
      VALUES
        (
          'max_attempts',
          'Max Attempts: 4 vs 5',
          'Test whether giving players 5 attempts (vs current 4) improves win rate and retention without hurting engagement.',
          'draft', 50,
          '[{"id":"control","name":"4 Attempts (current)","weight":50},{"id":"treatment","name":"5 Attempts","weight":50}]',
          'game_won'
        ),
        (
          'default_word_length',
          'Default Word Length: 4L vs 5L',
          'Test whether starting new users on 4-letter words (easier) improves day-2 retention vs current 5-letter default.',
          'draft', 100,
          '[{"id":"control","name":"5 Letters (current)","weight":50},{"id":"four_letters","name":"4 Letters","weight":50}]',
          'game_won'
        ),
        (
          'score_multiplier',
          'Score Multiplier: 1× vs 1.5×',
          'Test whether a 1.5× score multiplier for the first 7 days increases engagement and streak formation.',
          'draft', 30,
          '[{"id":"control","name":"Standard scoring","weight":50},{"id":"boosted","name":"1.5× new-player boost","weight":50}]',
          'game_won'
        )
      ON CONFLICT (slug) DO NOTHING;
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
      if (applied.has(m.version)) { console.log(`Migration ${m.version} already applied`); continue; }
      await client.query("BEGIN");
      await client.query(m.sql);
      await client.query("INSERT INTO schema_migrations(version,name) VALUES($1,$2)", [m.version, m.name]);
      await client.query("COMMIT");
      console.log(`✅ Migration ${m.version} (${m.name}) applied`);
    }
    console.log("Sprint 4D migrations complete");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
