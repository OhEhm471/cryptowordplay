// ============================================================
// Express app — configured but NOT listening.
// Import this in tests. server.js imports it and calls listen().
// ============================================================

require("dotenv").config();

const express       = require("express");
const cors          = require("cors");
const helmet        = require("helmet");
const routes        = require("./routes");
const farcasterCtrl = require("./controllers/farcasterController");
const { apiLimiter } = require("./middleware/rateLimiter");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");
const logger        = require("./utils/logger");

const app = express();

// ── Security headers ───────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc:    ["'self'"],
      frameAncestors: ["'self'", "https://warpcast.com", "https://*.farcaster.xyz"],
    },
  },
}));

// ── CORS ───────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",")
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (tests, curl, Postman)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods:      ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-wallet-address",
    "x-wallet-signature",
    "x-farcaster-fid",
    "x-session-id",
    "x-username",
  ],
}));

// ── Body parsing ───────────────────────────────────────────
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false }));

// ── Request logging ────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    if (process.env.NODE_ENV !== "test") { // silence noise during tests
      logger.info("HTTP request", {
        method:   req.method,
        path:     req.path,
        status:   res.statusCode,
        duration: `${Date.now() - start}ms`,
        ip:       req.ip,
      });
    }
  });
  next();
});

// ── Farcaster manifest ─────────────────────────────────────
app.get("/.well-known/farcaster.json", farcasterCtrl.getManifest);

// ── API routes ─────────────────────────────────────────────
app.use("/api", apiLimiter, routes);

// ── Error handling ─────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
