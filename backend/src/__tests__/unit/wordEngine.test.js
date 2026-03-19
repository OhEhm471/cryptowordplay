// ============================================================
// wordEngine unit tests
// Pure logic — no DB, no Redis, no network.
// ============================================================

const wordEngine = require("../../services/wordEngine");

// ── evaluateGuess ─────────────────────────────────────────────
describe("evaluateGuess", () => {
  test("all green on exact match", () => {
    expect(wordEngine.evaluateGuess("HODL", "HODL"))
      .toEqual(["green", "green", "green", "green"]);
  });

  test("all gray when nothing matches", () => {
    expect(wordEngine.evaluateGuess("BURN", "HODL"))
      .toEqual(["gray", "gray", "gray", "gray"]);
  });

  test("yellow for correct letter in wrong position", () => {
    // O is in HODL at position 1 — guessing OLHD puts it at position 0
    const result = wordEngine.evaluateGuess("OLHD", "HODL");
    // O at pos 0: exists in target at pos 1 → yellow
    // L at pos 2: exists in target at pos 3 → yellow
    expect(result[0]).toBe("yellow"); // O in wrong position
    expect(result[2]).toBe("yellow"); // L in wrong position
  });

  test("green takes priority over yellow for same letter", () => {
    // LLAMA vs LLANO — first L should be green, second L gray (already consumed)
    const result = wordEngine.evaluateGuess("LLANO", "LLAMA");
    expect(result[0]).toBe("green"); // L exact
    expect(result[1]).toBe("green"); // L exact
    expect(result[2]).toBe("green"); // A exact
  });

  test("duplicate letters in guess — only marks one yellow", () => {
    // LLOOT vs BLOCK — two O's in guess, target has one O at pos2 (exact match)
    // pos0: L gray, pos1: L gray, pos2: O green (exact), pos3: O gray (O consumed), pos4: T gray
    const result = wordEngine.evaluateGuess("LLOOT", "BLOCK");
    // Exactly one match for O — the exact one at pos2 is green
    expect(result[2]).toBe("green");
    // The second O (pos3) must be gray — not double-counted
    expect(result[3]).toBe("gray");
    // No letter should be marked both green and yellow
    const matchCount = result.filter(r => r === "green" || r === "yellow").length;
    expect(matchCount).toBeLessThanOrEqual(2); // B at 0 is irrelevant here; just max sanity check
  });

  test("throws when guess length !== target length", () => {
    expect(() => wordEngine.evaluateGuess("HODL", "CHAIN"))
      .toThrow();
  });

  test("5-letter perfect match", () => {
    expect(wordEngine.evaluateGuess("CHAIN", "CHAIN"))
      .toEqual(["green","green","green","green","green"]);
  });

  test("3-letter evaluation", () => {
    const result = wordEngine.evaluateGuess("BTC", "ETH");
    expect(result).toHaveLength(3);
    expect(result.every(r => r === "gray")).toBe(true);
  });
});

// ── getDailyWord ──────────────────────────────────────────────
describe("getDailyWord", () => {
  test("returns a string from the word list", () => {
    const word = wordEngine.getDailyWord(4, "2024-01-01", "test-salt");
    expect(typeof word).toBe("string");
    expect(word.length).toBe(4);
  });

  test("is deterministic — same inputs always same output", () => {
    const a = wordEngine.getDailyWord(5, "2024-06-15", "salt123");
    const b = wordEngine.getDailyWord(5, "2024-06-15", "salt123");
    expect(a).toBe(b);
  });

  test("different dates produce potentially different words", () => {
    // Not guaranteed to differ for every pair, but across 30 days expect variance
    const words = new Set();
    for (let d = 1; d <= 30; d++) {
      const date = `2024-01-${String(d).padStart(2, "0")}`;
      words.add(wordEngine.getDailyWord(4, date, "test-salt"));
    }
    expect(words.size).toBeGreaterThan(1);
  });

  test("different salts produce different words (for same date)", () => {
    const a = wordEngine.getDailyWord(4, "2024-01-01", "salt-a");
    const b = wordEngine.getDailyWord(4, "2024-01-01", "salt-b");
    // Very likely different — if this ever fails try a different date pair
    expect(a).not.toBe(b);
  });

  test("supported lengths return correct length words", () => {
    for (const len of [3, 4, 5, 6]) {
      const word = wordEngine.getDailyWord(len, "2024-03-01", "test");
      expect(word.length).toBe(len);
    }
  });

  test("throws for unsupported length", () => {
    expect(() => wordEngine.getDailyWord(7, "2024-01-01", "salt"))
      .toThrow();
  });
});

// ── isValidGuess ──────────────────────────────────────────────
describe("isValidGuess", () => {
  test("known valid word returns true", () => {
    // HODL is in the 4-letter fallback list
    expect(wordEngine.isValidGuess("HODL", 4)).toBe(true);
  });

  test("case-insensitive — lowercase accepted", () => {
    expect(wordEngine.isValidGuess("hodl", 4)).toBe(true);
  });

  test("word not in list returns false", () => {
    expect(wordEngine.isValidGuess("ZZZZ", 4)).toBe(false);
  });

  test("wrong length returns false", () => {
    expect(wordEngine.isValidGuess("HODL", 5)).toBe(false);
  });

  test("non-alpha returns false", () => {
    expect(wordEngine.isValidGuess("H0DL", 4)).toBe(false);
  });

  test("empty string returns false", () => {
    expect(wordEngine.isValidGuess("", 4)).toBe(false);
  });
});

// ── validateCandidate ─────────────────────────────────────────
describe("validateCandidate", () => {
  test("valid new word passes", () => {
    const result = wordEngine.validateCandidate("NEWW", 4);
    // NEWW is not in the list, correct length, all letters
    expect(result.errors).toHaveLength(0);
    expect(result.valid).toBe(true);
    expect(result.word).toBe("NEWW");
  });

  test("normalizes to uppercase", () => {
    const result = wordEngine.validateCandidate("neww", 4);
    expect(result.word).toBe("NEWW");
  });

  test("wrong length fails", () => {
    const result = wordEngine.validateCandidate("HOD", 4);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("4 letters"))).toBe(true);
  });

  test("already in list fails", () => {
    const result = wordEngine.validateCandidate("HODL", 4);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("already"))).toBe(true);
  });

  test("numbers in word fail", () => {
    const result = wordEngine.validateCandidate("H0DL", 4);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("Letters only"))).toBe(true);
  });

  test("empty word fails", () => {
    const result = wordEngine.validateCandidate("", 4);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("empty"))).toBe(true);
  });
});

// ── normalizeWord ─────────────────────────────────────────────
describe("normalizeWord", () => {
  test("lowercases and trims", () => {
    expect(wordEngine.normalizeWord("  hodl  ")).toBe("HODL");
  });

  test("already uppercase passthrough", () => {
    expect(wordEngine.normalizeWord("CHAIN")).toBe("CHAIN");
  });
});
