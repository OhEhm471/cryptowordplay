// game.test.js — Integration tests for the game API
// Mocks all external deps (DB, Redis, services) so no live infra needed.

"use strict";

// ── Mock all external deps BEFORE any require ─────────────────
const { makeDbMock, makeRedisMock, makePlayer, makeSession } = require("./mocks");

const dbMock    = makeDbMock();
const cacheMock = makeRedisMock();

jest.mock("../../db/postgres", () => dbMock);
jest.mock("../../db/redis",    () => cacheMock);

// Mock services that would make external calls
jest.mock("../../services/analyticsService",    () => ({ track: jest.fn(), EVENTS: { GAME_STARTED: "game_started", GAME_WON: "game_won", GAME_LOST: "game_lost", GUESS_SUBMITTED: "guess_submitted", RESULT_SHARED: "result_shared" } }));
jest.mock("../../services/leaderboardService",  () => ({ submitScore: jest.fn().mockResolvedValue(true) }));
jest.mock("../../services/realtimeLeaderboard", () => ({ submitScore: jest.fn().mockResolvedValue(true) }));
jest.mock("../../services/achievementService",  () => ({ checkAndUnlock: jest.fn().mockResolvedValue([]), getPlayerAchievements: jest.fn().mockResolvedValue([]) }));
jest.mock("../../services/notificationService", () => ({ sendAchievementNotification: jest.fn().mockResolvedValue(true) }));
jest.mock("../../services/abTestService",       () => ({ assignAll: jest.fn().mockResolvedValue(new Map()), trackGoal: jest.fn().mockResolvedValue(true) }));
jest.mock("../../utils/scheduler",              () => ({ start: jest.fn() }));

// Mock playerService so FID/wallet auth never touches dbMock
// Individual tests that need a real player mock dbMock.query for session lookups only
const mockPlayer = {
  id:             "player-uuid-1234",
  wallet_address: "0xabc123",
  farcaster_fid:  "test-fid-42",
  username:       "TestPlayer",
};
jest.mock("../../services/playerService", () => ({
  upsertByWallet:    jest.fn().mockResolvedValue(mockPlayer),
  upsertByFarcaster: jest.fn().mockResolvedValue(mockPlayer),
  upsertAnonymous:   jest.fn().mockResolvedValue(mockPlayer),
  getStats:          jest.fn().mockResolvedValue({ current_streak: 0, max_streak: 0, total_wins: 0, total_played: 0, total_score: 0, best_score: 0, last_played: null }),
  updateStats:       jest.fn().mockResolvedValue(true),
  updateUsername:    jest.fn().mockResolvedValue(mockPlayer),
  ensureStats:       jest.fn().mockResolvedValue(true),
  getById:           jest.fn().mockResolvedValue(mockPlayer),
}));

// Silence logger in tests
jest.mock("../../utils/logger", () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const request = require("supertest");
const wordEngine = require("../../services/wordEngine");

// Build the Express app (after all mocks are in place)
let app;
beforeAll(() => {
  // Set required env vars
  process.env.WORD_SALT    = "test-salt";
  process.env.JWT_SECRET   = "test-jwt-secret";
  process.env.ADMIN_SECRET = "test-admin-secret";
  process.env.NODE_ENV     = "test";

  app = require("../../app");
});

afterEach(() => {
  jest.clearAllMocks();
});

// ── Helper: know today's word for length 5 ───────────────────
function getTodayWord(length = 5) {
  return wordEngine.getDailyWord(length, wordEngine.getTodayString(), process.env.WORD_SALT);
}

// ============================================================
// GET /api/health
// ============================================================
describe("GET /api/health", () => {
  test("returns 200 and ok status", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
  });
});

