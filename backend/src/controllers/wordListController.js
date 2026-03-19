const wordListService = require("../services/wordListService");
const wordEngine      = require("../services/wordEngine");

// ============================================================
// WORD LIST CONTROLLER
// All routes are admin-JWT protected (applied in routes/index.js)
//
// GET  /api/admin/wordlist/summary          — counts per length
// GET  /api/admin/wordlist/:length          — all words for length
// POST /api/admin/wordlist/:length          — add single word
// DELETE /api/admin/wordlist/:length/:word  — remove word
// POST /api/admin/wordlist/:length/import   — bulk import
// GET  /api/admin/wordlist/:length/schedule — upcoming daily schedule
// POST /api/admin/wordlist/reload           — force cache reload from DB
// ============================================================

async function getSummary(req, res, next) {
  try {
    const rows = await wordListService.getSummary();
    // Convert array to object keyed by length for easy client access
    const summary = {};
    for (const row of rows) {
      summary[row.length] = {
        total:       parseInt(row.active_count) + parseInt(row.inactive_count),
        active:      parseInt(row.active_count),
        inactive:    parseInt(row.inactive_count),
        lastUpdated: row.last_updated,
      };
    }
    res.json({ summary });
  } catch (err) { next(err); }
}

async function getWords(req, res, next) {
  try {
    const length          = parseInt(req.params.length);
    const includeInactive = req.query.inactive === "true";

    if (!wordEngine.SUPPORTED_LENGTHS.includes(length)) {
      return res.status(400).json({ error: "Invalid length. Must be 3, 4, 5, or 6." });
    }

    const words   = await wordListService.getWords(length, includeInactive);
    const today   = wordEngine.getTodayString();
    const todayWord = wordEngine.getDailyWord(length, today, process.env.WORD_SALT || "");

    res.json({
      length,
      count:     words.length,
      todayWord,
      words,
    });
  } catch (err) { next(err); }
}

async function addWord(req, res, next) {
  try {
    const length = parseInt(req.params.length);
    const { word, notes } = req.body;

    if (!word) return res.status(400).json({ error: "word is required" });
    if (!wordEngine.SUPPORTED_LENGTHS.includes(length)) {
      return res.status(400).json({ error: "Invalid length" });
    }

    const result = await wordListService.addWord(word, length, {
      notes,
      addedBy: "admin",
    });

    if (!result.success) {
      const isDuplicate = result.errors?.some(e => e.includes("already"));
      if (isDuplicate) {
        return res.status(409).json({ error: result.errors.join("; "), code: "WORD_ALREADY_EXISTS", errors: result.errors });
      }
      const code = result.errors.some(e => e.includes("letters")) ? "WORD_INVALID_LENGTH" :
                   result.errors.some(e => e.includes("Letters only")) ? "WORD_INVALID_CHARS" : "WORD_INVALID";
      return res.status(422).json({ error: result.errors.join("; "), code, errors: result.errors });
    }

    res.status(201).json({ ok: true, word: result.word, message: `"${result.word}" added to ${length}-letter list` });
  } catch (err) { next(err); }
}

async function removeWord(req, res, next) {
  try {
    const length = parseInt(req.params.length);
    const word   = req.params.word?.toUpperCase().trim();

    if (!word) return res.status(400).json({ error: "word is required" });

    const result = await wordListService.removeWord(word, length, "admin");

    if (!result.success) {
      return res.status(404).json({ error: result.error, code: "WORD_NOT_FOUND" });
    }

    res.json({ ok: true, word: result.word, warning: result.warning || null });
  } catch (err) { next(err); }
}

async function bulkImport(req, res, next) {
  try {
    const length = parseInt(req.params.length);
    const { words: rawText } = req.body;

    if (!rawText || typeof rawText !== "string") {
      return res.status(400).json({ error: "words (text) is required" });
    }
    if (!wordEngine.SUPPORTED_LENGTHS.includes(length)) {
      return res.status(400).json({ error: "Invalid length" });
    }

    const result = await wordListService.bulkImport(rawText, length, "admin");

    res.json({
      ok:       result.imported > 0,
      imported: result.imported,
      skipped:  result.skipped,
      errors:   result.errors,
      words:    result.words,
      message:  `${result.imported} words imported, ${result.skipped} skipped`,
    });
  } catch (err) { next(err); }
}

async function getSchedule(req, res, next) {
  try {
    const length = parseInt(req.params.length);
    const days   = Math.min(parseInt(req.query.days || 30), 60);

    if (!wordEngine.SUPPORTED_LENGTHS.includes(length)) {
      return res.status(400).json({ error: "Invalid length" });
    }

    const result = await wordListService.previewSchedule(length, days);
    res.json(result);
  } catch (err) { next(err); }
}

async function reloadCache(req, res, next) {
  try {
    const result = await wordEngine.reloadWords();
    res.json({ ok: true, ...result });
  } catch (err) { next(err); }
}

module.exports = {
  getSummary,
  getWords,
  addWord,
  removeWord,
  bulkImport,
  getSchedule,
  reloadCache,
};
