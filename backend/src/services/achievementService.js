const db      = require("../db/postgres");
const cache   = require("../db/redis");
const logger  = require("../utils/logger");
const { ACHIEVEMENTS, ACHIEVEMENT_MAP } = require("./achievementDefinitions");

// ============================================================
// ACHIEVEMENT SERVICE
// ============================================================

/**
 * Check and unlock any newly earned achievements for a player.
 * Called after every completed game session.
 * Returns array of newly unlocked achievement objects.
 */
async function checkAndUnlock({ playerId, stats, session, ctx = {} }) {
  if (!playerId) return [];

  // Load already-unlocked IDs for this player
  const { rows } = await db.query(
    `SELECT achievement_id FROM player_achievements WHERE player_id = $1`,
    [playerId]
  );
  const unlocked = new Set(rows.map(r => r.achievement_id));

  const newlyUnlocked = [];

  for (const achievement of ACHIEVEMENTS) {
    if (unlocked.has(achievement.id)) continue;
    try {
      const earned = achievement.check(stats, session, ctx);
      if (earned) {
        await db.query(
          `INSERT INTO player_achievements (player_id, achievement_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [playerId, achievement.id]
        );
        newlyUnlocked.push(achievement);
        logger.info("Achievement unlocked", { playerId, achievementId: achievement.id });
      }
    } catch (err) {
      logger.debug("Achievement check error", { id: achievement.id, error: err.message });
    }
  }

  if (newlyUnlocked.length > 0) {
    await cache.del(`achievements:${playerId}`);
  }

  return newlyUnlocked;
}

/**
 * Get all achievements for a player (unlocked + locked)
 */
async function getPlayerAchievements(playerId) {
  const cacheKey = `achievements:${playerId}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const { rows } = await db.query(
    `SELECT achievement_id, unlocked_at
     FROM player_achievements
     WHERE player_id = $1`,
    [playerId]
  );

  const unlockedMap = Object.fromEntries(rows.map(r => [r.achievement_id, r.unlocked_at]));

  const result = ACHIEVEMENTS.map(a => ({
    ...a,
    unlocked:    !!unlockedMap[a.id],
    unlockedAt:  unlockedMap[a.id] || null,
  }));

  await cache.set(cacheKey, result, 120);
  return result;
}

/**
 * Get count of achievements unlocked by a player
 */
async function getUnlockCount(playerId) {
  const { rows } = await db.query(
    `SELECT COUNT(*) AS count FROM player_achievements WHERE player_id = $1`,
    [playerId]
  );
  return parseInt(rows[0]?.count || 0);
}

/**
 * Get global achievement unlock rates (for display)
 */
async function getGlobalStats() {
  const cacheKey = "achievements:global_stats";
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const { rows } = await db.query(`
    SELECT
      achievement_id,
      COUNT(*) AS unlock_count,
      COUNT(*) * 100.0 / NULLIF((SELECT COUNT(DISTINCT player_id) FROM player_achievements), 0) AS unlock_pct
    FROM player_achievements
    GROUP BY achievement_id
    ORDER BY unlock_count DESC
  `);

  const stats = Object.fromEntries(rows.map(r => [r.achievement_id, {
    count: parseInt(r.unlock_count),
    pct:   parseFloat(r.unlock_pct || 0).toFixed(1),
  }]));

  await cache.set(cacheKey, stats, 3600); // 1 hour
  return stats;
}

module.exports = { checkAndUnlock, getPlayerAchievements, getUnlockCount, getGlobalStats };
