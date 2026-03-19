const { verifyMessage } = require("viem");
const playerService = require("../services/playerService");
const logger = require("../utils/logger");

// ============================================================
// AUTH MIDDLEWARE
// Supports: wallet signature auth + Farcaster FID header
// Falls back to anonymous session if no auth provided
// ============================================================

/**
 * Optional auth — attaches player to req if present, continues either way.
 * Core gameplay never requires auth.
 */
async function optionalAuth(req, res, next) {
  try {
    const walletAddress = req.headers["x-wallet-address"];
    const farcasterFid  = req.headers["x-farcaster-fid"];
    const signature     = req.headers["x-wallet-signature"];
    const username      = req.headers["x-username"];

    if (walletAddress && signature) {
      // Verify signature (message = wallet address itself as a simple challenge)
      try {
        const message = `Crypto Wordplay Authentication\nAddress: ${walletAddress}`;
        const valid = await verifyMessage({
          address: walletAddress,
          message,
          signature,
        });
        if (valid) {
          req.player = await playerService.upsertByWallet(walletAddress, username);
          req.authMethod = "wallet";
          return next();
        }
      } catch (sigErr) {
        logger.debug("Wallet signature verification failed", { error: sigErr.message });
      }
    }

    if (farcasterFid) {
      // Farcaster FID — trust frame context (frame-level auth handled by Farcaster)
      req.player = await playerService.upsertByFarcaster(farcasterFid, username);
      req.authMethod = "farcaster";
      return next();
    }

    // No auth — anonymous player identified by session header
    const sessionId = req.headers["x-session-id"];
    if (sessionId) {
      req.anonymousSessionId = sessionId;
    }

    req.player = null;
    req.authMethod = "anonymous";
    next();
  } catch (err) {
    logger.error("Auth middleware error", { error: err.message });
    req.player = null;
    req.authMethod = "anonymous";
    next(); // never block gameplay
  }
}

/**
 * Require auth — returns 401 if not authenticated
 * Used only for leaderboard submissions and protected routes
 */
function requireAuth(req, res, next) {
  if (!req.player) {
    return res.status(401).json({
      error: "Authentication required",
      hint: "Connect wallet or use Farcaster to save scores",
    });
  }
  next();
}

module.exports = { optionalAuth, requireAuth };
