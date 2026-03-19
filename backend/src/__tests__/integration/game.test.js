// ============================================================
// Game loop integration tests
//
// Tests the full request path:
//   GET  /api/game/daily/:length  — challenge metadata
//   POST /api/game/guess          — evaluate guess
//   POST /api/game/share          — record share
//
// Requires a running Postgres + Redis (see docker-compose.test.yml).
// Run with: npm test -- --testPathPattern=game
// ============================================================

const request  = require("supertest");
const app      = require("../../app");
const wordEngine = require("../../services/wordEngine");
const {
  resetDb,
  createPlayer,
  createPlayerStats,
  seedWords,
  authedRequest,
} = require("./helpers");

// Override WORD_SALT so daily word is predictable in tests
process.env.WORD_SALT = "test-salt-deterministic";

let today;
let todayWord4; // known daily word for length 4

beforeAll(async () => {
  await seedWords();
  today     = wordEngine.getTodayString();
  todayWord4 = wordEngine.getDailyWord(4, today, process.env.WORD_SALT);
});

beforeEach(async () => {
  await resetDb();
  await seedWords(); // re-seed after truncate
});

// ── GET /api/game/daily/:length ───────────────────────────────

describe("GET /api/game/daily/:length", () => {
  test("anonymous — returns challenge metadata without session", async () => {
    const res = await request(app).get("/api/game/daily/4");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      date:       today,
      wordLength: 4,
      maxAttempts: expect.any(Number),
    });
    // Word must NOT be revealed
    expect(res.body.targetWord).toBeUndefined();
    expect(res.body.word).toBeUndefined();
    // No session for anonymous
    expect(res.body.session).toBeNull();
  });

  test("authenticated — returns null session before first guess", async () => {
    const player = await createPlayer({ fid: "fid-daily-1" });
    const res = await authedRequest("fid-daily-1").get("/api/game/daily/4");
    expect(res.status).toBe(200);
    expect(res.body.session).toBeNull();
  });

  test("authenticated — resumes existing session", async () => {
    const player = await createPlayer({ fid: "fid-daily-2" });

    // Make one guess to create a session
    const guessRes = await authedRequest("fid-daily-2")
      .post("/api/game/guess")
      .send({ guess: "HODL", wordLength: 4 });
    expect(guessRes.status).toBe(200);

    // Now fetch daily — should show the resumed session
    const res = await authedRequest("fid-daily-2").get("/api/game/daily/4");
    expect(res.status).toBe(200);
    expect(res.body.session).not.toBeNull();
    expect(res.body.session.guesses).toHaveLength(1);
    expect(res.body.session.attemptsUsed).toBe(1);
  });

  test("invalid word length returns 400 with error code", async () => {
    const res = await request(app).get("/api/game/daily/7");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_WORD_LENGTH");
  });

  test("all supported lengths return 200", async () => {
    for (const len of [3, 4, 5, 6]) {
      const res = await request(app).get(`/api/game/daily/${len}`);
      expect(res.status).toBe(200);
      expect(res.body.wordLength).toBe(len);
    }
  });
});

// ── POST /api/game/guess ──────────────────────────────────────

