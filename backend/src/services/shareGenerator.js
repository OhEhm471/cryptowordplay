// ============================================================
// SHARE GENERATOR — Farcaster-ready emoji result sharing
// Never exposes the target word
// ============================================================

const EMOJI = {
  green:  "🟩",
  yellow: "🟨",
  gray:   "⬛",
};

/**
 * Generate shareable text result
 * @param {string[][]} evaluations — array of evaluation arrays
 * @param {boolean} won
 * @param {number} totalAttempts
 * @param {string} appUrl
 * @returns {string}
 */
function generateShareText({ evaluations, won, totalAttempts, maxAttempts = 4, appUrl = "https://cryptowordplay.xyz" }) {
  const rows = evaluations
    .map(row => row.map(s => EMOJI[s] || "⬛").join(""))
    .join("\n");

  const result = won
    ? `Solved in ${totalAttempts}/${maxAttempts} 🚀`
    : `Failed (${maxAttempts}/${maxAttempts}) 😔`;

  return `⚡ Crypto Wordplay\n${rows}\n${result}\n${appUrl}`;
}

/**
 * Generate Farcaster cast intent URL
 */
function generateFarcasterCastUrl({ evaluations, won, totalAttempts, maxAttempts = 4 }) {
  const text = generateShareText({ evaluations, won, totalAttempts, maxAttempts });
  return `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}`;
}

/**
 * Validate evaluations don't leak the answer
 * (sanity check before returning to client)
 */
function validateNoWordLeak(shareText, targetWord) {
  return !shareText.toUpperCase().includes(targetWord.toUpperCase());
}

module.exports = { generateShareText, generateFarcasterCastUrl, validateNoWordLeak };
