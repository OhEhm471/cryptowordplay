const db = require("../db/postgres");
const cache = require("../db/redis");
const logger = require("../utils/logger");

// ============================================================
// PLAYER SERVICE
// ============================================================

/**
 * Upsert player by wallet address (primary identity)
 */
async function upsertByWallet(walletAddress, username) {
  const normalized = walletAddress.toLowerCase();
  const { rows } = await db.query(
    `INSERT INTO players (wallet_address, username)
     VALUES ($1, $2)
     ON CONFLICT (wallet_address) DO UPDATE
       SET username   = EXCLUDED.username,
           updated_at = NOW()
     RETURNING *`,
    [normalized, username || truncateAddress(normalized)]
  );

  const player = rows[0];
  await ensureStats(player.id);
  await cache.del(cache.KEYS.playerStats(player.id));
  return player;
}

/**
 * Upsert player by Farcaster FID
 */
async function upsertByFarcaster(fid, username) {
  const { rows } = await db.query(
    `INSERT INTO players (farcaster_fid, username)
     VALUES ($1, $2)
     ON CONFLICT (farcaster_fid) DO UPDATE
       SET username   = EXCLUDED.username,
           updated_at = NOW()
     RETURNING *`,
    [String(fid), username || `fc:${fid}`]
  );

  const player = rows[0];
  await ensureStats(player.id);
  await cache.del(cache.KEYS.playerStats(player.id));
  return player;
}

/**
 * Get player by ID
 */
async function getById(playerId) {
  const { rows } = await db.query("SELECT * FROM players WHERE id = $1", [playerId]);
  return rows[0] || null;
}

/**
 * Get or create anonymous player (session-based, no wallet)
 * Used as fallback when wallet auth is not available
 */
async function upsertAnonymous(sessionToken, username) {
  const { rows } = await db.query(
    `INSERT INTO players (username)
     VALUES ($1)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [username || "Anonymous"]
  );
  if (rows[0]) {
    await ensureStats(rows[0].id);
    return rows[0];
  }
  return null;
}

/**
 * Ensure player_stats row exists
 */
async function ensureStats(playerId) {
  await db.query(
    `INSERT INTO player_stats (player_id) VALUES ($1)
     ON CONFLICT (player_id) DO NOTHING`,
    [playerId]
  );
}

/**
 * Get player stats with cache
 */
async function getStats(playerId) {
  const cacheKey = cache.KEYS.playerStats(playerId);
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const { rows } = await db.query(
    `SELECT ps.*, p.username, p.wallet_address, p.farcaster_fid
     FROM player_stats ps
     JOIN players p ON p.id = ps.player_id
     WHERE ps.player_id = $1`,
    [playerId]
  );

  const stats = rows[0] || null;
  if (stats) await cache.set(cacheKey, stats, 60);
  return stats;
}

/**
 * Update stats after a game completes
 */
async function updateStats({ playerId, won, score, streakCount }) {
  const today = new Date().toISOString().split("T")[0];
  await db.query(
    `UPDATE player_stats SET
       total_played   = total_played + 1,
       total_wins     = total_wins + $2,
       total_score    = total_score + $3,
       best_score     = GREATEST(best_score, $3),
       current_streak = $4,
       max_streak     = GREATEST(max_streak, $4),
       last_played    = $5,
       updated_at     = NOW()
     WHERE player_id = $1`,
    [playerId, won ? 1 : 0, score, streakCount, today]
  );
  await cache.del(cache.KEYS.playerStats(playerId));
}

function truncateAddress(addr) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/**
 * Update a player's username by their id.
 * Works regardless of auth method (wallet, Farcaster, anonymous).
 */
async function updateUsername(playerId, username) {
  const { rows } = await db.query(
    `UPDATE players SET username = $1, updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [username, playerId]
  );
  await cache.del(cache.KEYS.playerStats(playerId));
  return rows[0] || null;
}

module.exports = {
  upsertByWallet,
  upsertByFarcaster,
  upsertAnonymous,
  getById,
  getStats,
  updateStats,
  updateUsername,
  ensureStats,
};
