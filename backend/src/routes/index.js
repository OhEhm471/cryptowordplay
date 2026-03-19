const express        = require("express");
const gameCtrl       = require("../controllers/gameController");
const lbCtrl         = require("../controllers/leaderboardController");
const playerCtrl     = require("../controllers/playerController");
const fcCtrl         = require("../controllers/farcasterController");
const ogCtrl         = require("../controllers/ogController");
const achievCtrl     = require("../controllers/achievementController");
const adminCtrl      = require("../controllers/adminController");
const badgeCtrl      = require("../controllers/badgeController");
const wordListCtrl   = require("../controllers/wordListController");
const { optionalAuth } = require("../middleware/auth");
const { adminAuth }    = require("../middleware/adminAuth");
const { guessLimiter, authLimiter } = require("../middleware/rateLimiter");
const { abTestMiddleware }   = require("../middleware/abTestMiddleware");
const abTestCtrl             = require("../controllers/abTestController");
const db             = require("../db/postgres");
const redisCache     = require("../db/redis");

const router = express.Router();

// ── Health ──────────────────────────────────────────────────
router.get("/health", async (req, res) => {
  const [pgHealth, redisHealth] = await Promise.all([
    db.healthCheck(),
    redisCache.healthCheck(),
  ]);
  res.status(pgHealth.healthy ? 200 : 503).json({
    status:    pgHealth.healthy ? "ok" : "degraded",
    version:   process.env.APP_VERSION || "1.0.0",
    services:  { postgres: pgHealth, redis: redisHealth },
    timestamp: new Date().toISOString(),
  });
});

// ── Game ────────────────────────────────────────────────────
router.get("/game/daily/:length",  optionalAuth, abTestMiddleware, gameCtrl.getDailyChallenge);
router.get("/game/session/:length",optionalAuth, gameCtrl.getSession);
router.post("/game/guess",         optionalAuth, abTestMiddleware, guessLimiter, gameCtrl.validateGuess, gameCtrl.submitGuess);
router.post("/game/share",         optionalAuth, gameCtrl.trackShare);

// ── Leaderboard ─────────────────────────────────────────────
router.get("/leaderboard/daily",   optionalAuth, lbCtrl.getDaily);
router.get("/leaderboard/alltime", optionalAuth, lbCtrl.getAllTime);
router.get("/leaderboard/nearby",  optionalAuth, lbCtrl.getNearby);

// ── Player ──────────────────────────────────────────────────
router.get("/player/me",           optionalAuth, playerCtrl.getMe);
router.patch("/player/username",   optionalAuth, playerCtrl.updateUsername);

// ── Achievements ────────────────────────────────────────────
router.get("/achievements",        optionalAuth, achievCtrl.getMyAchievements);
router.get("/achievements/global", achievCtrl.getGlobalStats);

// ── OG Images ───────────────────────────────────────────────
router.get("/og/daily",   ogCtrl.getDailyCard);
router.get("/og/result",  ogCtrl.getResultCard);
router.get("/og/profile", ogCtrl.getProfileCard);

// ── Farcaster ───────────────────────────────────────────────
router.get("/farcaster/frame",    fcCtrl.getFrame);
router.post("/farcaster/webhook", fcCtrl.handleWebhook);

// ── Badges (onchain minting) ────────────────────────────────
router.get("/badges/status",             optionalAuth, badgeCtrl.getBadgeStatus);
router.post("/badges/voucher",           optionalAuth, badgeCtrl.requestVoucher);
router.post("/badges/confirm",           optionalAuth, badgeCtrl.confirmMint);
router.get("/badges/metadata/:tokenId",  badgeCtrl.getTokenMetadata);
router.get("/badges/contract",           badgeCtrl.getContractMetadata);

// ── Word List Management (admin JWT protected) ───────────────
router.get("/admin/wordlist/summary",              adminAuth, wordListCtrl.getSummary);
router.post("/admin/wordlist/reload",              authLimiter, adminAuth, wordListCtrl.reloadCache);
router.get("/admin/wordlist/:length",              adminAuth, wordListCtrl.getWords);
router.get("/admin/wordlist/:length/schedule",     adminAuth, wordListCtrl.getSchedule);
router.post("/admin/wordlist/:length",             adminAuth, wordListCtrl.addWord);
router.post("/admin/wordlist/:length/import",      adminAuth, wordListCtrl.bulkImport);
router.delete("/admin/wordlist/:length/:word",     adminAuth, wordListCtrl.removeWord);

// ── A/B Experiments (admin JWT protected) ────────────────────
router.get("/admin/ab/experiments",            adminAuth, abTestCtrl.listExperiments);
router.post("/admin/ab/experiments",           authLimiter, adminAuth, abTestCtrl.createExperiment);
router.get("/admin/ab/experiments/:id",        adminAuth, abTestCtrl.getExperiment);
router.patch("/admin/ab/experiments/:id",      adminAuth, abTestCtrl.updateExperiment);
router.get("/admin/ab/experiments/:id/results",adminAuth, abTestCtrl.getResults);
router.post("/admin/ab/experiments/:id/status",adminAuth, abTestCtrl.setStatus);

// ── Admin (JWT protected) ───────────────────────────────────
router.post("/admin/login",               authLimiter, adminCtrl.login);
router.get("/admin/dashboard",            adminAuth, adminCtrl.getDashboard);
router.get("/admin/words",                adminAuth, adminCtrl.getWordList);
router.get("/admin/words/daily",          adminAuth, adminCtrl.previewDailyWord);
router.get("/admin/words/schedule",       adminAuth, adminCtrl.previewDateRange);
router.get("/admin/players",              adminAuth, adminCtrl.getPlayers);
router.post("/admin/notify/daily",        authLimiter, adminAuth, adminCtrl.triggerDailyReminders);
router.post("/admin/notify/streak",       authLimiter, adminAuth, adminCtrl.triggerStreakWarnings);
router.post("/admin/cache/flush-leaderboard", authLimiter, adminAuth, adminCtrl.flushLeaderboardCache);
router.get("/admin/og/preview",           adminAuth, adminCtrl.previewOgImage);

module.exports = router;
