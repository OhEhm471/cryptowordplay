// admin.test.js — Integration tests for admin endpoints
"use strict";

const { makeDbMock, makeRedisMock } = require("./mocks");

const dbMock    = makeDbMock();
const cacheMock = makeRedisMock();

jest.mock("../../db/postgres", () => dbMock);
jest.mock("../../db/redis",    () => cacheMock);
jest.mock("../../services/analyticsService",    () => ({ track: jest.fn(), EVENTS: {} }));
jest.mock("../../services/leaderboardService",  () => ({ submitScore: jest.fn() }));
jest.mock("../../services/realtimeLeaderboard", () => ({ submitScore: jest.fn() }));
jest.mock("../../services/achievementService",  () => ({ checkAndUnlock: jest.fn().mockResolvedValue([]) }));
jest.mock("../../services/notificationService", () => ({
  sendAchievementNotification: jest.fn().mockResolvedValue(true),
  sendDailyReminders:          jest.fn().mockResolvedValue({ sent: 1, failed: 0 }),
  sendStreakWarnings:           jest.fn().mockResolvedValue({ sent: 0, failed: 0 }),
  sendNotification:            jest.fn().mockResolvedValue(true),
  saveNotificationToken:       jest.fn().mockResolvedValue(true),
  removeNotificationToken:     jest.fn().mockResolvedValue(true),
}));
jest.mock("../../services/abTestService", () => ({
  assignAll:         jest.fn().mockResolvedValue(new Map()),
  trackGoal:         jest.fn(),
  invalidateCache:   jest.fn(),
  createExperiment:  jest.fn().mockResolvedValue({
    id: "new-exp", slug: "test_exp", name: "Test Exp",
    status: "draft", variants: [], traffic_pct: 50,
  }),
  getAllExperiments:  jest.fn().mockResolvedValue([]),  // used by listExperiments controller
  getResults:        jest.fn().mockResolvedValue({ experiment: null, variants: [] }),
  updateExperiment:  jest.fn().mockResolvedValue({}),
}));
jest.mock("../../utils/scheduler",              () => ({ start: jest.fn() }));
jest.mock("../../utils/logger", () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const request = require("supertest");
const jwt     = require("jsonwebtoken");

let app;
let validToken;

beforeAll(() => {
  process.env.WORD_SALT    = "test-salt";
  process.env.JWT_SECRET   = "test-jwt-secret";
  process.env.ADMIN_SECRET = "test-admin-secret";
  process.env.NODE_ENV     = "test";

  app = require("../../app");
  // Pre-sign a valid admin JWT for use in all authenticated requests
  validToken = jwt.sign({ admin: true }, process.env.JWT_SECRET, { expiresIn: "1h" });
});

afterEach(() => jest.clearAllMocks());

// ── Auth header helper ─────────────────────────────────────────
const auth = () => ({ Authorization: `Bearer ${validToken}` });

// ============================================================
// POST /api/admin/login
// ============================================================
describe("POST /api/admin/login", () => {
  test("returns token on correct secret", async () => {
    const res = await request(app)
      .post("/api/admin/login")
      .send({ secret: "test-admin-secret" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    // Token should be a valid JWT
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(decoded.admin).toBe(true);
  });

  test("returns 401 with INVALID_CREDENTIALS on wrong secret", async () => {
    const res = await request(app)
      .post("/api/admin/login")
      .send({ secret: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
  });

  test("returns 401 on missing secret", async () => {
    const res = await request(app)
      .post("/api/admin/login")
      .send({});

    expect(res.status).toBe(401);
  });
});

// ============================================================
// GET /api/admin/dashboard (JWT-protected)
// ============================================================
describe("GET /api/admin/dashboard", () => {
  test("returns 401 without token", async () => {
    const res = await request(app).get("/api/admin/dashboard");
    expect(res.status).toBe(401);
  });

  test("returns 401 with invalid token", async () => {
    const res = await request(app)
      .get("/api/admin/dashboard")
      .set("Authorization", "Bearer bad-token");
    expect(res.status).toBe(401);
  });

  test("returns dashboard data with valid token", async () => {
    // Mock the 5 parallel getDashboard queries (Promise.all order matters)
    dbMock.query
      .mockResolvedValueOnce({ rows: [{ count: "42" }] })           // 1. DAU
      .mockResolvedValueOnce({ rows: [{ count: "200" }] })          // 2. totalPlayers
      .mockResolvedValueOnce({ rows: [                              // 3. todayGames (state breakdown)
        { state: "win",     count: "30" },
        { state: "loss",    count: "10" },
        { state: "playing", count: "2"  },
      ] })
      .mockResolvedValueOnce({ rows: [{ returning_players: "15" }] }) // 4. weeklyRetention
      .mockResolvedValueOnce({ rows: [{ event_name: "guess", count: "80" }] }); // 5. topEvents

    const res = await request(app)
      .get("/api/admin/dashboard")
      .set(auth());

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      dau:          42,
      totalPlayers: 200,
      todayGames: {
        wins:    30,
        losses:  10,
        total:   42,
        winRate: expect.stringMatching(/%$/),
      },
      weeklyRetention: 15,
      topEvents:       expect.arrayContaining([
        expect.objectContaining({ event: "guess", count: 80 }),
      ]),
    });
  });
});

// ============================================================
// GET /api/admin/players
// ============================================================
describe("GET /api/admin/players", () => {
  test("returns player list with valid token", async () => {
    const mockPlayers = [
      { id: "p1", username: "Alice", total_wins: 10, total_played: 12, current_streak: 3, best_score: 1200, farcaster_fid: null },
      { id: "p2", username: "Bob",   total_wins: 5,  total_played: 8,  current_streak: 0, best_score: 800,  farcaster_fid: "12345" },
    ];
    dbMock.query
      .mockResolvedValueOnce({ rows: mockPlayers });

    const res = await request(app)
      .get("/api/admin/players")
      .set(auth());

    expect(res.status).toBe(200);
    expect(res.body.players).toHaveLength(2);
    expect(res.body.count).toBe(2);
  });

  test("search parameter is forwarded", async () => {
    dbMock.query
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/api/admin/players?search=alice")
      .set(auth());

    expect(res.status).toBe(200);
    // Verify search param was used in a query
    const calls = dbMock.query.mock.calls;
    const hasSearch = calls.some(c => JSON.stringify(c).includes("alice"));
    expect(hasSearch).toBe(true);
  });
});

// ============================================================
// GET /api/admin/words (word schedule)
// ============================================================
describe("GET /api/admin/words", () => {
  test("returns words list", async () => {
    dbMock.query.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .get("/api/admin/words")
      .set(auth());

    expect(res.status).toBe(200);
  });
});

// ============================================================
// POST /api/admin/notify/daily
// ============================================================
describe("POST /api/admin/notify/daily", () => {
  test("triggers daily reminders", async () => {
    const res = await request(app)
      .post("/api/admin/notify/daily")
      .set(auth());

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test("returns 401 without token", async () => {
    const res = await request(app).post("/api/admin/notify/daily");
    expect(res.status).toBe(401);
  });
});

// ============================================================
// POST /api/admin/cache/flush-leaderboard
// ============================================================
describe("POST /api/admin/cache/flush-leaderboard", () => {
  test("flushes leaderboard cache", async () => {
    const res = await request(app)
      .post("/api/admin/cache/flush-leaderboard")
      .set(auth());

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ============================================================
// GET /api/admin/wordlist/summary
// ============================================================
describe("GET /api/admin/wordlist/summary", () => {
  test("returns word list counts per length", async () => {
    // Rows use DB column names: active_count, inactive_count
    dbMock.query.mockResolvedValue({
      rows: [
        { length: 3, active_count: "28", inactive_count: "2",  last_updated: null },
        { length: 4, active_count: "35", inactive_count: "0",  last_updated: null },
        { length: 5, active_count: "38", inactive_count: "2",  last_updated: null },
        { length: 6, active_count: "33", inactive_count: "2",  last_updated: null },
      ],
    });

    const res = await request(app)
      .get("/api/admin/wordlist/summary")
      .set(auth());

    expect(res.status).toBe(200);
    // summary is keyed by word length
    expect(res.body.summary[4]).toBeDefined();
    expect(res.body.summary[4].total).toBe(35);
    expect(res.body.summary[4].active).toBe(35);
  });
});

// ============================================================
// POST /api/admin/wordlist/:length (add word)
// ============================================================
describe("POST /api/admin/wordlist/:length", () => {
  test("adds a valid new word", async () => {
    dbMock.query
      .mockResolvedValueOnce({ rows: [{ was_inserted: true }], rowCount: 1 }) // INSERT
      .mockResolvedValueOnce({ rows: [] });                                   // reloadWords DB query

    const res = await request(app)
      .post("/api/admin/wordlist/5")
      .set(auth())
      .send({ word: "ZZZZZ" });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
  });

  test("rejects a word of wrong length", async () => {
    const res = await request(app)
      .post("/api/admin/wordlist/5")
      .set(auth())
      .send({ word: "ZZZ" }); // 3 letters, but length route is 5

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("WORD_INVALID_LENGTH");
  });
});

// ============================================================
// A/B Tests
// ============================================================
describe("GET /api/admin/ab/experiments", () => {
  test("returns experiment list", async () => {
    // getAllExperiments is mocked at service level — configure the mock return
    const { getAllExperiments } = require("../../services/abTestService");
    getAllExperiments.mockResolvedValueOnce([{
      id: "exp-1", slug: "max_attempts", name: "Test", status: "draft",
      variants: [{ id: "control", name: "4", weight: 50 }, { id: "treatment", name: "5", weight: 50 }],
      total_assignments: "0", total_conversions: "0",
    }]);

    const res = await request(app)
      .get("/api/admin/ab/experiments")
      .set(auth());

    expect(res.status).toBe(200);
    expect(res.body.experiments).toHaveLength(1);
    expect(res.body.goalMetrics).toBeDefined();
  });
});

describe("POST /api/admin/ab/experiments", () => {
  test("creates a new experiment", async () => {
    // createExperiment is mocked at service level — default mock returns a valid experiment
    const res = await request(app)
      .post("/api/admin/ab/experiments")
      .set(auth())
      .send({
        slug:       "test_exp",
        name:       "Test Exp",
        trafficPct: 50,
        variants:   [{ id: "a", name: "Control", weight: 50 }, { id: "b", name: "Treatment", weight: 50 }],
        goalMetric: "game_won",
      });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.experiment).toBeDefined();
  });

  test("rejects experiment with duplicate slug", async () => {
    const pgDupe = new Error("duplicate key");
    pgDupe.code  = "23505";
    dbMock.query.mockRejectedValueOnce(pgDupe);

    const res = await request(app)
      .post("/api/admin/ab/experiments")
      .set(auth())
      .send({
        slug:       "max_attempts",
        name:       "Dupe",
        trafficPct: 50,
        variants:   [{ id: "a", name: "A", weight: 50 }, { id: "b", name: "B", weight: 50 }],
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("EXPERIMENT_SLUG_TAKEN");
  });

  test("rejects experiment with fewer than 2 variants", async () => {
    const res = await request(app)
      .post("/api/admin/ab/experiments")
      .set(auth())
      .send({
        slug:     "solo_exp",
        name:     "Solo",
        variants: [{ id: "a", name: "Only one", weight: 50 }],
      });

    expect(res.status).toBe(400);
  });

  test("rejects invalid slug characters", async () => {
    const res = await request(app)
      .post("/api/admin/ab/experiments")
      .set(auth())
      .send({
        slug:     "Invalid Slug!",
        name:     "Bad",
        variants: [{ id: "a", name: "A", weight: 50 }, { id: "b", name: "B", weight: 50 }],
      });

    expect(res.status).toBe(400);
  });
});
