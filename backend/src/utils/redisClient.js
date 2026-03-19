// ============================================================
// REDIS SINGLETON — Direct client for sorted-set leaderboard ops
// Separate from the cache wrapper in db/redis.js
// ============================================================

let _client = null;

function getRedisClient() {
  if (_client) return _client;
  try {
    const Redis = require("ioredis");
    _client = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => (times > 3 ? null : times * 300),
      lazyConnect: false,
      enableOfflineQueue: false,
    });
    _client.on("error", () => {}); // silent — leaderboard degrades gracefully
    return _client;
  } catch {
    return null;
  }
}

module.exports = { getRedisClient };
