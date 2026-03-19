const Redis = require("ioredis");
const logger = require("../utils/logger");

let client = null;
let isConnected = false;

function getClient() {
  if (client) return client;

  client = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  tls: process.env.REDIS_URL?.startsWith("rediss://") ? {} : undefined,
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 5) {
        logger.warn("Redis: max retries reached, disabling cache");
        return null; // stop retrying
      }
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
  });

  client.on("connect", () => {
    isConnected = true;
    logger.info("Redis connected");
  });

  client.on("error", (err) => {
    isConnected = false;
    logger.warn("Redis error (cache degraded)", { error: err.message });
  });

  client.on("close", () => {
    isConnected = false;
  });

  return client;
}

/**
 * Safe get — returns null on failure instead of throwing
 */
async function get(key) {
  try {
    const c = getClient();
    const val = await c.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

/**
 * Safe set with TTL in seconds
 */
async function set(key, value, ttlSeconds) {
  try {
    const c = getClient();
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await c.setex(key, ttlSeconds, serialized);
    } else {
      await c.set(key, serialized);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Safe delete
 */
async function del(key) {
  try {
    const c = getClient();
    await c.del(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Increment and expire — for rate limiting / counters
 */
async function incrExpire(key, ttlSeconds) {
  try {
    const c = getClient();
    const val = await c.incr(key);
    if (val === 1) await c.expire(key, ttlSeconds);
    return val;
  } catch {
    return 0;
  }
}

async function healthCheck() {
  try {
    const c = getClient();
    await c.ping();
    return { healthy: true };
  } catch (err) {
    return { healthy: false, error: err.message };
  }
}

const KEYS = {
  dailyWord: (date, length) => `daily_word:${date}:${length}`,
  leaderboardDaily: (date) => `lb:daily:${date}`,
  leaderboardAllTime: () => `lb:alltime`,
  playerSession: (playerId, date, length) => `session:${playerId}:${date}:${length}`,
  playerStats: (playerId) => `player_stats:${playerId}`,
};

// Only for use in test environments — flushes all Redis keys
async function flushForTesting() {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("flushForTesting() may only be called in test environment");
  }
  // Flush the cache client (db/redis.js)
  const c = getClient();
  await c.flushdb();
  // Also flush the raw sorted-set client (utils/redisClient.js) if connected
  try {
    const { getRedisClient } = require("../utils/redisClient");
    const raw = getRedisClient();
    if (raw) await raw.flushdb();
  } catch { /* raw client not available — ignore */ }
}

module.exports = { get, set, del, incrExpire, healthCheck, flushForTesting, KEYS };
