const { validationResult, body, param, query } = require("express-validator");
const wordEngine     = require("../services/wordEngine");
const scoreEngine    = require("../services/scoreEngine");
const shareGenerator = require("../services/shareGenerator");
const leaderboard    = require("../services/leaderboardService");
const playerService  = require("../services/playerService");
const analytics      = require("../services/analyticsService");
const db             = require("../db/postgres");
const cache          = require("../db/redis");
const logger         = require("../utils/logger");
const achievementSvc = require("../services/achievementService");
const rtLeaderboard  = require("../services/realtimeLeaderboard");
const notificationSvc = require("../services/notificationService");
const abTest         = require("../services/abTestService");
const { E, apiError } = require("../utils/errors");

const MAX_ATTEMPTS = 4;

// ============================================================
// GET /api/game/daily/:length
// Returns today's word length + attempt count (NOT the word itself)
// ============================================================
async function getDailyChallenge(req, res, next) {
  try {
    const length = parseInt(req.params.length);
    if (!wordEngine.SUPPORTED_LENGTHS.includes(length)) {
      return res.status(400).json(apiError(E.INVALID_WORD_LENGTH, "Invalid word length. Use 3, 4, 5, or 6."));
    }

    const today = wordEngine.getTodayString();

    // Cache daily word existence for anonymous metadata requests
    const ck = cache.KEYS.dailyWord(today, length);
    const cachedMeta = !req.player ? await cache.get(ck) : null;
    if (cachedMeta) {
      return res.json(cachedMeta);
    }

    // Return challenge metadata — not the word
    let session = null;
    if (req.player) {
      const { rows } = await db.query(
        `SELECT * FROM game_sessions WHERE player_id = $1 AND play_date = $2 AND word_length = $3`,
        [req.player.id, today, length]
      );
      session = rows[0] || null;
    }

    analytics.track(analytics.EVENTS.GAME_STARTED, req.player?.id, {
      word_length: length,
      date: today,
      resumed: !!session,
    });

    // A/B: max_attempts experiment
    const maxAttemptsVariant = req.abVariants?.get("max_attempts");
    const effectiveMax = maxAttemptsVariant === "treatment" ? 5 : MAX_ATTEMPTS;

    const responseBody = {
      date: today,
      wordLength: length,
      maxAttempts: effectiveMax,
      abVariants: req.abVariants ? Object.fromEntries(req.abVariants) : {},
      // Resume existing session if found
      session: session
        ? {
            guesses:      session.guesses,
            evaluations:  session.evaluations,
            state:        session.state,
            attemptsUsed: session.attempts_used,
            score:        session.score,
          }
        : null,
    };

    // Cache anonymous metadata for 5 minutes (no session data)
    if (!req.player) {
      await cache.set(ck, responseBody, 300);
    }

    res.json(responseBody);
  } catch (err) {
    next(err);
  }
}

// ============================================================
// POST /api/game/guess
// Validates and evaluates a single guess
// ============================================================
const validateGuess = [
  body("guess").isString().trim().toUpperCase().isLength({ min: 3, max: 6 }),
  body("wordLength").isInt({ min: 3, max: 6 }),
  body("sessionId").optional().isUUID(),
  // Cross-field: guess must match the declared word length
  body("guess").custom((val, { req }) => {
    const guess  = (val || "").trim().toUpperCase();
    const length = parseInt(req.body.wordLength);
    if (guess.length !== length) {
      throw new Error(`Guess must be exactly ${length} letters`);
    }
    return true;
  }),
];

