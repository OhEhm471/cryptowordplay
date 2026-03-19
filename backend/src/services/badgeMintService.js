const { createWalletClient, http, parseAbi, keccak256, encodePacked, toHex, toBytes } = require("viem");
const { privateKeyToAccount } = require("viem/accounts");
const { base, baseSepolia }   = require("viem/chains");
const { randomBytes }         = require("crypto");
const db     = require("../db/postgres");
const cache  = require("../db/redis");
const logger = require("../utils/logger");

// ============================================================
// BADGE MINTING SERVICE
// Responsibilities:
//   1. Sign mint vouchers (ECDSA)
//   2. Track pending / claimed / failed mints in DB
//   3. Read badge state from the contract (via RPC)
//   4. Serve token metadata for the contract's baseURI
// ============================================================

// ── Config ───────────────────────────────────────────────────

function getSignerAccount() {
  const pk = process.env.BADGE_SIGNER_PRIVATE_KEY;
  if (!pk) {
    logger.warn("BADGE_SIGNER_PRIVATE_KEY not set — badge minting disabled");
    return null;
  }
  return privateKeyToAccount(pk);
}

function getChain() {
  return process.env.BADGE_CHAIN_ID === "8453" ? base : baseSepolia;
}

function getContractAddress() {
  return process.env.BADGE_CONTRACT_ADDRESS || null;
}

function isEnabled() {
  return !!(getSignerAccount() && getContractAddress());
}

// ── Achievement → Token ID mapping ──────────────────────────
// Must match achievementDefinitions.js order exactly
const ACHIEVEMENT_TOKEN_IDS = {
  "first_blood":   0,
  "ten_wins":      1,
  "fifty_wins":    2,
  "hundred_wins":  3,
  "one_shot":      4,
  "two_shot":      5,
  "last_chance":   6,
  "one_shot_5":    7,
  "streak_3":      8,
  "streak_7":      9,
  "streak_30":     10,
  "streak_100":    11,
  "score_1k":      12,
  "score_1500":    13,
  "total_10k":     14,
  "3letter_win":   15,
  "6letter_win":   16,
  "all_lengths":   17,
  "first_share":   18,
  "share_10":      19,
  "played_7":      20,
  "played_100":    21,
  // 22, 23 reserved for future achievements
};

// Reverse map: tokenId → achievementId
const TOKEN_ID_ACHIEVEMENTS = Object.fromEntries(
  Object.entries(ACHIEVEMENT_TOKEN_IDS).map(([k, v]) => [v, k])
);

// ── Signing ──────────────────────────────────────────────────

/**
 * Sign a mint voucher for a player+achievement.
 * Returns: { tokenId, nonce, signature, achievementId }
 *
 * The contract verifies:
 *   keccak256(abi.encodePacked(playerAddress, tokenId, nonce))
 */
async function signMintVoucher({ walletAddress, achievementId }) {
  if (!isEnabled()) {
    return { error: "Badge minting not configured" };
  }

  const tokenId = ACHIEVEMENT_TOKEN_IDS[achievementId];
  if (tokenId === undefined) {
    return { error: `Unknown achievementId: ${achievementId}` };
  }

  // Check if already minted onchain (DB cache)
  const alreadyMinted = await isMintedInDb(walletAddress, achievementId);
  if (alreadyMinted) {
    return { error: "Badge already minted", alreadyMinted: true };
  }

  // Generate unique nonce
  const nonceBytes = randomBytes(32);
  const nonce      = toHex(nonceBytes); // bytes32 hex string

  // Build message hash: keccak256(address ++ uint256 ++ bytes32)
  const messageHash = keccak256(
    encodePacked(
      ["address", "uint256", "bytes32"],
      [walletAddress, BigInt(tokenId), nonce]
    )
  );

  // Sign with Ethereum prefix (matches ECDSA.toEthSignedMessageHash in Solidity)
  const account   = getSignerAccount();
  const signature = await account.signMessage({ message: { raw: toBytes(messageHash) } });

  // Store pending voucher in DB (TTL: 1 hour to claim)
  await db.query(
    `INSERT INTO badge_vouchers (wallet_address, achievement_id, token_id, nonce, signature, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '1 hour')
     ON CONFLICT (wallet_address, achievement_id) DO UPDATE
       SET nonce = EXCLUDED.nonce,
           signature = EXCLUDED.signature,
           expires_at = EXCLUDED.expires_at,
           used = false`,
    [walletAddress.toLowerCase(), achievementId, tokenId, nonce, signature]
  );

  logger.info("Mint voucher signed", { walletAddress, achievementId, tokenId });

  return {
    contractAddress: getContractAddress(),
    chainId:         getChain().id,
    tokenId,
    nonce,
    achievementId,
    signature,
    expiresIn:       3600, // seconds
  };
}

