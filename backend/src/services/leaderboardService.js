const db = require("../db/postgres");
const cache = require("../db/redis");
const logger = require("../utils/logger");

const DAILY_TTL  = 300;  // 5 minutes
const ALLTIME_TTL = 120; // 2 minutes

// ============================================================
// LEADERBOARD SERVICE
// ============================================================

/**
 * Get daily leaderboard for a specific date
 */
async function getDailyLeaderboard(date, limit = 50) {
  const cacheKey = cache.KEYS.leaderboardDaily(date);
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const { rows } = await db.query(
    `SELECT
       p.id              AS player_id,
       p.username,
       p.wallet_address,
       p.farcaster_fid,
       le.score,
       le.attempts,
       le.won,
       le.word_length,
       ps.current_streak AS streak,
       ROW_NUMBER() OVER (ORDER BY le.score DESC, le.attempts ASC, le.created_at ASC) AS rank
     FROM leaderboard_entries le
     JOIN players p      ON p.id = le.player_id
     LEFT JOIN player_stats ps ON ps.player_id = le.player_id
     WHERE le.play_date = $1
     ORDER BY le.score DESC, le.attempts ASC, le.created_at ASC
     LIMIT $2`,
    [date, limit]
  );

  await cache.set(cacheKey, rows, DAILY_TTL);
  return rows;
}

/**
 * Get all-time leaderboard
 */
async function getAllTimeLeaderboard(limit = 50) {
  const cacheKey = cache.KEYS.leaderboardAllTime();
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const { rows } = await db.query(
    `SELECT
       p.id            AS player_id,
       p.username,
       p.wallet_address,
       p.farcaster_fid,
       ps.total_score  AS score,
       ps.total_wins   AS wins,
       ps.total_played AS played,
       ps.current_streak AS streak,
       ps.best_score,
       ROW_NUMBER() OVER (ORDER BY ps.total_score DESC) AS rank
     FROM player_stats ps
     JOIN players p ON p.id = ps.player_id
     WHERE ps.total_played > 0
     ORDER BY ps.total_score DESC
     LIMIT $1`,
    [limit]
  );

  await cache.set(cacheKey, rows, ALLTIME_TTL);
  return rows;
}

/**
 * Get a player's rank on a specific date
 */
async function getPlayerRank(playerId, date) {
  const { rows } = await db.query(
    `SELECT COUNT(*) + 1 AS rank
     FROM leaderboard_entries le
     WHERE le.play_date = $1
       AND le.score > (
         SELECT COALESCE(score, 0)
         FROM leaderboard_entries
         WHERE player_id = $2 AND play_date = $1
       )`,
    [date, playerId]
  );
  return parseInt(rows[0]?.rank || 0);
}

/**
 * Submit a completed game to the leaderboard
 * Prevents duplicate submissions per player per day per word length
 */
async function submitScore({ playerId, sessionId, score, attempts, won, wordLength, date }) {
  try {
    await db.query(
      `INSERT INTO leaderboard_entries
         (player_id, session_id, play_date, word_length, score, attempts, won)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (player_id, play_date, word_length) DO NOTHING`,
      [playerId, sessionId, date, wordLength, score, attempts, won]
    );

    // Bust leaderboard cache for that day
    await cache.del(cache.KEYS.leaderboardDaily(date));
    await cache.del(cache.KEYS.leaderboardAllTime());
  } catch (err) {
    logger.error("submitScore failed", { error: err.message, playerId });
    throw err;
  }
}

/**
 * Get nearby players (for leaderboard psychology — show ±3 positions)
 */
async function getNearbyPlayers(playerId, date, range = 3) {
  const rank = await getPlayerRank(playerId, date);
  const minRank = Math.max(1, rank - range);

  const { rows } = await db.query(
    `SELECT
       p.username,
       le.score,
       le.attempts,
       ROW_NUMBER() OVER (ORDER BY le.score DESC, le.attempts ASC) AS rank
     FROM leaderboard_entries le
     JOIN players p ON p.id = le.player_id
     WHERE le.play_date = $1
     ORDER BY le.score DESC, le.attempts ASC
     LIMIT $2 OFFSET $3`,
    [date, range * 2 + 1, Math.max(0, minRank - 1)]
  );

  return { rows, playerRank: rank };
}

module.exports = {
  getDailyLeaderboard,
  getAllTimeLeaderboard,
  getPlayerRank,
  submitScore,
  getNearbyPlayers,
};
