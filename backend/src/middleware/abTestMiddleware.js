const abTest = require("../services/abTestService");
const logger = require("../utils/logger");

// ============================================================
// AB TEST MIDDLEWARE
//
// Runs after optionalAuth so req.player is already set.
// Attaches req.abVariants = Map<slug, variantId>
// Attaches req.abIdentity = { key, type } for goal tracking
//
// Usage in controllers:
//   const variant = req.abVariants?.get('max_attempts');
//   if (variant === 'treatment') maxAttempts = 5;
// ============================================================

async function abTestMiddleware(req, res, next) {
  try {
    let identityKey, identityType;

    if (req.player?.id) {
      identityKey  = req.player.id;
      identityType = "player";
    } else {
      // Anonymous — use session ID from header (UUID expected)
      const sessionId = req.headers["x-session-id"];
      if (!sessionId) {
        req.abVariants = new Map();
        return next();
      }
      identityKey  = sessionId;
      identityType = "anonymous";
    }

    req.abIdentity = { key: identityKey, type: identityType };
    req.abVariants = await abTest.assignAll(identityKey, identityType);
  } catch (err) {
    // Never block gameplay
    logger.debug("AB middleware error (non-critical)", { error: err.message });
    req.abVariants = new Map();
  }
  next();
}

module.exports = { abTestMiddleware };
