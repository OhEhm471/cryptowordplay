const playerService = require("../services/playerService");
const logger        = require("../utils/logger");

async function getMe(req, res, next) {
  try {
    if (!req.player) {
      return res.json({ player: null, stats: null });
    }
    const stats = await playerService.getStats(req.player.id);
    res.json({
      player: {
        id:             req.player.id,
        username:       req.player.username,
        walletAddress:  req.player.wallet_address,
        farcasterFid:   req.player.farcaster_fid,
      },
      stats: stats
        ? {
            streak:      stats.current_streak,
            maxStreak:   stats.max_streak,
            wins:        stats.total_wins,
            played:      stats.total_played,
            totalScore:  stats.total_score,
            bestScore:   stats.best_score,
            lastPlayed:  stats.last_played,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
}

async function updateUsername(req, res, next) {
  try {
    if (!req.player) {
      return res.status(401).json({ error: "Auth required", code: "AUTH_REQUIRED" });
    }
    const { username } = req.body;
    if (!username || username.trim().length < 1 || username.trim().length > 32) {
      return res.status(400).json({ error: "Username must be 1–32 characters" });
    }
    const updated = await playerService.updateUsername(req.player.id, username.trim());
    if (!updated) return res.status(404).json({ error: "Player not found" });
    res.json({ ok: true, username: updated.username });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMe, updateUsername };