async function submitGuess(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(apiError(E.VALIDATION_ERROR, "Invalid input", { details: errors.array() }));
    }

    const { guess, wordLength } = req.body;
    const length = parseInt(wordLength);
    const normalizedGuess = wordEngine.normalizeWord(guess);
    const today = wordEngine.getTodayString();

    // Validate word is in allowed list
    if (!wordEngine.isValidGuess(normalizedGuess, length)) {
      return res.status(422).json(apiError(E.WORD_NOT_IN_LIST, "Not in word list", { hint: "Use a valid crypto term" }));
    }

    // Get the actual target word (server-side only)
    const targetWord = wordEngine.getDailyWord(length, today, process.env.WORD_SALT);

    // Evaluate guess
    const evaluation = wordEngine.evaluateGuess(normalizedGuess, targetWord);
    const isCorrect  = normalizedGuess === targetWord;

    // Load or create session
    let sessionData = await getOrCreateSession(req.player?.id, length, today, targetWord);

    // A/B: read effective max attempts for this player
    const _maxAttVariant = req.abVariants?.get("max_attempts");
    const effectiveMaxAttempts = _maxAttVariant === "treatment" ? 5 : MAX_ATTEMPTS;

    // Anti-cheat: check attempt limit
    if (sessionData.attempts_used >= effectiveMaxAttempts) {
      return res.status(409).json(apiError(E.ROUND_COMPLETE, "Round already complete"));
    }
    if (sessionData.state !== "playing") {
      return res.status(409).json(apiError(E.ROUND_ALREADY_FINISHED, "Round already finished"));
    }

    // Update session
    const newGuesses     = [...(sessionData.guesses || []),     normalizedGuess];
    const newEvaluations = [...(sessionData.evaluations || []), evaluation];
    const newAttempts    = sessionData.attempts_used + 1;
    const won  = isCorrect;
    const lost = !won && newAttempts >= effectiveMaxAttempts;
    const newState = won ? "win" : lost ? "loss" : "playing";

    let score = 0;
    let scoreBreakdown = null;
    let updatedStats = null;
    let response_achievements = [];

    if (won || lost) {
      // Calculate score server-side
      const playerStats = req.player ? await playerService.getStats(req.player.id) : null;
      const currentStreak = playerStats?.current_streak || 0;
      score = scoreEngine.calculateScore({ won, attemptsUsed: newAttempts, streakCount: currentStreak });
      scoreBreakdown = scoreEngine.getScoreBreakdown({ won, attemptsUsed: newAttempts, streakCount: currentStreak });

      if (req.player) {
        const newStreak = scoreEngine.calculateStreak(playerStats?.last_played, currentStreak);
        await playerService.updateStats({
          playerId: req.player.id,
          won,
          score,
          streakCount: newStreak,
        });

        await leaderboard.submitScore({
          playerId:   req.player.id,
          sessionId:  sessionData.id,
          score,
          attempts:   newAttempts,
          won,
          wordLength: length,
          date:       today,
        });

        updatedStats = await playerService.getStats(req.player.id);

        // ── Sprint 3: Real-time leaderboard (Redis sorted set) ──
        rtLeaderboard.submitScore({
          playerId: req.player.id,
          username: req.player.username || "Player",
          score,
          date:     today,
        }).catch(err => logger.debug("Realtime leaderboard update failed (non-critical)", { error: err.message }));

        // ── Sprint 3: Achievement detection ──────────────────────
        const completedSess = { ...sessionData, attempts_used: newAttempts, state: newState, score, word_length: length };
        // Build ctx for context-sensitive achievements
        let achievementCtx = {};
        if (won) {
          // For all_lengths: fetch which word lengths the player has won today
          const { rows: todayWins } = await db.query(
            `SELECT word_length FROM game_sessions
             WHERE player_id = $1 AND play_date = $2 AND state = 'win'`,
            [req.player.id, today]
          );
          achievementCtx.winsToday = todayWins.map(r => r.word_length);
        }

        const newAchievements = await achievementSvc.checkAndUnlock({
          playerId: req.player.id,
          stats:    updatedStats,
          session:  completedSess,
          ctx:      achievementCtx,
        });
        if (newAchievements.length > 0) {
          response_achievements = newAchievements;
          // Send push notification for achievements (fire-and-forget)
          if (req.player.farcaster_fid) {
            newAchievements.forEach(a =>
              notificationSvc.sendAchievementNotification(req.player.farcaster_fid, a).catch(err => logger.debug("Achievement notification failed", { error: err.message }))
            );
          }
        }
      }

      analytics.track(
        won ? analytics.EVENTS.GAME_WON : analytics.EVENTS.GAME_LOST,
        req.player?.id,
        { word_length: length, attempts: newAttempts, score }
      );

      // A/B: track goal events for active experiments
      if (req.abIdentity) {
        abTest.trackGoal(req.abIdentity.key, won ? "game_won" : "game_lost", {
          score, attempts: newAttempts, wordLength: length,
        }).catch(err => logger.debug("A/B goal tracking failed", { error: err.message }));
      }
    } else {
      analytics.track(analytics.EVENTS.GUESS_SUBMITTED, req.player?.id, {
        word_length: length,
        attempt_num: newAttempts,
      });
    }

    // Persist session
    await saveSession(sessionData.id, {
      guesses:      newGuesses,
      evaluations:  newEvaluations,
      attemptsUsed: newAttempts,
      state:        newState,
      score,
    });

    // Build response — never include targetWord unless game over
    const response = {
      evaluation,
      isCorrect,
      attemptsUsed:  newAttempts,
      attemptsLeft:  effectiveMaxAttempts - newAttempts,
      state:         newState,
      guesses:       newGuesses,
      evaluations:   newEvaluations,
    };

    if (won || lost) {
      response.targetWord          = targetWord; // reveal on game over
      response.newAchievements     = response_achievements;
      response.score          = score;
      response.scoreBreakdown = scoreBreakdown;
      response.stats          = updatedStats;
      if (won) {
        response.shareText = shareGenerator.generateShareText({
          evaluations:  newEvaluations,
          won:          true,
          totalAttempts: newAttempts,
          maxAttempts:  effectiveMaxAttempts,
        });
        response.castUrl = shareGenerator.generateFarcasterCastUrl({
          evaluations:  newEvaluations,
          won:          true,
          totalAttempts: newAttempts,
          maxAttempts:  effectiveMaxAttempts,
        });
      } else {
        response.shareText = shareGenerator.generateShareText({
          evaluations:  newEvaluations,
          won:          false,
          totalAttempts: newAttempts,
          maxAttempts:  effectiveMaxAttempts,
        });
      }
    }

    res.json(response);
  } catch (err) {
    next(err);
  }
}

