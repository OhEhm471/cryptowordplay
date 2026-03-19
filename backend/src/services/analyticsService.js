const db = require("../db/postgres");
const logger = require("../utils/logger");

// ============================================================
// ANALYTICS — Lightweight server-side event tracking
// Events: game_started, guess_submitted, game_won, game_lost,
//         result_shared, leaderboard_viewed
// ============================================================

const EVENTS = {
  GAME_STARTED:       "game_started",
  GUESS_SUBMITTED:    "guess_submitted",
  GAME_WON:          "game_won",
  GAME_LOST:         "game_lost",
  RESULT_SHARED:     "result_shared",
  LEADERBOARD_VIEWED: "leaderboard_viewed",
  PLAYER_REGISTERED:  "player_registered",
};

/**
 * Track a single event — fire-and-forget, never throws
 */
async function track(eventName, playerId, properties = {}) {
  try {
    await db.query(
      `INSERT INTO analytics_events (player_id, event_name, properties)
       VALUES ($1, $2, $3)`,
      [playerId || null, eventName, JSON.stringify(properties)]
    );
  } catch (err) {
    // Never block gameplay on analytics failure
    logger.debug("Analytics track failed (non-critical)", { eventName, error: err.message });
  }
}

module.exports = { track, EVENTS };
