// ============================================================
// Server entry point — imports app, starts listening.
// The Express app lives in app.js so tests can import it
// without starting the HTTP server or the scheduler.
// ============================================================

require("dotenv").config();

const app       = require("./app");
const logger    = require("./utils/logger");
const scheduler = require("./utils/scheduler");

const PORT = process.env.PORT || 3001;

app.listen(PORT, '0.0.0.0', async () => {
  scheduler.start();
  const wordEngine = require("./services/wordEngine");
  const wl = await wordEngine.reloadWords();
  logger.info("📝 Word lists loaded", wl);
  logger.info("🚀 Crypto Wordplay API running", {
    port:    PORT,
    env:     process.env.NODE_ENV || "development",
    version: process.env.APP_VERSION || "1.0.0",
  });
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

module.exports = app;
