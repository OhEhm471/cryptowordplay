// ============================================================
// Test helpers — shared across integration tests
//
// Uses the real pg pool and Redis client pointed at test
// databases (see .env.test or env vars in docker-compose.test.yml).
// Each test file calls resetDb() in beforeEach to start clean.
// ============================================================

require("dotenv").config({ path: require("path").join(__dirname, "../../.env.test") });
// Fall back to main .env if .env.test not present
require("dotenv").config();

const db    = require("../../db/postgres");
const cache = require("../../db/redis");

// ── Database helpers ───────────────────────────────────────────

/**
 * Truncate all game tables in reverse dependency order.
 * Runs before each integration test to ensure isolation.
 */
async function resetDb() {
  await db.query(`
    TRUNCATE
      ab_events,
      ab_assignments,
      ab_experiments,
      badge_mints,
      badge_vouchers,
      player_achievements,
      player_notification_tokens,
      analytics_events,
      leaderboard_entries,
      player_stats,
      game_sessions,
      word_lists,
      players
    RESTART IDENTITY CASCADE
  `);
  // Flush Redis so stale leaderboard/stats cache doesn't bleed between tests
  try {
    await cache.flushForTesting();
  } catch { /* Redis may not be available in all test environments */ }
}

/**
 * Create a player directly in the DB (bypasses auth).
 * Returns the player row.
 */
async function createPlayer({ wallet = null, fid = null, username = "TestPlayer" } = {}) {
  const addr = wallet || `0x${Math.random().toString(16).slice(2).padStart(40, "0")}`;
  const { rows } = await db.query(
    `INSERT INTO players (wallet_address, farcaster_fid, username)
     VALUES ($1, $2, $3) RETURNING *`,
    [addr, fid, username]
  );
  return rows[0];
}

/**
 * Create a minimal player_stats row.
 */
async function createPlayerStats(playerId, overrides = {}) {
  const { rows } = await db.query(
    `INSERT INTO player_stats
       (player_id, current_streak, max_streak, total_wins, total_played, total_score, best_score, last_played)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (player_id) DO UPDATE
       SET current_streak = EXCLUDED.current_streak,
           last_played    = EXCLUDED.last_played
     RETURNING *`,
    [
      playerId,
      overrides.current_streak ?? 0,
      overrides.max_streak     ?? 0,
      overrides.total_wins     ?? 0,
      overrides.total_played   ?? 0,
      overrides.total_score    ?? 0,
      overrides.best_score     ?? 0,
      overrides.last_played    ?? null,
    ]
  );
  return rows[0];
}

// ── App / request helpers ──────────────────────────────────────

const request = require("supertest");
const app     = require("../../app");

/**
 * Make an authenticated request using Farcaster FID header.
 * This bypasses wallet signature verification in tests.
 */
function authedRequest(fid = "test-fid-123", username = "TestPlayer") {
  return {
    get:    (url) => request(app).get(url).set("x-farcaster-fid", fid).set("x-username", username),
    post:   (url) => request(app).post(url).set("x-farcaster-fid", fid).set("x-username", username),
    patch:  (url) => request(app).patch(url).set("x-farcaster-fid", fid).set("x-username", username),
    delete: (url) => request(app).delete(url).set("x-farcaster-fid", fid).set("x-username", username),
  };
}

/**
 * Make an anonymous request (no auth headers).
 */
function anonRequest() {
  return {
    get:  (url) => request(app).get(url),
    post: (url) => request(app).post(url),
  };
}

// ── Seed word lists for a test ─────────────────────────────────

/**
 * Insert a small known word list into the DB so tests don't
 * depend on the fallback hardcoded lists.
 */
async function seedWords() {
  const words = {
    3: ["BTC","ETH","SOL","GAS","POW","POS"],
    4: ["HODL","HASH","MINT","BURN","DEFI","SWAP"],
    5: ["CHAIN","TOKEN","STAKE","BLOCK","MINER","VAULT"],
    6: ["WALLET","BRIDGE","ORACLE","ESCROW","LEDGER","MINING"],
  };
  for (const [len, list] of Object.entries(words)) {
    for (const word of list) {
      await db.query(
        `INSERT INTO word_lists (word, length, added_by)
         VALUES ($1, $2, 'test') ON CONFLICT DO NOTHING`,
        [word, parseInt(len)]
      );
    }
  }
  const wordEngine = require("../../services/wordEngine");
  await wordEngine.reloadWords();
}

// ── Teardown ───────────────────────────────────────────────────

async function closeConnections() {
  try { await db.pool.end(); } catch { /* ignore */ }
  // Redis client closes itself when idle; nothing to explicitly shut down
}

module.exports = {
  db,
  resetDb,
  createPlayer,
  createPlayerStats,
  seedWords,
  authedRequest,
  anonRequest,
  closeConnections,
};