// ============================================================
// GET /api/game/daily/:length
// ============================================================
describe("GET /api/game/daily/:length", () => {
  test("returns 200 with challenge metadata for valid length", async () => {
    dbMock.query.mockResolvedValue({ rows: [], rowCount: 0 }); // no existing session

    const res = await request(app).get("/api/game/daily/5");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      wordLength: 5,
      maxAttempts: expect.any(Number),
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
    // The actual target word must NEVER appear in the response
    expect(res.body.targetWord).toBeUndefined();
    expect(res.body.word).toBeUndefined();
  });

  test("returns 200 for all supported lengths", async () => {
    dbMock.query.mockResolvedValue({ rows: [], rowCount: 0 });
    for (const len of [3, 4, 5, 6]) {
      const res = await request(app).get(`/api/game/daily/${len}`);
      expect(res.status).toBe(200);
      expect(res.body.wordLength).toBe(len);
    }
  });

  test("returns 400 with error code for invalid length", async () => {
    const res = await request(app).get("/api/game/daily/7");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_WORD_LENGTH");
  });

  test("returns resumed session state for authenticated player", async () => {
    const session = makeSession({ state: "playing", guesses: ["TOKEN"], attempts_used: 1 });
    dbMock.query
      .mockResolvedValueOnce({ rows: [session], rowCount: 1 }); // session lookup

    const res = await request(app)
      .get("/api/game/daily/5")
      .set("x-farcaster-fid", "test-fid-42");

    expect(res.status).toBe(200);
    expect(res.body.session).not.toBeNull();
    expect(res.body.session.attemptsUsed).toBe(1);
    expect(res.body.session.state).toBe("playing");
  });
});

