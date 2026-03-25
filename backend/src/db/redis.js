const Redis = require("ioredis");
const logger = require("../utils/logger");

let client = null;

function getClient() {
  if (client) return client;

  const url = process.env.REDIS_URL || "redis://localhost:6379";
  const isSSL = url.startsWith("rediss://");

  client = new Redis(url, {
    tls: isSSL ? { rejectUnauthorized: false } : undefined,
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
    retryStrategy(times) {
      if (times > 5) return null;
      return Math.min(times * 200, 2000);
    },
  });

  client.on("connect", () => logger.info("Redis connected"));
  client.on("error", (err) => logger.warn("Redis error", { error: err.message }));

  return client;
}

async function get(key) {
  try {
    const val = await getClient().get(key);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
}

async function set(key, value, ttlSeconds) {
  try {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await getClient().setex(key, ttlSeconds, serialized);
    } else {
      await getClient().set(key, serialized);
    }
    return true;
  } catch { return false; }
}

async function del(key) {
  try {
    await getClient().del(key);
    return true;
  } catch { return false; }
}

async function incrExpire(key, ttlSeconds) {
  try {
    const val = await getClient().incr(key);
    if (val === 1) await getClient().expire(key, ttlSeconds);
    return val;
  } catch { return 0; }
}

async function healthCheck() {
  try {
    await getClient().ping();
    return { healthy: true };
  } catch (err) {
    return { healthy: false, error: err.message };
  }
}

async function flushForTesting() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("flushForTesting() may only be called in test environment");
  }
  await getClient().flushdb();
  try {
    const { getRedisClient } = require("../utils/redisClient");
    const raw = getRedisClient();
    if (raw) await raw.flushdb();
  } catch { /* ignore */ }
}

const KEYS = {
  dailyWord:          (date, length) => `daily_word:${date}:${length}`,
  leaderboardDaily:   (date)         => `lb:daily:${date}`,
  leaderboardAllTime: ()             => `lb:alltime`,
  playerSession:      (pid, d, len)  => `session:${pid}:${d}:${len}`,
  playerStats:        (pid)          => `player_stats:${pid}`,
};

module.exports = { get, set, del, incrExpire, healthCheck, flushForTesting, KEYS };