// ============================================================
// GET /api/game/session/:length
// Resume an existing session for today
// ============================================================
async function getSession(req, res, next) {
  try {
    const length = parseInt(req.params.length);
    const today  = wordEngine.getTodayString();

    if (!req.player) {
      return res.json({ session: null });
    }

    const { rows } = await db.query(
      `SELECT * FROM game_sessions WHERE player_id = $1 AND play_date = $2 AND word_length = $3`,
      [req.player.id, today, length]
    );

    const session = rows[0];
    if (!session) return res.json({ session: null });

    const response = {
      session: {
        guesses:      session.guesses,
        evaluations:  session.evaluations,
        state:        session.state,
        attemptsUsed: session.attempts_used,
        score:        session.score,
      },
    };

    // Reveal target word if game is over
    if (session.state !== "playing") {
      response.session.targetWord = session.target_word;
    }

    res.json(response);
  } catch (err) {
    next(err);
  }
}

// ============================================================
// POST /api/game/share
// Track share event and return enriched share data
// ============================================================
async function trackShare(req, res, next) {
  try {
    analytics.track(analytics.EVENTS.RESULT_SHARED, req.player?.id, {
      word_length: req.body.wordLength,
    });

    // Check share-based achievements (first_share, share_10)
    if (req.player) {
      // Increment share_count in player_stats
      await db.query(
        `UPDATE player_stats SET share_count = share_count + 1 WHERE player_id = $1`,
        [req.player.id]
      );
      const updatedStats = await playerService.getStats(req.player.id);
      achievementSvc.checkAndUnlock({
        playerId: req.player.id,
        stats:    updatedStats,
        session:  null,
        ctx:      { shared: true },
      }).catch(err => logger.debug("Share achievement check failed", { error: err.message }));
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ============================================================
// Helpers
// ============================================================
async function getOrCreateSession(playerId, wordLength, date, targetWord) {
  if (!playerId) {
    // Anonymous session (in-memory only, no persistence)
    return {
      id:           null,
      guesses:      [],
      evaluations:  [],
      attempts_used: 0,
      state:        "playing",
      score:        0,
    };
  }

  const { rows } = await db.query(
    `SELECT * FROM game_sessions WHERE player_id = $1 AND play_date = $2 AND word_length = $3`,
    [playerId, date, wordLength]
  );

  if (rows[0]) return rows[0];

  // Create new session
  const { rows: created } = await db.query(
    `INSERT INTO game_sessions (player_id, word_length, target_word, play_date)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [playerId, wordLength, targetWord, date]
  );
  return created[0];
}

async function saveSession(sessionId, data) {
  if (!sessionId) return; // anonymous — skip
  await db.query(
    `UPDATE game_sessions SET
       guesses       = $2,
       evaluations   = $3,
       attempts_used = $4,
       state         = $5,
       score         = $6,
       completed_at  = CASE WHEN $5 != 'playing' THEN NOW() ELSE completed_at END,
       updated_at    = NOW()
     WHERE id = $1`,
    [
      sessionId,
      JSON.stringify(data.guesses),
      JSON.stringify(data.evaluations),
      data.attemptsUsed,
      data.state,
      data.score,
    ]
  );
}

module.exports = {
  getDailyChallenge,
  submitGuess,
  validateGuess,
  getSession,
  trackShare,
};
