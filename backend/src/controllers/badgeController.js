const badgeMintService = require("../services/badgeMintService");
const achievementSvc   = require("../services/achievementService");
const analytics        = require("../services/analyticsService");
const logger           = require("../utils/logger");

// ============================================================
// BADGE CONTROLLER
// Routes:
//   GET  /api/badges/status         — all badge statuses for player
//   POST /api/badges/voucher        — request a signed mint voucher
//   POST /api/badges/confirm        — confirm a tx was mined (frontend callback)
//   GET  /api/badges/metadata/:id   — ERC-1155 token metadata (public)
//   GET  /api/badges/contract       — contract-level metadata (OpenSea)
// ============================================================

/**
 * GET /api/badges/status
 * Returns minted + claimable badges for the authenticated player
 */
async function getBadgeStatus(req, res, next) {
  try {
    const wallet = req.walletAddress || req.headers["x-wallet-address"];
    if (!wallet) {
      return res.json({
        minted:    [],
        claimable: [],
        enabled:   badgeMintService.isEnabled(),
        message:   "Connect wallet to view badge status",
      });
    }

    // Get player's unlocked achievements
    let unlockedIds = [];
    if (req.player) {
      const achievements = await achievementSvc.getPlayerAchievements(req.player.id);
      unlockedIds = achievements.filter(a => a.unlocked).map(a => a.id);
    }

    const status = await badgeMintService.getBadgeStatus(wallet, unlockedIds);
    res.json(status);
  } catch (err) { next(err); }
}

/**
 * POST /api/badges/voucher
 * Body: { achievementId }
 * Returns a signed voucher the frontend can use to call claimBadge() on the contract
 */
async function requestVoucher(req, res, next) {
  try {
    const { achievementId } = req.body;
    const wallet = req.walletAddress || req.headers["x-wallet-address"];

    if (!wallet) {
      return res.status(401).json({ error: "Wallet authentication required to mint badges" });
    }
    if (!achievementId) {
      return res.status(400).json({ error: "achievementId is required" });
    }

    // Verify player actually earned this achievement — player auth is required
    if (!req.player) {
      return res.status(401).json({ error: "Player authentication required to mint badges — connect via Farcaster or wallet signature" });
    }
    const achievements = await achievementSvc.getPlayerAchievements(req.player.id);
    const achievement  = achievements.find(a => a.id === achievementId);
    if (!achievement?.unlocked) {
      return res.status(403).json({ error: "Achievement not yet earned" });
    }

    const voucher = await badgeMintService.signMintVoucher({
      walletAddress: wallet,
      achievementId,
    });

    if (voucher.error) {
      const status = voucher.alreadyMinted ? 409 : 400;
      return res.status(status).json({ error: voucher.error });
    }

    analytics.track("badge_voucher_requested", req.player?.id, { achievementId });

    res.json({
      ok: true,
      voucher,
    });
  } catch (err) { next(err); }
}

/**
 * POST /api/badges/confirm
 * Body: { achievementId, txHash }
 * Frontend calls this after the mint tx is confirmed onchain
 */
async function confirmMint(req, res, next) {
  try {
    const { achievementId, txHash } = req.body;
    const wallet = req.walletAddress || req.headers["x-wallet-address"];

    if (!wallet || !achievementId || !txHash) {
      return res.status(400).json({ error: "wallet, achievementId, and txHash required" });
    }

    await badgeMintService.recordMint({
      walletAddress: wallet,
      achievementId,
      txHash,
    });

    analytics.track("badge_minted", req.player?.id, { achievementId, txHash });
    logger.info("Badge mint confirmed", { wallet, achievementId, txHash });

    res.json({ ok: true, message: "Badge mint recorded" });
  } catch (err) { next(err); }
}

/**
 * GET /api/badges/metadata/:tokenId
 * Public endpoint — called by the contract's URI (OpenSea, wallets, etc.)
 */
function getTokenMetadata(req, res) {
  const tokenId = parseInt(req.params.tokenId);
  if (isNaN(tokenId)) {
    return res.status(400).json({ error: "Invalid tokenId" });
  }
  const metadata = badgeMintService.getTokenMetadata(tokenId);
  if (!metadata) {
    return res.status(404).json({ error: "Token not found" });
  }
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json(metadata);
}

/**
 * GET /api/badges/contract
 * Contract-level metadata for OpenSea collection display
 */
function getContractMetadata(req, res) {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({
    name:           "Crypto Wordplay Badges",
    description:    "Soulbound achievement badges for Crypto Wordplay — the daily crypto word puzzle on Farcaster. Each badge represents a milestone earned through gameplay.",
    image:          `${process.env.FARCASTER_APP_URL || "https://cryptowordplay.xyz"}/icon.png`,
    external_link:  process.env.FARCASTER_APP_URL || "https://cryptowordplay.xyz",
    seller_fee_basis_points: 0,
    fee_recipient:  "0x0000000000000000000000000000000000000000",
  });
}

module.exports = {
  getBadgeStatus,
  requestVoucher,
  confirmMint,
  getTokenMetadata,
  getContractMetadata,
};
