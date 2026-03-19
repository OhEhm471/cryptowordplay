const rateLimit      = require("express-rate-limit");
const { E, apiError } = require("../utils/errors");
const logger = require("../utils/logger");

const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000");

// General API limiter
const apiLimiter = rateLimit({
  windowMs,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "60"),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
  handler: (req, res, next, options) => {
    logger.warn("Rate limit hit", { ip: req.ip, path: req.path });
    res.status(429).json(options.message);
  },
});

// Tighter limiter for guess submission (anti-cheat)
const guessLimiter = rateLimit({
  windowMs,
  max: parseInt(process.env.RATE_LIMIT_GUESS_MAX || "20"),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers["x-wallet-address"] || req.headers["x-session-id"] || req.ip,
  message: { error: "Too many guess attempts. Possible abuse detected." },
});

// Auth endpoint limiter
const authLimiter = rateLimit({
  windowMs: 300000, // 5 minutes
  max: 10,
  message: { error: "Too many auth requests." },
});

module.exports = { apiLimiter, guessLimiter, authLimiter };