// ============================================================
// POST /api/game/guess
// ============================================================
describe("POST /api/game/guess", () => {
  const todayWord5 = () => getTodayWord(5);

  test("rejects missing fields with 400 + VALIDATION_ERROR", async () => {
    const res = await request(app)
      .post("/api/game/guess")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  test("rejects guess shorter than declared wordLength with 400", async () => {
    const res = await request(app)
      .post("/api/game/guess")
      .send({ guess: "HOD", wordLength: 4 }); // 3-letter guess declared as 4

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  test("rejects word not in list with 422 + WORD_NOT_IN_LIST", async () => {
    dbMock.query.mockResolvedValue({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post("/api/game/guess")
      .send({ guess: "ZZZZZ", wordLength: 5 });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("WORD_NOT_IN_LIST");
  });

  test("returns evaluation for a valid wrong guess (anonymous)", async () => {
    // Anonymous session — no DB persist
    const target = todayWord5();
    // Pick a valid 5-letter word that is NOT the target
    const guessWord = wordEngine.WORD_LISTS[5].find(w => w !== target);

    const res = await request(app)
      .post("/api/game/guess")
      .send({ guess: guessWord, wordLength: 5 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      evaluation:  expect.arrayContaining(["green", "yellow", "gray"].map(c => expect.stringMatching(/green|yellow|gray/))),
      attemptsUsed: 1,
      state:       "playing",
    });
    // Target word not revealed mid-game
    expect(res.body.targetWord).toBeUndefined();
  });

  test("correct guess wins the game and reveals target word", async () => {
    const target = todayWord5();

    const res = await request(app)
      .post("/api/game/guess")
      .send({ guess: target, wordLength: 5 });

    expect(res.status).toBe(200);
    expect(res.body.state).toBe("win");
    expect(res.body.isCorrect).toBe(true);
    expect(res.body.targetWord).toBe(target);
    expect(res.body.score).toBeGreaterThan(0);
    expect(res.body.shareText).toBeDefined();
  });

  test("evaluation array is all-green on correct guess", async () => {
    const target = todayWord5();

    const res = await request(app)
      .post("/api/game/guess")
      .send({ guess: target, wordLength: 5 });

    expect(res.body.evaluation).toEqual(
      new Array(target.length).fill("green")
    );
  });

  test("loses after max attempts and reveals target word", async () => {
    // Use a DB-backed session at MAX_ATTEMPTS-1 so one more wrong guess triggers loss
    const target  = todayWord5();
    const wrongs  = wordEngine.WORD_LISTS[5].filter(w => w !== target);
    const maxAttempts = 4; // default from scoreEngine
    const penultimateSession = makeSession({
      state:         "playing",
      target_word:   target,
      guesses:       wrongs.slice(0, maxAttempts - 1),
      evaluations:   wrongs.slice(0, maxAttempts - 1).map(() => new Array(5).fill("gray")),
      attempts_used: maxAttempts - 1,
    });

    // DB returns the session, then accepts the UPDATE
    dbMock.query
      .mockResolvedValueOnce({ rows: [penultimateSession], rowCount: 1 }) // session load
      .mockResolvedValue({ rows: [], rowCount: 1 });                       // session update

    const res = await request(app)
      .post("/api/game/guess")
      .set("x-farcaster-fid", "test-fid-42")
      .send({ guess: wrongs[maxAttempts - 1], wordLength: 5 });

    expect(res.status).toBe(200);
    expect(res.body.state).toBe("loss");
    expect(res.body.targetWord).toBe(target);
    expect(res.body.score).toBe(10); // PARTICIPATION bonus
  });

  test("blocks 5th guess after game is already finished (DB-backed session)", async () => {
    const player  = makePlayer();
    const session = makeSession({ state: "win", attempts_used: 2, score: 800 });

    dbMock.query
      .mockResolvedValueOnce({ rows: [session], rowCount: 1 }); // session load

    const target = todayWord5();
    const res = await request(app)
      .post("/api/game/guess")
      .set("x-farcaster-fid", "test-fid-42")
      .send({ guess: target, wordLength: 5 });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ROUND_ALREADY_FINISHED");
  });

  test("accepts lowercase guess and normalizes it", async () => {
    const target = todayWord5();
    const res = await request(app)
      .post("/api/game/guess")
      .send({ guess: target.toLowerCase(), wordLength: 5 });

    expect(res.status).toBe(200);
    expect(res.body.state).toBe("win");
  });

  test("works for 4-letter words", async () => {
    const target = getTodayWord(4);
    const res = await request(app)
      .post("/api/game/guess")
      .send({ guess: target, wordLength: 4 });

    expect(res.status).toBe(200);
    expect(res.body.state).toBe("win");
  });

  test("works for 3-letter words", async () => {
    const target = getTodayWord(3);
    const res = await request(app)
      .post("/api/game/guess")
      .send({ guess: target, wordLength: 3 });

    expect(res.status).toBe(200);
    expect(res.body.state).toBe("win");
  });
});

// ============================================================
// GET /api/game/session/:length
// ============================================================
describe("GET /api/game/session/:length", () => {
  test("returns null session for unauthenticated user", async () => {
    const res = await request(app).get("/api/game/session/5");
    expect(res.status).toBe(200);
    expect(res.body.session).toBeNull();
  });

  test("returns session data for authenticated player", async () => {
    const player  = makePlayer();
    const session = makeSession({ state: "playing", guesses: ["TOKEN"], attempts_used: 1 });

    dbMock.query
      .mockResolvedValueOnce({ rows: [session], rowCount: 1 }); // session

    const res = await request(app)
      .get("/api/game/session/5")
      .set("x-farcaster-fid", "test-fid-42");

    expect(res.status).toBe(200);
    expect(res.body.session).toBeDefined();
    expect(res.body.session.attemptsUsed).toBe(1);
    // Target word hidden while still playing
    expect(res.body.session.targetWord).toBeUndefined();
  });

  test("reveals target word when game is over", async () => {
    const player  = makePlayer();
    const session = makeSession({ state: "win", target_word: "CHAIN", attempts_used: 2 });

    dbMock.query
      .mockResolvedValueOnce({ rows: [session], rowCount: 1 });

    const res = await request(app)
      .get("/api/game/session/5")
      .set("x-farcaster-fid", "test-fid-42");

    expect(res.body.session.targetWord).toBe("CHAIN");
  });
});

// ============================================================
// POST /api/game/share
// ============================================================
describe("POST /api/game/share", () => {
  test("returns ok for share event", async () => {
    const res = await request(app)
      .post("/api/game/share")
      .send({ wordLength: 5 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ============================================================
// Error codes on invalid routes
// ============================================================
describe("404 handler", () => {
  test("unknown route returns 404 with NOT_FOUND code", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });
});
