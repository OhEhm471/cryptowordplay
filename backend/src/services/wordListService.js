const db         = require("../db/postgres");
const wordEngine = require("./wordEngine");
const logger     = require("../utils/logger");

// ============================================================
// WORD LIST SERVICE
// All mutations call wordEngine.reloadWords() after committing
// so the in-memory cache stays in sync with the DB.
// ============================================================

/**
 * Get all words for a length with metadata.
 * Returns both active and inactive (so removals are auditable).
 */
async function getWords(length, includeInactive = false) {
  const params = [parseInt(length)];
  let sql = `
    SELECT id, word, length, active, notes, added_by, added_at, removed_at
    FROM word_lists
    WHERE length = $1
  `;
  if (!includeInactive) {
    sql += " AND active = TRUE";
  }
  sql += " ORDER BY word ASC";

  const { rows } = await db.query(sql, params);
  return rows;
}

/**
 * Get summary counts for all lengths.
 */
async function getSummary() {
  const { rows } = await db.query(`
    SELECT length,
           COUNT(*) FILTER (WHERE active = TRUE)  AS active_count,
           COUNT(*) FILTER (WHERE active = FALSE) AS inactive_count,
           MAX(added_at) AS last_updated
    FROM word_lists
    GROUP BY length
    ORDER BY length
  `);
  return rows;
}

/**
 * Add a single word.
 * Returns { success, word, error? }
 */
async function addWord(word, length, { notes = null, addedBy = "admin" } = {}) {
  const validation = wordEngine.validateCandidate(word, length);
  if (!validation.valid) {
    return { success: false, word: validation.word, errors: validation.errors };
  }

  const w = validation.word;
  try {
    await db.query(
      `INSERT INTO word_lists (word, length, notes, added_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (word, length) DO UPDATE
         SET active = TRUE, removed_at = NULL, notes = EXCLUDED.notes, added_by = EXCLUDED.added_by`,
      [w, parseInt(length), notes, addedBy]
    );
    await wordEngine.reloadWords();
    logger.info("Word added", { word: w, length, addedBy });
    return { success: true, word: w };
  } catch (err) {
    return { success: false, word: w, errors: [err.message] };
  }
}

/**
 * Remove a word (soft delete — sets active=false).
 * Returns { success, word, warning? }
 */
async function removeWord(word, length, removedBy = "admin") {
  const w = wordEngine.normalizeWord(word);

  // Warn if this word is today's daily word
  const today    = wordEngine.getTodayString();
  const todayWord = wordEngine.getDailyWord(length, today, process.env.WORD_SALT || "");
  const isToday  = todayWord === w;

  const { rowCount } = await db.query(
    `UPDATE word_lists
     SET active = FALSE, removed_at = NOW(), added_by = $3
     WHERE word = $1 AND length = $2 AND active = TRUE`,
    [w, parseInt(length), removedBy]
  );

  if (rowCount === 0) {
    return { success: false, error: `"${w}" not found in active ${length}-letter list` };
  }

  await wordEngine.reloadWords();
  logger.info("Word removed", { word: w, length, removedBy });

  return {
    success: true,
    word: w,
    warning: isToday ? `⚠️ "${w}" was today's daily word — today's game is already in progress` : null,
  };
}

/**
 * Bulk import words from a text input.
 * Accepts comma-separated or newline-separated input.
 * Returns { imported, skipped, errors }
 */
async function bulkImport(rawText, length, addedBy = "admin") {
  // Parse input — split on commas, newlines, spaces, tabs
  const candidates = rawText
    .split(/[\s,\n\r\t]+/)
    .map(w => w.trim())
    .filter(Boolean);

  if (candidates.length === 0) {
    return { imported: 0, skipped: 0, errors: [{ word: "", error: "No words found in input" }] };
  }
  if (candidates.length > 500) {
    return { imported: 0, skipped: 0, errors: [{ word: "", error: "Max 500 words per import" }] };
  }

  const results = { imported: 0, skipped: 0, errors: [], words: [] };

  for (const raw of candidates) {
    const validation = wordEngine.validateCandidate(raw, length);
    if (!validation.valid) {
      results.skipped++;
      results.errors.push({ word: raw, error: validation.errors.join("; ") });
      continue;
    }

    try {
      const { rows: insertRows } = await db.query(
        `INSERT INTO word_lists (word, length, added_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (word, length) DO UPDATE
           SET active = TRUE, removed_at = NULL
         RETURNING (xmax = 0) AS was_inserted`,
        [validation.word, parseInt(length), addedBy]
      );
      if (insertRows[0]?.was_inserted) {
        results.imported++;
        results.words.push(validation.word);
      } else {
        // Word already existed (and is now active) — count as skipped
        results.skipped++;
      }
    } catch (err) {
      results.skipped++;
      results.errors.push({ word: raw, error: err.message });
    }
  }

  if (results.imported > 0) {
    await wordEngine.reloadWords();
    logger.info("Bulk import complete", { length, imported: results.imported, skipped: results.skipped, addedBy });
  }

  return results;
}

/**
 * Preview which words are scheduled as daily words for the next N days.
 * Useful to spot undesirable words coming up before they're served.
 */
async function previewSchedule(length, days = 30) {
  const schedule = [];
  const today    = new Date();
  for (let i = 0; i < Math.min(days, 60); i++) {
    const d    = new Date(today.getTime() + i * 86400000);
    const date = d.toISOString().split("T")[0];
    const word = wordEngine.getDailyWord(length, date, process.env.WORD_SALT || "");
    schedule.push({ date, word, isToday: i === 0 });
  }
  return { length: parseInt(length), schedule };
}

module.exports = {
  getWords,
  getSummary,
  addWord,
  removeWord,
  bulkImport,
  previewSchedule,
};
