// ============================================================
// Leaderboard + player stats integration tests
// ============================================================

const request = require("supertest");
const app     = require("../../app");
const wordEngine = require("../../services/wordEngine");
const {
  resetDb,
  createPlayer,
  createPlayerStats,
  seedWords,
  authedRequest,
} = require("./helpers");

process.env.WORD_SALT = "test-salt-deterministic";

let today;
let todayWord5;

beforeAll(async () => {
  await seedWords();
  today      = wordEngine.getTodayString();
  todayWord5 = wordEngine.getDailyWord(5, today, process.env.WORD_SALT);
});

beforeEach(async () => {
  await resetDb();
  await seedWords();
});

// ── Leaderboard ───────────────────────────────────────────────

describe("GET /api/leaderboard/daily", () => {
  test("returns empty leaderboard when no games played", async () => {
    const res = await request(app).get("/api/leaderboard/daily");
    expect(res.status).toBe(200);
    expect(res.body.entries).toBeDefined();
    expect(Array.isArray(res.body.entries)).toBe(true);
  });

  test("winning score appears on leaderboard", async () => {
    const player = await createPlayer({ fid: "fid-lb-1", username: "LBPlayer" });
    await createPlayerStats(player.id);

    // Win a game
    await authedRequest("fid-lb-1")
      .post("/api/game/guess")
      .send({ guess: todayWord5, wordLength: 5 });

    const res = await request(app).get("/api/leaderboard/daily");
    expect(res.status).toBe(200);
    const entry = res.body.entries.find(e => e.username === "LBPlayer");
    expect(entry).toBeDefined();
    expect(entry.score).toBeGreaterThan(0);
  });

  test("leaderboard is ordered by score descending", async () => {
    const p1 = await createPlayer({ fid: "fid-lb-rank-1", username: "HighScore" });
    const p2 = await createPlayer({ fid: "fid-lb-rank-2", username: "LowScore" });
    await createPlayerStats(p1.id);
    await createPlayerStats(p2.id);

    const today4word = wordEngine.getDailyWord(4, today, process.env.WORD_SALT);
    const all4 = ["HODL", "HASH", "MINT", "BURN", "DEFI", "SWAP"];
    const wrongWord = all4.find(w => w !== today4word);

    // p1 wins on attempt 1 (highest score)
    await authedRequest("fid-lb-rank-1")
      .post("/api/game/guess")
      .send({ guess: today4word, wordLength: 4 });

    // p2 guesses wrong first then wins on attempt 2
    await authedRequest("fid-lb-rank-2")
      .post("/api/game/guess")
      .send({ guess: wrongWord, wordLength: 4 });
    await authedRequest("fid-lb-rank-2")
      .post("/api/game/guess")
      .send({ guess: today4word, wordLength: 4 });

    const res = await request(app).get("/api/leaderboard/daily");
    const scores = res.body.entries.map(e => e.score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });
});

// ── Player stats ──────────────────────────────────────────────

describe("GET /api/player/me", () => {
  test("returns player:null for anonymous (no auth required)", async () => {
    const res = await request(app).get("/api/player/me");
    expect(res.status).toBe(200);
    expect(res.body.player).toBeNull();
    expect(res.body.stats).toBeNull();
  });

  test("returns player profile when authenticated", async () => {
    await createPlayer({ fid: "fid-me" });
    const res = await authedRequest("fid-me").get("/api/player/me");
    expect(res.status).toBe(200);
    expect(res.body.player).toBeDefined();
    expect(res.body.player.farcasterFid).toBe("fid-me");
  });

  test("stats update after winning a game", async () => {
    const player = await createPlayer({ fid: "fid-stats-win" });
    await createPlayerStats(player.id);

    const word = wordEngine.getDailyWord(4, today, process.env.WORD_SALT);

    // Win a game
    await authedRequest("fid-stats-win")
      .post("/api/game/guess")
      .send({ guess: word, wordLength: 4 });

    const res = await authedRequest("fid-stats-win").get("/api/player/me");
    expect(res.status).toBe(200);
    const stats = res.body.stats;
    expect(stats.wins).toBe(1);
    expect(stats.played).toBe(1);
    expect(stats.totalScore).toBeGreaterThan(0);
  });

  test("total_played increments on loss too", async () => {
    const player = await createPlayer({ fid: "fid-stats-loss" });
    await createPlayerStats(player.id);

    const word = wordEngine.getDailyWord(4, today, process.env.WORD_SALT);
    const all4  = ["HODL", "HASH", "MINT", "BURN", "DEFI", "SWAP"];
    const wrongs = all4.filter(w => w !== word);

    for (let i = 0; i < 4; i++) {
      const res = await authedRequest("fid-stats-loss")
        .post("/api/game/guess")
        .send({ guess: wrongs[i % wrongs.length], wordLength: 4 });
      if (res.body.state === "loss") break;
    }

    const res = await authedRequest("fid-stats-loss").get("/api/player/me");
    expect(res.body.stats.played).toBe(1);
    expect(res.body.stats.wins).toBe(0);
  });
});

// ── Streak ────────────────────────────────────────────────────

describe("Streak tracking", () => {
  test("first game starts streak at 1", async () => {
    const player = await createPlayer({ fid: "fid-streak-1" });
    await createPlayerStats(player.id, { current_streak: 0 });

    const word = wordEngine.getDailyWord(4, today, process.env.WORD_SALT);
    await authedRequest("fid-streak-1")
      .post("/api/game/guess")
      .send({ guess: word, wordLength: 4 });

    const res = await authedRequest("fid-streak-1").get("/api/player/me");
    expect(res.body.stats.streak).toBe(1);
  });

  test("continued streak adds bonus to score", async () => {
    // Player with existing 6-day streak (STREAK_3_TO_6 tier)
    const playerA = await createPlayer({ fid: "fid-streak-bonus" });
    const playerB = await createPlayer({ fid: "fid-no-streak" });
    // Use yesterday so the streak calculation sees dayDiff=1 and increments
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    await createPlayerStats(playerA.id, { current_streak: 6, last_played: yesterdayStr });
    await createPlayerStats(playerB.id, { current_streak: 0 });

    const word = wordEngine.getDailyWord(4, today, process.env.WORD_SALT);

    const resA = await authedRequest("fid-streak-bonus")
      .post("/api/game/guess")
      .send({ guess: word, wordLength: 4 });

    const resB = await authedRequest("fid-no-streak")
      .post("/api/game/guess")
      .send({ guess: word, wordLength: 4 });

    // Both won on attempt 1, but A has streak bonus
    expect(resA.body.score).toBeGreaterThan(resB.body.score);
  });
});

// ── Username update ───────────────────────────────────────────

describe("PATCH /api/player/username", () => {
  test("can update username when authenticated", async () => {
    await createPlayer({ fid: "fid-username" });

    const res = await authedRequest("fid-username")
      .patch("/api/player/username")
      .send({ username: "CoolNewName" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.username).toBe("CoolNewName");
  });

  test("returns 401 without auth", async () => {
    const res = await request(app)
      .patch("/api/player/username")
      .send({ username: "Hacker" });
    expect(res.status).toBe(401);
  });

  test("rejects empty username", async () => {
    await createPlayer({ fid: "fid-username-empty" });
    const res = await authedRequest("fid-username-empty")
      .patch("/api/player/username")
      .send({ username: "" });
    expect(res.status).toBe(400);
  });

  test("rejects username over 32 chars", async () => {
    await createPlayer({ fid: "fid-username-long" });
    const res = await authedRequest("fid-username-long")
      .patch("/api/player/username")
      .send({ username: "a".repeat(33) });
    expect(res.status).toBe(400);
  });
});
