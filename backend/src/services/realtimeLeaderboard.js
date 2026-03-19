const { getRedisClient } = require("../utils/redisClient");
const db     = require("../db/postgres");
const logger = require("../utils/logger");

// ============================================================
// REAL-TIME LEADERBOARD — Redis Sorted Sets
// ZADD / ZREVRANK / ZREVRANGE → O(log N) rank operations
// Graceful PostgreSQL fallback when Redis unavailable
// ============================================================

const DAILY_TTL = 90000; // 25 h
const META_TTL  = 90000;

const K = {
  daily:       (d) => `zlb:daily:${d}`,
  alltime:     ()  => `zlb:alltime`,
  dailyMeta:   (d) => `zlb:meta:daily:${d}`,
  alltimeMeta: ()  => `zlb:meta:alltime`,
};

// ── WRITE ───────────────────────────────────────────────────

async function submitScore({ playerId, username, score, date }) {
  const r = getRedisClient();
  if (!r) return false;
  try {
    const meta     = JSON.stringify({ username, score });
    const pipeline = r.pipeline();
    pipeline.zadd(K.daily(date),   "NX", score, playerId);
    pipeline.expire(K.daily(date), DAILY_TTL);
    pipeline.hset(K.dailyMeta(date), playerId, meta);
    pipeline.expire(K.dailyMeta(date), META_TTL);
    pipeline.zadd(K.alltime(), "GT", score, playerId);
    pipeline.hset(K.alltimeMeta(), playerId, meta);
    await pipeline.exec();
    return true;
  } catch (err) {
    logger.debug("Redis submitScore failed", { error: err.message });
    return false;
  }
}

// ── READ: Daily ─────────────────────────────────────────────

async function getPlayerDailyRank(playerId, date) {
  const r = getRedisClient();
  if (!r) return null;
  try {
    const rank = await r.zrevrank(K.daily(date), playerId);
    return rank !== null ? rank + 1 : null;
  } catch { return null; }
}

async function getDailyTopPlayers(date, limit = 50) {
  const r = getRedisClient();
  if (!r) return null;
  try {
    const raw = await r.zrevrange(K.daily(date), 0, limit - 1, "WITHSCORES");
    if (!raw.length) return null;
    return _hydrate(r, raw, K.dailyMeta(date));
  } catch { return null; }
}

async function getNearbyPlayers(playerId, date, radius = 3) {
  const r = getRedisClient();
  if (!r) return null;
  try {
    const rank = await r.zrevrank(K.daily(date), playerId);
    if (rank === null) return null;
    const start = Math.max(0, rank - radius);
    const raw   = await r.zrevrange(K.daily(date), start, rank + radius, "WITHSCORES");
    const entries = await _hydrate(r, raw, K.dailyMeta(date), start);
    return {
      entries:    entries.map(e => ({ ...e, isCurrentPlayer: e.playerId === playerId })),
      playerRank: rank + 1,
    };
  } catch { return null; }
}

// ── READ: All-time ──────────────────────────────────────────

async function getAllTimeTopPlayers(limit = 50) {
  const r = getRedisClient();
  if (!r) return null;
  try {
    const raw = await r.zrevrange(K.alltime(), 0, limit - 1, "WITHSCORES");
    if (!raw.length) return null;
    return _hydrate(r, raw, K.alltimeMeta());
  } catch { return null; }
}

// ── SEED ────────────────────────────────────────────────────

async function seedFromPostgres(date) {
  const r = getRedisClient();
  if (!r) return;
  try {
    const count = await r.zcard(K.daily(date));
    if (count > 0) return;

    const { rows } = await db.query(
      `SELECT p.id, p.username, le.score
       FROM leaderboard_entries le
       JOIN players p ON p.id = le.player_id
       WHERE le.play_date = $1
       ORDER BY le.score DESC LIMIT 500`,
      [date]
    );
    if (!rows.length) return;

    const pipeline = r.pipeline();
    for (const row of rows) {
      const meta = JSON.stringify({ username: row.username, score: row.score });
      pipeline.zadd(K.daily(date), row.score, row.id);
      pipeline.hset(K.dailyMeta(date), row.id, meta);
    }
    pipeline.expire(K.daily(date), DAILY_TTL);
    pipeline.expire(K.dailyMeta(date), META_TTL);
    await pipeline.exec();

    logger.info("Redis leaderboard seeded", { date, count: rows.length });
  } catch (err) {
    logger.warn("Redis seed failed", { error: err.message });
  }
}

// ── HELPERS ─────────────────────────────────────────────────

async function _hydrate(r, raw, metaKey, startRank = 0) {
  const pids = [], scores = {};
  for (let i = 0; i < raw.length; i += 2) {
    pids.push(raw[i]);
    scores[raw[i]] = parseInt(raw[i + 1]);
  }
  if (!pids.length) return [];

  let metas = {};
  try {
    const vals = await r.hmget(metaKey, ...pids);
    vals.forEach((v, i) => { metas[pids[i]] = v ? JSON.parse(v) : {}; });
  } catch { /**/ }

  return pids.map((pid, i) => ({
    rank:     startRank + i + 1,
    playerId: pid,
    username: metas[pid]?.username || pid.slice(0, 8) + "...",
    score:    scores[pid],
  }));
}

module.exports = {
  submitScore,
  getPlayerDailyRank,
  getDailyTopPlayers,
  getAllTimeTopPlayers,
  getNearbyPlayers,
  seedFromPostgres,
};
