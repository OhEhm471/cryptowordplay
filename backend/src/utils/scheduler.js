const cron    = require("node-cron");
const logger  = require("../utils/logger");
const notifications  = require("../services/notificationService");
const rtLeaderboard  = require("../services/realtimeLeaderboard");
const wordEngine     = require("../services/wordEngine");

// ============================================================
// CRON SCHEDULER
// All jobs run server-side. Times are UTC.
// ============================================================

let jobs = [];

function start() {
  if (process.env.NODE_ENV === "test") return;

  // ── Seed Redis leaderboard on startup ──────────────────────
  const today = wordEngine.getTodayString();
  rtLeaderboard.seedFromPostgres(today).catch(err => logger.warn("Startup leaderboard seed failed", { error: err.message }));

  // ── 09:00 UTC — Daily reminder notifications ───────────────
  jobs.push(cron.schedule("0 9 * * *", async () => {
    logger.info("CRON: daily reminders");
    try { await notifications.sendDailyReminders(); }
    catch (err) { logger.error("CRON daily reminders failed", { error: err.message }); }
  }, { timezone: "UTC" }));

  // ── 21:00 UTC — Streak-at-risk warnings (3h before midnight) ─
  jobs.push(cron.schedule("0 21 * * *", async () => {
    logger.info("CRON: streak warnings");
    try { await notifications.sendStreakWarnings(); }
    catch (err) { logger.error("CRON streak warnings failed", { error: err.message }); }
  }, { timezone: "UTC" }));

  // ── 00:01 UTC — New day: seed fresh leaderboard ────────────
  jobs.push(cron.schedule("1 0 * * *", async () => {
    const newDay = wordEngine.getTodayString();
    logger.info("CRON: new day seed", { date: newDay });
    try { await rtLeaderboard.seedFromPostgres(newDay); }
    catch (err) { logger.error("CRON seed failed", { error: err.message }); }
  }, { timezone: "UTC" }));

  // ── Every 10 minutes — Health log ──────────────────────────
  jobs.push(cron.schedule("*/10 * * * *", () => {
    logger.debug("CRON: heartbeat", { time: new Date().toISOString() });
  }));

  logger.info(`CRON: ${jobs.length} jobs scheduled`);
}

function stop() {
  jobs.forEach(j => j.stop());
  jobs = [];
  logger.info("CRON: all jobs stopped");
}

module.exports = { start, stop };
