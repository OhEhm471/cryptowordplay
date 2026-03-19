// Sprint 3 migration additions — append to main migrate.js manually
// or run this standalone

require("dotenv").config();
const { pool } = require("./postgres");

const sprint3 = [
  {
    version: 7,
    name: "create_player_achievements_table",
    sql: `
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
  },
  {
    version: 8,
    name: "create_notification_tokens_table",
    sql: `
      CREATE TABLE IF NOT EXISTS player_notification_tokens (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        farcaster_fid       VARCHAR(64) NOT NULL,
        notification_token  VARCHAR(256) NOT NULL,
        notification_url    VARCHAR(512),
        is_active           BOOLEAN NOT NULL DEFAULT TRUE,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_fid_token UNIQUE (farcaster_fid, notification_token)
      );
      CREATE INDEX IF NOT EXISTS idx_notif_fid    ON player_notification_tokens(farcaster_fid);
      CREATE INDEX IF NOT EXISTS idx_notif_active ON player_notification_tokens(is_active);
    `,
  },
  {
    version: 9,
    name: "add_share_count_to_player_stats",
    sql: `ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS share_count INTEGER NOT NULL DEFAULT 0;`,
  },
];

(async () => {
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name VARCHAR(128) NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const { rows } = await client.query("SELECT version FROM schema_migrations");
    const applied  = new Set(rows.map(r => r.version));

    for (const m of sprint3) {
      if (applied.has(m.version)) { console.log(`Migration ${m.version} already applied`); continue; }
      await client.query("BEGIN");
      await client.query(m.sql);
      await client.query("INSERT INTO schema_migrations(version,name) VALUES($1,$2)", [m.version, m.name]);
      await client.query("COMMIT");
      console.log(`Migration ${m.version} (${m.name}) applied`);
    }
    console.log("Sprint 3 migrations complete");
  } finally {
    client.release();
    await pool.end();
  }
})().catch(err => { console.error(err.message); process.exit(1); });
