// helpers/mocks.js
// Reusable mock factories for DB and Redis.
// Import these in integration tests before requiring any module
// that touches DB or Redis.

// ── Postgres mock ─────────────────────────────────────────────
function makeDbMock(overrides = {}) {
  return {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    ...overrides,
  };
}

// ── Redis cache mock ──────────────────────────────────────────
function makeRedisMock(overrides = {}) {
  const store = new Map();
  return {
    get:         jest.fn().mockResolvedValue(null),
    set:         jest.fn().mockResolvedValue(true),
    del:         jest.fn().mockResolvedValue(1),
    incrExpire:  jest.fn().mockResolvedValue(1),
    healthCheck: jest.fn().mockResolvedValue(true),
    KEYS: {
      dailyWord:         (date, length) => `daily_word:${date}:${length}`,
      leaderboardDaily:  (date)         => `lb:daily:${date}`,
      leaderboardAllTime: ()            => `lb:alltime`,
      playerSession:     (pid, d, len)  => `session:${pid}:${d}:${len}`,
      playerStats:       (pid)          => `player_stats:${pid}`,
    },
    ...overrides,
  };
}

// ── Player factory ─────────────────────────────────────────────
function makePlayer(overrides = {}) {
  return {
    id:            "player-uuid-1234",
    wallet_address: "0xabc123",
    farcaster_fid:  null,
    username:       "TestPlayer",
    ...overrides,
  };
}

// ── Session factory ───────────────────────────────────────────
function makeSession(overrides = {}) {
  return {
    id:            "session-uuid-5678",
    player_id:     "player-uuid-1234",
    word_length:   5,
    target_word:   "CHAIN",
    play_date:     "2024-03-01",
    guesses:       [],
    evaluations:   [],
    state:         "playing",
    attempts_used: 0,
    score:         0,
    ...overrides,
  };
}

module.exports = { makeDbMock, makeRedisMock, makePlayer, makeSession };
