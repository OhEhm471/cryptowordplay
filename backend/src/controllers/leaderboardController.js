const leaderboardService = require("../services/leaderboardService");
const analytics          = require("../services/analyticsService");
const wordEngine         = require("../services/wordEngine");
const logger             = require("../utils/logger");

async function getDaily(req, res, next) {
  try {
    const date   = req.query.date || wordEngine.getTodayString();
    const limit  = Math.min(parseInt(req.query.limit) || 50, 100);

    analytics.track(analytics.EVENTS.LEADERBOARD_VIEWED, req.player?.id, { type: "daily", date });

    const entries = await leaderboardService.getDailyLeaderboard(date, limit);

    let playerRank = null;
    if (req.player) {
      playerRank = await leaderboardService.getPlayerRank(req.player.id, date);
    }

    res.json({ date, entries, playerRank, total: entries.length });
  } catch (err) {
    next(err);
  }
}

async function getAllTime(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    analytics.track(analytics.EVENTS.LEADERBOARD_VIEWED, req.player?.id, { type: "alltime" });
    const entries = await leaderboardService.getAllTimeLeaderboard(limit);
    res.json({ entries, total: entries.length });
  } catch (err) {
    next(err);
  }
}

async function getNearby(req, res, next) {
  try {
    if (!req.player) return res.status(401).json({ error: "Auth required" });
    const date = req.query.date || wordEngine.getTodayString();
    const data = await leaderboardService.getNearbyPlayers(req.player.id, date);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = { getDaily, getAllTime, getNearby };
