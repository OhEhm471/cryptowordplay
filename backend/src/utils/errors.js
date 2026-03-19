// ============================================================
// API ERROR CODES
// Machine-readable codes the frontend can switch on.
// Every error response includes { error: string, code: string }
// ============================================================

const E = {
  // ── Game ───────────────────────────────────────────────────
  INVALID_WORD_LENGTH:    "INVALID_WORD_LENGTH",
  WORD_NOT_IN_LIST:       "WORD_NOT_IN_LIST",
  WRONG_WORD_LENGTH:      "WRONG_WORD_LENGTH",
  ROUND_COMPLETE:         "ROUND_COMPLETE",
  ROUND_ALREADY_FINISHED: "ROUND_ALREADY_FINISHED",

  // ── Auth ───────────────────────────────────────────────────
  AUTH_REQUIRED:          "AUTH_REQUIRED",
  INVALID_SIGNATURE:      "INVALID_SIGNATURE",
  SESSION_EXPIRED:        "SESSION_EXPIRED",

  // ── Player ─────────────────────────────────────────────────
  PLAYER_NOT_FOUND:       "PLAYER_NOT_FOUND",
  USERNAME_TAKEN:         "USERNAME_TAKEN",
  USERNAME_INVALID:       "USERNAME_INVALID",

  // ── Word list ──────────────────────────────────────────────
  WORD_INVALID_LENGTH:    "WORD_INVALID_LENGTH",
  WORD_INVALID_CHARS:     "WORD_INVALID_CHARS",
  WORD_ALREADY_EXISTS:    "WORD_ALREADY_EXISTS",
  WORD_NOT_FOUND:         "WORD_NOT_FOUND",

  // ── A/B testing ────────────────────────────────────────────
  EXPERIMENT_NOT_FOUND:   "EXPERIMENT_NOT_FOUND",
  EXPERIMENT_SLUG_TAKEN:  "EXPERIMENT_SLUG_TAKEN",
  INVALID_STATUS:         "INVALID_STATUS",

  // ── Admin ──────────────────────────────────────────────────
  INVALID_CREDENTIALS:    "INVALID_CREDENTIALS",
  FORBIDDEN:              "FORBIDDEN",

  // ── General ────────────────────────────────────────────────
  VALIDATION_ERROR:       "VALIDATION_ERROR",
  NOT_FOUND:              "NOT_FOUND",
  INTERNAL_ERROR:         "INTERNAL_ERROR",
  RATE_LIMITED:           "RATE_LIMITED",
};

/**
 * Create a structured error response body.
 * Usage: res.status(422).json(apiError(E.WORD_NOT_IN_LIST, "Not a valid crypto term"))
 */
function apiError(code, message, extra = {}) {
  return { error: message, code, ...extra };
}

module.exports = { E, apiError };
