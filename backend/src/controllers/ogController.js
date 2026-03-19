const ogImages   = require("../services/ogImageService");
const achievements = require("../services/achievementService");
const playerService = require("../services/playerService");
const wordEngine = require("../services/wordEngine");
const cache      = require("../db/redis");
const logger     = require("../utils/logger");

// OG images are expensive to generate — cache aggressively
const DAILY_CARD_TTL  = 3600;  // 1 hour
const RESULT_CARD_TTL = 86400; // 24 hours (immutable per game)
const PROFILE_TTL     = 300;   // 5 minutes

/**
 * GET /api/og/daily?date=2024-03-01&wordLength=5
 * Daily challenge card — used as fc:frame image
 */
async function getDailyCard(req, res, next) {
  try {
    const date       = req.query.date || wordEngine.getTodayString();
    const wordLength = parseInt(req.query.wordLength) || 5;

    // Cache check
    const ck = `og:daily:${date}:${wordLength}`;
    const cached = await cache.get(ck);
    if (cached?.type === "image") {
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", `public, max-age=${DAILY_CARD_TTL}`);
      return res.send(Buffer.from(cached.data, "base64"));
    }

    const buffer = await ogImages.generateDailyCard({ date, wordLength });
    if (!buffer) return _fallbackRedirect(res);

    // Store as base64 in Redis
    await cache.set(ck, { type: "image", data: buffer.toString("base64") }, DAILY_CARD_TTL);

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", `public, max-age=${DAILY_CARD_TTL}`);
    res.send(buffer);
  } catch (err) { next(err); }
}

/**
 * GET /api/og/result?playerId=...&date=...&wordLength=5
 * Result share card — generated after game completion
 */
async function getResultCard(req, res, next) {
  try {
    const { playerId, date, wordLength = 5 } = req.query;
    if (!playerId || !date) return _fallbackRedirect(res);

    const ck = `og:result:${playerId}:${date}:${wordLength}`;
    const cached = await cache.get(ck);
    if (cached?.type === "image") {
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", `public, max-age=${RESULT_CARD_TTL}`);
      return res.send(Buffer.from(cached.data, "base64"));
    }

    // Fetch session data
    const db = require("../db/postgres");
    const { rows } = await db.query(
      `SELECT gs.evaluations, gs.attempts_used, gs.state, gs.score, p.username
       FROM game_sessions gs
       JOIN players p ON p.id = gs.player_id
       WHERE gs.player_id = $1 AND gs.play_date = $2 AND gs.word_length = $3`,
      [playerId, date, parseInt(wordLength)]
    );

    if (!rows[0] || rows[0].state === "playing") return _fallbackRedirect(res);
    const session = rows[0];

    const buffer = await ogImages.generateResultCard({
      evaluations: session.evaluations,
      won:         session.state === "win",
      attempts:    session.attempts_used,
      score:       session.score,
      username:    session.username,
      wordLength:  parseInt(wordLength),
      date,
    });

    if (!buffer) return _fallbackRedirect(res);

    await cache.set(ck, { type: "image", data: buffer.toString("base64") }, RESULT_CARD_TTL);

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", `public, max-age=${RESULT_CARD_TTL}`);
    res.send(buffer);
  } catch (err) { next(err); }
}

/**
 * GET /api/og/profile?playerId=...
 */
async function getProfileCard(req, res, next) {
  try {
    const { playerId } = req.query;
    if (!playerId) return _fallbackRedirect(res);

    const ck = `og:profile:${playerId}`;
    const cached = await cache.get(ck);
    if (cached?.type === "image") {
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", `public, max-age=${PROFILE_TTL}`);
      return res.send(Buffer.from(cached.data, "base64"));
    }

    const [stats, achs] = await Promise.all([
      playerService.getStats(playerId),
      achievements.getPlayerAchievements(playerId),
    ]);

    if (!stats) return _fallbackRedirect(res);

    const buffer = await ogImages.generateProfileCard({
      username:     stats.username,
      stats,
      achievements: achs,
    });

    if (!buffer) return _fallbackRedirect(res);

    await cache.set(ck, { type: "image", data: buffer.toString("base64") }, PROFILE_TTL);

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", `public, max-age=${PROFILE_TTL}`);
    res.send(buffer);
  } catch (err) { next(err); }
}

function _fallbackRedirect(res) {
  // Redirect to static fallback OG image if canvas unavailable or error
  res.redirect(302, `${process.env.FARCASTER_APP_URL || ""}/og-image.png`);
}

module.exports = { getDailyCard, getResultCard, getProfileCard };
