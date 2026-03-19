// ============================================================
// Word list admin API integration tests
// ============================================================

const request = require("supertest");
const app     = require("../../app");
const wordEngine = require("../../services/wordEngine");
const { resetDb, seedWords, db } = require("./helpers");

process.env.ADMIN_SECRET = "test-admin-secret";

// Get a JWT admin token
let adminToken;

async function getAdminToken() {
  if (adminToken) return adminToken;
  const res = await request(app)
    .post("/api/admin/login")
    .send({ secret: process.env.ADMIN_SECRET });
  if (res.status !== 200) throw new Error(`Admin login failed: ${JSON.stringify(res.body)}`);
  adminToken = res.body.token;
  return adminToken;
}

beforeAll(async () => {
  await seedWords();
});

beforeEach(async () => {
  await resetDb();
  await seedWords();
  adminToken = null; // force fresh token each test
});

// ── Auth ──────────────────────────────────────────────────────

describe("Admin auth", () => {
  test("login with correct secret returns token", async () => {
    const res = await request(app)
      .post("/api/admin/login")
      .send({ secret: process.env.ADMIN_SECRET });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test("login with wrong secret returns 401", async () => {
    const res = await request(app)
      .post("/api/admin/login")
      .send({ secret: "wrong-secret" });
    expect(res.status).toBe(401);
  });

  test("word list endpoint requires auth", async () => {
    const res = await request(app).get("/api/admin/wordlist/summary");
    expect(res.status).toBe(401);
  });
});

// ── Word list CRUD ────────────────────────────────────────────

describe("Word list management", () => {
  test("GET /summary returns counts per length", async () => {
    const token = await getAdminToken();
    const res = await request(app)
      .get("/api/admin/wordlist/summary")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    // Should have counts for all 4 lengths
    for (const len of [3, 4, 5, 6]) {
      expect(res.body.summary[len]).toBeDefined();
      expect(res.body.summary[len].total).toBeGreaterThan(0);
    }
  });

  test("GET /:length returns word list", async () => {
    const token = await getAdminToken();
    const res = await request(app)
      .get("/api/admin/wordlist/4")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.words)).toBe(true);
    expect(res.body.words.length).toBeGreaterThan(0);
    // Each word should be length 4
    res.body.words.forEach(w => {
      expect(w.word.length).toBe(4);
    });
  });

  test("POST /:length adds a valid new word", async () => {
    const token = await getAdminToken();
    const res = await request(app)
      .post("/api/admin/wordlist/4")
      .set("Authorization", `Bearer ${token}`)
      .send({ word: "NEWW" });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);

    // Verify word is now valid
    await wordEngine.reloadWords();
    expect(wordEngine.isValidGuess("NEWW", 4)).toBe(true);
  });

  test("POST /:length rejects word with wrong length", async () => {
    const token = await getAdminToken();
    const res = await request(app)
      .post("/api/admin/wordlist/4")
      .set("Authorization", `Bearer ${token}`)
      .send({ word: "TOOLONG" });

    expect(res.status).toBe(422);
    expect(res.body.errors).toBeDefined();
  });

  test("POST /:length rejects duplicate word", async () => {
    const token = await getAdminToken();
    const res = await request(app)
      .post("/api/admin/wordlist/4")
      .set("Authorization", `Bearer ${token}`)
      .send({ word: "HODL" }); // already in seed

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("WORD_ALREADY_EXISTS");
  });

  test("DELETE /:length/:word soft-deletes a word", async () => {
    const token = await getAdminToken();
    const res = await request(app)
      .delete("/api/admin/wordlist/4/HODL")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Word should no longer be valid
    await wordEngine.reloadWords();
    expect(wordEngine.isValidGuess("HODL", 4)).toBe(false);
  });

  test("DELETE non-existent word returns 404", async () => {
    const token = await getAdminToken();
    const res = await request(app)
      .delete("/api/admin/wordlist/4/ZZZZ")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("WORD_NOT_FOUND");
  });

  test("POST /reload reloads cache and returns counts", async () => {
    const token = await getAdminToken();
    const res = await request(app)
      .post("/api/admin/wordlist/reload")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.loaded).toBeGreaterThan(0);
  });
});

// ── Bulk import ───────────────────────────────────────────────

describe("Bulk word import", () => {
  test("imports multiple new words and reports counts", async () => {
    const token = await getAdminToken();
    const res = await request(app)
      .post("/api/admin/wordlist/4/import")
      .set("Authorization", `Bearer ${token}`)
      .send({ words: "NEWX\nNEWY\nNEWZ" });

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(3);
    expect(res.body.skipped).toBe(0);
    expect(res.body.errors).toHaveLength(0);
  });

  test("skips duplicates and counts them as skipped, not imported", async () => {
    const token = await getAdminToken();
    const res = await request(app)
      .post("/api/admin/wordlist/4/import")
      .set("Authorization", `Bearer ${token}`)
      .send({ words: "NEWX\nHODL\nNEWY" }); // HODL is duplicate

    expect(res.status).toBe(200);
    // HODL should be skipped, not counted as imported
    expect(res.body.imported).toBe(2);
    expect(res.body.skipped).toBe(1);
  });

  test("reports per-word validation errors", async () => {
    const token = await getAdminToken();
    const res = await request(app)
      .post("/api/admin/wordlist/4/import")
      .set("Authorization", `Bearer ${token}`)
      .send({ words: "GOOD\nBADDDDDDD\nOKAY" }); // middle word too long

    expect(res.status).toBe(200);
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(res.body.errors.some(e => e.word === "BADDDDDDD")).toBe(true);
  });
});
