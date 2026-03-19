const jwt         = require("jsonwebtoken");
const { E, apiError } = require("../utils/errors");
const db          = require("../db/postgres");
const cache       = require("../db/redis");
const wordEngine  = require("../services/wordEngine");
const notifications = require("../services/notificationService");
const ogImages    = require("../services/ogImageService");
const logger      = require("../utils/logger");

// ============================================================
// ADMIN CONTROLLER
// Protected by JWT admin auth middleware
// ============================================================

// ── Auth ─────────────────────────────────────────────────────

/**
 * POST /api/admin/login
 * Exchange admin secret for JWT
 */
async function login(req, res) {
  const { secret } = req.body;
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret || !secret || secret !== adminSecret) {
    return res.status(401).json(apiError(E.INVALID_CREDENTIALS, "Invalid credentials"));
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    return res.status(500).json({ error: "Server misconfiguration: JWT_SECRET not set" });
  }
  const token = jwt.sign(
    { admin: true, iat: Date.now() },
    jwtSecret,
    { expiresIn: "8h" }
  );
  res.json({ token, expiresIn: "8h" });
}

// ── Analytics Dashboard ──────────────────────────────────────

async function getDashboard(req, res, next) {
  try {
    const today = new Date().toISOString().split("T")[0];
    const week  = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

    const [dau, totalPlayers, todayGames, weeklyRetention, topEvents] = await Promise.all([
      // DAU
      db.query(`SELECT COUNT(DISTINCT player_id) AS count FROM game_sessions WHERE play_date = $1`, [today]),
      // Total registered players
      db.query(`SELECT COUNT(*) AS count FROM players`),
      // Today's games
      db.query(`SELECT state, COUNT(*) AS count FROM game_sessions WHERE play_date = $1 GROUP BY state`, [today]),
      // Weekly retention (players who played both this week and last week)
      db.query(`
        SELECT COUNT(DISTINCT curr.player_id) AS returning_players
        FROM game_sessions curr
        WHERE curr.play_date = $1
          AND EXISTS (
            SELECT 1 FROM game_sessions prev
            WHERE prev.player_id = curr.player_id
              AND prev.play_date < $1 AND prev.play_date >= $2
          )
      `, [today, week]),
      // Top event counts today
      db.query(`
        SELECT event_name, COUNT(*) AS count
        FROM analytics_events
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY event_name ORDER BY count DESC LIMIT 10
      `),
    ]);

    const stateMap = {};
    (todayGames.rows || []).forEach(r => { stateMap[r.state] = parseInt(r.count); });

    res.json({
      date: today,
      dau:  parseInt(dau.rows[0]?.count || 0),
      totalPlayers: parseInt(totalPlayers.rows[0]?.count || 0),
      todayGames: {
        total:    (stateMap.win || 0) + (stateMap.loss || 0) + (stateMap.playing || 0),
        wins:     stateMap.win    || 0,
        losses:   stateMap.loss   || 0,
        inProgress: stateMap.playing || 0,
        winRate:  stateMap.win
          ? ((stateMap.win / ((stateMap.win || 0) + (stateMap.loss || 0))) * 100).toFixed(1) + "%"
          : "0%",
      },
      weeklyRetention: parseInt(weeklyRetention.rows[0]?.returning_players || 0),
      topEvents: topEvents.rows.map(r => ({ event: r.event_name, count: parseInt(r.count) })),
    });
  } catch (err) { next(err); }
}

// ── Word Management ──────────────────────────────────────────

async function getWordList(req, res) {
  const { length } = req.query;
  const len = length ? parseInt(length) : null;

  const lists = len && wordEngine.WORD_LISTS[len]
    ? { [len]: wordEngine.WORD_LISTS[len] }
    : wordEngine.WORD_LISTS;

  const preview = {};
  for (const [l, words] of Object.entries(lists)) {
    const today = new Date().toISOString().split("T")[0];
    const dailyWord = wordEngine.getDailyWord(parseInt(l), today, process.env.WORD_SALT || "");
    preview[l] = { words, count: words.length, todayWord: dailyWord };
  }

  res.json(preview);
}

async function previewDailyWord(req, res) {
  const { date, length } = req.query;
  const d = date || new Date().toISOString().split("T")[0];
  const l = parseInt(length || "5");

  if (!wordEngine.SUPPORTED_LENGTHS.includes(l)) {
    return res.status(400).json({ error: "Invalid length" });
  }

  const word = wordEngine.getDailyWord(l, d, process.env.WORD_SALT || "");
  res.json({ date: d, length: l, word });
}

async function previewDateRange(req, res) {
  const { length = 5, days = 7 } = req.query;
  const l    = parseInt(length);
  const d    = parseInt(days);
  const preview = [];

  for (let i = 0; i < Math.min(d, 30); i++) {
    const date = new Date(Date.now() + i * 86400000).toISOString().split("T")[0];
    const word = wordEngine.getDailyWord(l, date, process.env.WORD_SALT || "");
    preview.push({ date, word });
  }

  res.json({ length: l, days: preview });
}

// ── Player Management ────────────────────────────────────────

async function getPlayers(req, res, next) {
  try {
    const { limit = 50, offset = 0, search } = req.query;
    let queryText = `
      SELECT p.id, p.username, p.wallet_address, p.farcaster_fid, p.created_at,
             ps.total_wins, ps.total_played, ps.current_streak, ps.total_score
      FROM players p
      LEFT JOIN player_stats ps ON ps.player_id = p.id
    `;
    const params = [];
    if (search) {
      queryText += ` WHERE p.username ILIKE $1 OR p.wallet_address ILIKE $1`;
      params.push(`%${search}%`);
    }
    queryText += ` ORDER BY ps.total_score DESC NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const { rows } = await db.query(queryText, params);
    res.json({ players: rows, count: rows.length });
  } catch (err) { next(err); }
}

// ── Notification Triggers ────────────────────────────────────

async function triggerDailyReminders(req, res, next) {
  try {
    logger.info("Admin triggered daily reminders");
    const result = await notifications.sendDailyReminders();
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
}

async function triggerStreakWarnings(req, res, next) {
  try {
    const result = await notifications.sendStreakWarnings();
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
}

// ── Cache Management ─────────────────────────────────────────

async function flushLeaderboardCache(req, res, next) {
  try {
    const today = new Date().toISOString().split("T")[0];
    await cache.del(cache.KEYS.leaderboardDaily(today));
    await cache.del(cache.KEYS.leaderboardAllTime());
    res.json({ ok: true, message: "Leaderboard cache flushed" });
  } catch (err) { next(err); }
}

// ── OG Image Preview ─────────────────────────────────────────

async function previewOgImage(req, res, next) {
  try {
    const { type = "daily", wordLength = 5 } = req.query;
    const today = new Date().toISOString().split("T")[0];

    let imgBuffer;
    if (type === "daily") {
      imgBuffer = await ogImages.generateDailyCard({ date: today, wordLength: parseInt(wordLength) });
    } else if (type === "result") {
      imgBuffer = await ogImages.generateResultCard({
        evaluations: [["green","gray","yellow","gray","green"],["green","green","yellow","gray","green"],["green","green","green","green","green"]],
        won: true, attempts: 3, score: 600, username: "admin_preview", wordLength: 5, date: today,
      });
    }

    if (!imgBuffer) return res.status(503).json({ error: "Canvas not available" });

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.send(imgBuffer);
  } catch (err) { next(err); }
}

module.exports = {
  login, getDashboard, getWordList, previewDailyWord, previewDateRange,
  getPlayers, triggerDailyReminders, triggerStreakWarnings,
  flushLeaderboardCache, previewOgImage,
};
