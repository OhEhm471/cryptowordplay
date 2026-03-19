// ============================================================
// WORD ENGINE — Deterministic seed, evaluation, validation
// Word lists loaded from DB (word_lists table), cached in memory.
// Falls back to hardcoded lists if DB unavailable on first boot.
// ============================================================

const SUPPORTED_LENGTHS = [3, 4, 5, 6];

// ── Fallback hardcoded lists ──────────────────────────────────
const FALLBACK_LISTS = {
  3: [
    "BTC","ETH","SOL","XRP","ADA","DOT","BNB","NFT","DAO","DEX",
    "CEX","GAS","POW","POS","APY","TVL","MEV","AMM","ICO","ATH",
    "FUD","ROI","DCA","RUG","KEY","BOT","ATL","TPS","KYC","AML",
  ],
  4: [
    "HODL","DAPP","HASH","MINT","BURN","DEFI","PUMP","DUMP","GWEI",
    "NODE","PEER","POOL","SWAP","FORK","NEAR","REKT","SATS","FIAT",
    "COLD","SEED","BULL","BEAR","MOON","APES","CHAD","NGMI","NONCE",
    "WBTC","USDC","LINK","CAKE","AAVE","COMP","LIDO","PENL",
  ],
  5: [
    "CHAIN","LAYER","TOKEN","STAKE","YIELD","BLOCK","MINER","VAULT",
    "NONCE","SHARD","SMART","RALLY","WHALE","FLOOR","ALPHA","DEGEN",
    "HALVE","LASER","PROOF","SONIC","PRICE","NODES","HEDGE","DELTA",
    "GAMMA","THETA","SIGMA","MULTI","CROSS","BATCH","PROXY","RELAY",
    "EPOCH","SLOSH","CHAOS","FRENS","BASED","GRIND","ALTCO","BEARS",
  ],
  6: [
    "WALLET","BRIDGE","ORACLE","ESCROW","LEDGER","HODLER","MINING",
    "TOKENS","MINTED","BURNED","LOCKED","STAKED","POOLED","FORKED",
    "HASHED","YIELDS","LAYERS","CHAINS","BLOCKS","VAULTS","SHARDS",
    "SMARTS","RALLYS","WHALES","FLOORS","ALPHAS","DEGENS","HALVES",
    "PROOFS","EPOCHS","HEDGES","DELTAS","MULTIS","RELAYS","BATCHS",
  ],
};

// ── In-memory cache ───────────────────────────────────────────
let WORD_LISTS  = JSON.parse(JSON.stringify(FALLBACK_LISTS));
let VALID_WORDS = buildValidWords(FALLBACK_LISTS);

function buildValidWords(lists) {
  const sets = {};
  for (const [len, words] of Object.entries(lists)) {
    sets[len] = new Set(words);
  }
  return sets;
}

// ── DB loader (called at startup + after mutations) ───────────
async function reloadWords() {
  try {
    const db = require("../db/postgres");
    const { rows } = await db.query(
      "SELECT word, length FROM word_lists WHERE active = TRUE ORDER BY length, word"
    );
    if (rows.length === 0) return { loaded: 0, source: "fallback" };

    const fresh = { 3: [], 4: [], 5: [], 6: [] };
    for (const row of rows) {
      if (fresh[row.length]) fresh[row.length].push(row.word);
    }
    for (const len of SUPPORTED_LENGTHS) {
      if (fresh[len].length > 0) WORD_LISTS[len] = fresh[len];
    }
    VALID_WORDS = buildValidWords(WORD_LISTS);
    return { loaded: rows.length, source: "database" };
  } catch (err) {
    return { loaded: 0, source: "fallback", error: err.message };
  }
}

// ── Deterministic daily word ──────────────────────────────────
function getDailyWord(length, dateString, salt) {
  if (!SUPPORTED_LENGTHS.includes(Number(length))) {
    throw new Error(`Unsupported word length: ${length}`);
  }
  const seed = `${dateString}:${salt}:${length}`;
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash) ^ seed.charCodeAt(i);
    hash = hash >>> 0;
  }
  const list = WORD_LISTS[length];
  return list[hash % list.length];
}

function getTodayString() {
  return new Date().toISOString().split("T")[0];
}

// ── Guess evaluation ──────────────────────────────────────────
function evaluateGuess(guess, target) {
  if (guess.length !== target.length) {
    throw new Error(`Guess length ${guess.length} !== target length ${target.length}`);
  }
  const result     = new Array(guess.length).fill("gray");
  const targetUsed = new Array(target.length).fill(false);
  const guessUsed  = new Array(guess.length).fill(false);

  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === target[i]) {
      result[i] = "green"; targetUsed[i] = guessUsed[i] = true;
    }
  }
  for (let i = 0; i < guess.length; i++) {
    if (guessUsed[i]) continue;
    for (let j = 0; j < target.length; j++) {
      if (!targetUsed[j] && guess[i] === target[j]) {
        result[i] = "yellow"; targetUsed[j] = true; break;
      }
    }
  }
  return result;
}

// ── Validation ────────────────────────────────────────────────
function isValidGuess(word, length) {
  if (!word || typeof word !== "string") return false;
  const normalized = word.toUpperCase().trim();
  if (normalized.length !== Number(length)) return false;
  if (!/^[A-Z]+$/.test(normalized)) return false;
  return VALID_WORDS[length]?.has(normalized) ?? false;
}

function normalizeWord(word) {
  return word.toUpperCase().trim();
}

function validateCandidate(word, length) {
  const errors = [];
  const w = normalizeWord(word || "");
  if (!w)                                    errors.push("Word is empty");
  if (w && w.length !== Number(length))      errors.push(`Must be exactly ${length} letters (got ${w.length})`);
  if (w && !/^[A-Z]+$/.test(w))             errors.push("Letters only — no numbers or symbols");
  if (w && VALID_WORDS[length]?.has(w))      errors.push(`"${w}" already in the ${length}-letter list`);
  return { valid: errors.length === 0, word: w, errors };
}

module.exports = {
  get WORD_LISTS()  { return WORD_LISTS;  },
  get VALID_WORDS() { return VALID_WORDS; },
  SUPPORTED_LENGTHS,
  reloadWords,
  getDailyWord,
  getTodayString,
  evaluateGuess,
  isValidGuess,
  normalizeWord,
  validateCandidate,
};