/**
 * Record that a badge was successfully minted onchain.
 * Called by webhook or frontend confirmation.
 */
async function recordMint({ walletAddress, achievementId, txHash }) {
  await db.query(
    `INSERT INTO badge_mints (wallet_address, achievement_id, token_id, tx_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (wallet_address, achievement_id) DO UPDATE
       SET tx_hash = EXCLUDED.tx_hash, minted_at = NOW()`,
    [
      walletAddress.toLowerCase(),
      achievementId,
      ACHIEVEMENT_TOKEN_IDS[achievementId] ?? -1,
      txHash,
    ]
  );

  // Mark voucher as used
  await db.query(
    `UPDATE badge_vouchers SET used = true
     WHERE wallet_address = $1 AND achievement_id = $2`,
    [walletAddress.toLowerCase(), achievementId]
  );

  // Bust cache
  await cache.del(`badge_status:${walletAddress.toLowerCase()}`);

  logger.info("Badge mint recorded", { walletAddress, achievementId, txHash });
}

/**
 * Get all badge mint statuses for a wallet.
 * Returns both DB-recorded mints and claimable (unlocked but not yet minted).
 */
async function getBadgeStatus(walletAddress, unlockedAchievementIds = []) {
  const cacheKey = `badge_status:${walletAddress.toLowerCase()}`;
  const cached   = await cache.get(cacheKey);
  if (cached) return cached;

  const { rows: mints } = await db.query(
    `SELECT achievement_id, token_id, tx_hash, minted_at
     FROM badge_mints
     WHERE wallet_address = $1`,
    [walletAddress.toLowerCase()]
  );

  const mintedSet = new Set(mints.map(m => m.achievement_id));

  const result = {
    minted: mints.map(m => ({
      achievementId: m.achievement_id,
      tokenId:       m.token_id,
      txHash:        m.tx_hash,
      mintedAt:      m.minted_at,
    })),
    claimable: unlockedAchievementIds
      .filter(id => !mintedSet.has(id) && ACHIEVEMENT_TOKEN_IDS[id] !== undefined)
      .map(id => ({
        achievementId: id,
        tokenId:       ACHIEVEMENT_TOKEN_IDS[id],
      })),
    contractAddress: getContractAddress(),
    chainId:         getChain().id,
    enabled:         isEnabled(),
  };

  await cache.set(cacheKey, result, 60);
  return result;
}

// ── Token Metadata ───────────────────────────────────────────

/**
 * ERC-1155 metadata for a given token ID.
 * Served at /api/badges/metadata/:tokenId
 * Format: OpenSea-compatible ERC-1155 metadata standard
 */
function getTokenMetadata(tokenId) {
  const achievementId = TOKEN_ID_ACHIEVEMENTS[tokenId];
  if (!achievementId) return null;

  // Import achievement definitions for display info
  const { ACHIEVEMENT_MAP } = require("./achievementDefinitions");
  const achievement = ACHIEVEMENT_MAP[achievementId];
  if (!achievement) return null;

  const RARITY_COLORS = {
    legendary: "#ffd60a",
    epic:      "#7b61ff",
    rare:      "#00e5ff",
    uncommon:  "#00e676",
    common:    "#888888",
  };

  return {
    name:        `${achievement.emoji} ${achievement.name}`,
    description: `${achievement.description}\n\nEarned playing Crypto Wordplay — the daily crypto word puzzle on Farcaster.`,
    image:       `${process.env.FARCASTER_APP_URL || "https://cryptowordplay.xyz"}/api/badges/image/${tokenId}`,
    external_url: process.env.FARCASTER_APP_URL || "https://cryptowordplay.xyz",
    attributes: [
      { trait_type: "Achievement",  value: achievement.name },
      { trait_type: "Rarity",       value: achievement.rarity.charAt(0).toUpperCase() + achievement.rarity.slice(1) },
      { trait_type: "Token ID",     value: tokenId, display_type: "number" },
      { trait_type: "Soulbound",    value: "Yes" },
      { trait_type: "Game",         value: "Crypto Wordplay" },
    ],
    background_color: "060608",
    animation_url: null,
  };
}

// ── Helpers ──────────────────────────────────────────────────

async function isMintedInDb(walletAddress, achievementId) {
  const { rows } = await db.query(
    `SELECT 1 FROM badge_mints WHERE wallet_address = $1 AND achievement_id = $2`,
    [walletAddress.toLowerCase(), achievementId]
  );
  return rows.length > 0;
}

module.exports = {
  isEnabled,
  signMintVoucher,
  recordMint,
  getBadgeStatus,
  getTokenMetadata,
  ACHIEVEMENT_TOKEN_IDS,
  TOKEN_ID_ACHIEVEMENTS,
};