describe("POST /api/game/guess", () => {
  test("valid guess returns evaluation array", async () => {
    const res = await request(app)
      .post("/api/game/guess")
      .send({ guess: "HODL", wordLength: 4 });

    expect(res.status).toBe(200);
    expect(res.body.evaluation).toHaveLength(4);
    expect(res.body.evaluation.every(e => ["green","yellow","gray"].includes(e))).toBe(true);
    expect(res.body.attemptsUsed).toBe(1);
    expect(res.body.state).toBe("playing");
  });

  test("correct guess results in win state and score", async () => {
    const player = await createPlayer({ fid: "fid-win" });
    await createPlayerStats(player.id);

    const res = await authedRequest("fid-win")
      .post("/api/game/guess")
      .send({ guess: todayWord4, wordLength: 4 });

    expect(res.status).toBe(200);
    expect(res.body.state).toBe("win");
    expect(res.body.score).toBeGreaterThan(0);
    expect(res.body.evaluation.every(e => e === "green")).toBe(true);
    expect(res.body.scoreBreakdown).toBeDefined();
  });

  test("win on first guess includes first-try bonus", async () => {
    const player = await createPlayer({ fid: "fid-firsttry" });
    await createPlayerStats(player.id);

    const res = await authedRequest("fid-firsttry")
      .post("/api/game/guess")
      .send({ guess: todayWord4, wordLength: 4 });

    expect(res.body.state).toBe("win");
    expect(res.body.attemptsUsed).toBe(1);
    // Score should include first-try bonus (base 1000 + first try 500 = 1500 minimum)
    expect(res.body.score).toBeGreaterThanOrEqual(1500);
  });

  test("word not in list returns 422 WORD_NOT_IN_LIST", async () => {
    const res = await request(app)
      .post("/api/game/guess")
      .send({ guess: "ZZZZ", wordLength: 4 });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe("WORD_NOT_IN_LIST");
  });

  test("wrong length word returns 400 VALIDATION_ERROR", async () => {
    const res = await request(app)
      .post("/api/game/guess")
      .send({ guess: "HOD", wordLength: 4 });

    expect(res.status).toBe(400);
  });

  test("anonymous player can play without auth", async () => {
    const res = await request(app)
      .post("/api/game/guess")
      .send({ guess: "HODL", wordLength: 4 });

    expect(res.status).toBe(200);
    expect(res.body.evaluation).toBeDefined();
  });

  test("loss after max attempts", async () => {
    const player = await createPlayer({ fid: "fid-loss" });
    await createPlayerStats(player.id);

    // Build a list of 4 valid 4-letter words that are NOT the daily word
    const all4 = ["HODL", "HASH", "MINT", "BURN", "DEFI", "SWAP"];
    const wrongs = all4.filter(w => w !== todayWord4).slice(0, 4);
    // With 6 options and 1 excluded we always have at least 4 remaining

    let lastRes;
    for (let i = 0; i < 4; i++) {
      lastRes = await authedRequest("fid-loss")
        .post("/api/game/guess")
        .send({ guess: wrongs[i % wrongs.length], wordLength: 4 });
      if (lastRes.body.state === "loss") break;
    }

    expect(lastRes.body.state).toBe("loss");
    expect(lastRes.body.score).toBeGreaterThan(0); // participation points
    expect(lastRes.body.targetWord).toBeDefined(); // revealed on loss
  });

  test("cannot guess after game is complete — ROUND_ALREADY_FINISHED", async () => {
    const player = await createPlayer({ fid: "fid-postgame" });
    await createPlayerStats(player.id);

    // Win the game
    await authedRequest("fid-postgame")
      .post("/api/game/guess")
      .send({ guess: todayWord4, wordLength: 4 });

    // Try to guess again
    const res = await authedRequest("fid-postgame")
      .post("/api/game/guess")
      .send({ guess: "HODL", wordLength: 4 });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ROUND_ALREADY_FINISHED");
  });

  test("session persists across requests", async () => {
    const player = await createPlayer({ fid: "fid-persist" });

    // Pick two wrong words guaranteed not to be today's word
    const all4  = ["HODL", "HASH", "MINT", "BURN", "DEFI", "SWAP"];
    const wrong = all4.filter(w => w !== todayWord4);
    const g1 = wrong[0];
    const g2 = wrong[1];

    // Guess 1
    const r1 = await authedRequest("fid-persist")
      .post("/api/game/guess")
      .send({ guess: g1, wordLength: 4 });
    expect(r1.body.attemptsUsed).toBe(1);
    expect(r1.body.state).toBe("playing");

    // Guess 2
    const r2 = await authedRequest("fid-persist")
      .post("/api/game/guess")
      .send({ guess: g2, wordLength: 4 });
    expect(r2.body.attemptsUsed).toBe(2);
    expect(r2.body.guesses).toHaveLength(2);
  });

  test("evaluations accumulate correctly in response", async () => {
    await createPlayer({ fid: "fid-evals" });

    const all4  = ["HODL", "HASH", "MINT", "BURN", "DEFI", "SWAP"];
    const wrong = all4.filter(w => w !== todayWord4);

    const r1 = await authedRequest("fid-evals")
      .post("/api/game/guess")
      .send({ guess: wrong[0], wordLength: 4 });
    expect(r1.body.evaluations).toHaveLength(1);

    const r2 = await authedRequest("fid-evals")
      .post("/api/game/guess")
      .send({ guess: wrong[1], wordLength: 4 });
    expect(r2.body.evaluations).toHaveLength(2);
  });
});

// ── POST /api/game/share ──────────────────────────────────────

describe("POST /api/game/share", () => {
  test("records a share event and returns ok", async () => {
    const player = await createPlayer({ fid: "fid-share" });
    await createPlayerStats(player.id);

    // Complete the game — the WIN response contains shareText
    const winRes = await authedRequest("fid-share")
      .post("/api/game/guess")
      .send({ guess: todayWord4, wordLength: 4 });
    expect(winRes.body.state).toBe("win");
    expect(winRes.body.shareText).toBeDefined(); // share text comes from the guess response

    // POST /game/share is a tracking ping — records the share event, returns ok
    const res = await authedRequest("fid-share")
      .post("/api/game/share")
      .send({ wordLength: 4, date: today });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ── Score integrity ───────────────────────────────────────────

describe("Score integrity", () => {
  test("score is always a positive integer", async () => {
    const player = await createPlayer({ fid: "fid-score-type" });
    await createPlayerStats(player.id);

    const res = await authedRequest("fid-score-type")
      .post("/api/game/guess")
      .send({ guess: todayWord4, wordLength: 4 });

    expect(Number.isInteger(res.body.score)).toBe(true);
    expect(res.body.score).toBeGreaterThan(0);
  });

  test("score is not influenced by client — body score field ignored", async () => {
    const player = await createPlayer({ fid: "fid-cheat" });
    await createPlayerStats(player.id);

    // Try to send a fake score in the body
    const res = await authedRequest("fid-cheat")
      .post("/api/game/guess")
      .send({ guess: todayWord4, wordLength: 4, score: 999999 });

    // Score should be server-calculated, not the cheated value
    expect(res.body.score).toBeLessThan(999999);
    expect(res.body.score).toBeGreaterThan(0);
  });
});
