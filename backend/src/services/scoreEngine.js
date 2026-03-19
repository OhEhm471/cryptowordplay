// ============================================================
// SCORE ENGINE — Server-side deterministic scoring
// All calculations happen server-side. Client scores are ignored.
// ============================================================

const BASE_SCORES = {
  1: 1000,
  2: 800,
  3: 600,
  4: 400,
  5: 200, // A/B treatment: 5-attempt games get lower base for last-gasp wins
};

const BONUSES = {
  FIRST_TRY: 500,
  STREAK_7_PLUS: 200,
  STREAK_3_TO_6: 100,
  PARTICIPATION: 10, // for losses
};

/**
 * Calculate score for a completed round
 * @param {Object} params
 * @param {boolean} params.won
 * @param {number} params.attemptsUsed — 1 to 5 (5 only in A/B treatment variant)
 * @param {number} params.streakCount — player's current streak before this game
 * @returns {number} final score
 */
function calculateScore({ won, attemptsUsed, streakCount = 0 }) {
  if (!won) return BONUSES.PARTICIPATION;

  const base = BASE_SCORES[attemptsUsed] || 400;
  let bonus = 0;

  if (attemptsUsed === 1) bonus += BONUSES.FIRST_TRY;
  if (streakCount >= 7)   bonus += BONUSES.STREAK_7_PLUS;
  else if (streakCount >= 3) bonus += BONUSES.STREAK_3_TO_6;

  return base + bonus;
}

/**
 * Calculate updated streak
 * @param {string|null} lastPlayed — ISO date string or null
 * @param {number} currentStreak
 * @returns {number} new streak value
 */
function calculateStreak(lastPlayed, currentStreak) {
  if (!lastPlayed) return 1;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const last = new Date(lastPlayed);
  last.setUTCHours(0, 0, 0, 0);

  const dayDiff = Math.round((today - last) / (1000 * 60 * 60 * 24));

  if (dayDiff === 0) return currentStreak; // same day, no change
  if (dayDiff === 1) return currentStreak + 1; // consecutive day
  return 1; // streak broken
}

/**
 * Score breakdown for display purposes
 */
function getScoreBreakdown({ won, attemptsUsed, streakCount = 0 }) {
  if (!won) return { base: 0, bonuses: [], total: BONUSES.PARTICIPATION };

  const base = BASE_SCORES[attemptsUsed] || 400;
  const bonuses = [];

  if (attemptsUsed === 1) bonuses.push({ label: "First try!", value: BONUSES.FIRST_TRY });
  if (streakCount >= 7)   bonuses.push({ label: `🔥 ${streakCount + 1} day streak`, value: BONUSES.STREAK_7_PLUS });
  else if (streakCount >= 3) bonuses.push({ label: `🔥 ${streakCount + 1} day streak`, value: BONUSES.STREAK_3_TO_6 });

  const total = base + bonuses.reduce((sum, b) => sum + b.value, 0);
  return { base, bonuses, total };
}

module.exports = { calculateScore, calculateStreak, getScoreBreakdown, BASE_SCORES, BONUSES };
