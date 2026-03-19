// ============================================================
// scoreEngine unit tests
// Pure math — no DB, no Redis.
// ============================================================

const {
  calculateScore,
  calculateStreak,
  getScoreBreakdown,
  BASE_SCORES,
  BONUSES,
} = require("../../services/scoreEngine");

// ── calculateScore ────────────────────────────────────────────
describe("calculateScore", () => {
  test("loss returns participation points only", () => {
    expect(calculateScore({ won: false, attemptsUsed: 4, streakCount: 0 }))
      .toBe(BONUSES.PARTICIPATION);
  });

  test("win on attempt 1 — base + first-try bonus", () => {
    const score = calculateScore({ won: true, attemptsUsed: 1, streakCount: 0 });
    expect(score).toBe(BASE_SCORES[1] + BONUSES.FIRST_TRY);
  });

  test("win on attempt 2", () => {
    expect(calculateScore({ won: true, attemptsUsed: 2, streakCount: 0 }))
      .toBe(BASE_SCORES[2]);
  });

  test("win on attempt 3", () => {
    expect(calculateScore({ won: true, attemptsUsed: 3, streakCount: 0 }))
      .toBe(BASE_SCORES[3]);
  });

  test("win on attempt 4 — minimum base score", () => {
    expect(calculateScore({ won: true, attemptsUsed: 4, streakCount: 0 }))
      .toBe(BASE_SCORES[4]);
  });

  test("streak 3-6 adds STREAK_3_TO_6 bonus", () => {
    const base  = calculateScore({ won: true, attemptsUsed: 2, streakCount: 0 });
    const bonus = calculateScore({ won: true, attemptsUsed: 2, streakCount: 4 });
    expect(bonus - base).toBe(BONUSES.STREAK_3_TO_6);
  });

  test("streak 7+ adds STREAK_7_PLUS bonus", () => {
    const base  = calculateScore({ won: true, attemptsUsed: 2, streakCount: 0 });
    const bonus = calculateScore({ won: true, attemptsUsed: 2, streakCount: 10 });
    expect(bonus - base).toBe(BONUSES.STREAK_7_PLUS);
  });

  test("streak bonus does not stack — only highest tier applies", () => {
    const s7  = calculateScore({ won: true, attemptsUsed: 3, streakCount: 7 });
    const s10 = calculateScore({ won: true, attemptsUsed: 3, streakCount: 10 });
    // Both streak 7 and 10 are in the 7+ tier — same bonus
    expect(s7).toBe(s10);
  });

  test("streak 2 gets no bonus", () => {
    const base   = calculateScore({ won: true, attemptsUsed: 2, streakCount: 0 });
    const streak = calculateScore({ won: true, attemptsUsed: 2, streakCount: 2 });
    expect(streak).toBe(base);
  });

  test("first-try + streak 7+ stacks both bonuses", () => {
    const score = calculateScore({ won: true, attemptsUsed: 1, streakCount: 8 });
    expect(score).toBe(BASE_SCORES[1] + BONUSES.FIRST_TRY + BONUSES.STREAK_7_PLUS);
  });

  test("streakCount defaults to 0 when omitted", () => {
    const explicit = calculateScore({ won: true, attemptsUsed: 2, streakCount: 0 });
    const omitted  = calculateScore({ won: true, attemptsUsed: 2 });
    expect(explicit).toBe(omitted);
  });
});

// ── calculateStreak ───────────────────────────────────────────
describe("calculateStreak", () => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  function daysAgo(n) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().split("T")[0];
  }

  test("first game ever (no lastPlayed) returns 1", () => {
    expect(calculateStreak(null, 0)).toBe(1);
  });

  test("played yesterday — increments streak", () => {
    expect(calculateStreak(daysAgo(1), 5)).toBe(6);
  });

  test("played today already — streak unchanged (double submit guard)", () => {
    expect(calculateStreak(daysAgo(0), 5)).toBe(5);
  });

  test("missed a day — streak resets to 1", () => {
    expect(calculateStreak(daysAgo(2), 10)).toBe(1);
  });

  test("missed many days — streak resets to 1", () => {
    expect(calculateStreak(daysAgo(30), 50)).toBe(1);
  });

  test("streak 0 played yesterday becomes 1", () => {
    expect(calculateStreak(daysAgo(1), 0)).toBe(1);
  });
});

// ── getScoreBreakdown ─────────────────────────────────────────
describe("getScoreBreakdown", () => {
  test("loss breakdown has zero base and participation total", () => {
    const bd = getScoreBreakdown({ won: false, attemptsUsed: 4 });
    expect(bd.base).toBe(0);
    expect(bd.total).toBe(BONUSES.PARTICIPATION);
    expect(bd.bonuses).toHaveLength(0);
  });

  test("win breakdown total matches calculateScore", () => {
    const params = { won: true, attemptsUsed: 2, streakCount: 5 };
    const score  = calculateScore(params);
    const bd     = getScoreBreakdown(params);
    expect(bd.total).toBe(score);
  });

  test("first-try win includes first-try bonus entry", () => {
    const bd = getScoreBreakdown({ won: true, attemptsUsed: 1, streakCount: 0 });
    expect(bd.bonuses.some(b => b.label.toLowerCase().includes("first"))).toBe(true);
  });

  test("streak 7+ includes streak bonus entry", () => {
    const bd = getScoreBreakdown({ won: true, attemptsUsed: 2, streakCount: 9 });
    expect(bd.bonuses.some(b => b.value === BONUSES.STREAK_7_PLUS)).toBe(true);
  });

  test("streak 3-6 includes streak bonus entry at lower value", () => {
    const bd = getScoreBreakdown({ won: true, attemptsUsed: 2, streakCount: 3 });
    expect(bd.bonuses.some(b => b.value === BONUSES.STREAK_3_TO_6)).toBe(true);
  });

  test("base field matches BASE_SCORES table", () => {
    for (const [attempts, baseScore] of Object.entries(BASE_SCORES)) {
      const bd = getScoreBreakdown({ won: true, attemptsUsed: parseInt(attempts), streakCount: 0 });
      expect(bd.base).toBe(baseScore);
    }
  });
});
