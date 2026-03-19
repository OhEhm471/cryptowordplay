// ============================================================
// ACHIEVEMENT DEFINITIONS
// Each achievement has: id, name, emoji, description, criteria fn
// Criteria receives playerStats + sessionData → returns bool
// ============================================================

const ACHIEVEMENTS = [
  // ── Win-based ──────────────────────────────────────────────
  {
    id:          "first_blood",
    name:        "First Blood",
    emoji:       "🩸",
    description: "Win your first game",
    rarity:      "common",
    check:       (stats) => stats.total_wins >= 1,
  },
  {
    id:          "ten_wins",
    name:        "Diamond Hands",
    emoji:       "💎",
    description: "Win 10 games",
    rarity:      "common",
    check:       (stats) => stats.total_wins >= 10,
  },
  {
    id:          "fifty_wins",
    name:        "Crypto Veteran",
    emoji:       "🏛️",
    description: "Win 50 games",
    rarity:      "rare",
    check:       (stats) => stats.total_wins >= 50,
  },
  {
    id:          "hundred_wins",
    name:        "On-Chain Legend",
    emoji:       "⛓️",
    description: "Win 100 games",
    rarity:      "epic",
    check:       (stats) => stats.total_wins >= 100,
  },

  // ── Speed / attempts ───────────────────────────────────────
  {
    id:          "one_shot",
    name:        "One Shot",
    emoji:       "🎯",
    description: "Solve a word in 1 attempt",
    rarity:      "rare",
    check:       (stats, session) => session?.attempts_used === 1 && session?.state === "win",
  },
  {
    id:          "two_shot",
    name:        "Sharp Alpha",
    emoji:       "⚡",
    description: "Solve a word in 2 attempts",
    rarity:      "common",
    check:       (stats, session) => session?.attempts_used === 2 && session?.state === "win",
  },
  {
    id:          "last_chance",
    name:        "Last Block",
    emoji:       "🧱",
    description: "Win on your final (4th) attempt",
    rarity:      "uncommon",
    check:       (stats, session) => session?.attempts_used === 4 && session?.state === "win",
  },
  {
    id:          "one_shot_5",
    name:        "Galaxy Brain",
    emoji:       "🧠",
    description: "Solve a 5-letter word in 1 attempt",
    rarity:      "epic",
    check:       (stats, session) => session?.attempts_used === 1 && session?.state === "win" && session?.word_length === 5,
  },

  // ── Streak-based ───────────────────────────────────────────
  {
    id:          "streak_3",
    name:        "Consistent",
    emoji:       "🔥",
    description: "3-day winning streak",
    rarity:      "common",
    check:       (stats) => stats.current_streak >= 3,
  },
  {
    id:          "streak_7",
    name:        "Weekly Degen",
    emoji:       "📅",
    description: "7-day winning streak",
    rarity:      "uncommon",
    check:       (stats) => stats.current_streak >= 7,
  },
  {
    id:          "streak_30",
    name:        "Diamond Streak",
    emoji:       "💠",
    description: "30-day winning streak",
    rarity:      "epic",
    check:       (stats) => stats.current_streak >= 30,
  },
  {
    id:          "streak_100",
    name:        "Satoshi Mode",
    emoji:       "₿",
    description: "100-day winning streak",
    rarity:      "legendary",
    check:       (stats) => stats.current_streak >= 100,
  },

  // ── Score-based ────────────────────────────────────────────
  {
    id:          "score_1k",
    name:        "Bull Market",
    emoji:       "🐂",
    description: "Score 1,000+ points in a single game",
    rarity:      "uncommon",
    check:       (stats, session) => (session?.score || 0) >= 1000,
  },
  {
    id:          "score_1500",
    name:        "All-Time High",
    emoji:       "📈",
    description: "Score 1,500 points in a single game (1st try + 7-day streak)",
    rarity:      "legendary",
    check:       (stats, session) => (session?.score || 0) >= 1500,
  },
  {
    id:          "total_10k",
    name:        "Ten K Club",
    emoji:       "🏆",
    description: "Accumulate 10,000 total points",
    rarity:      "rare",
    check:       (stats) => stats.total_score >= 10000,
  },

  // ── Word-length based ──────────────────────────────────────
  {
    id:          "3letter_win",
    name:        "Ticker Brain",
    emoji:       "📊",
    description: "Win a 3-letter challenge",
    rarity:      "common",
    check:       (stats, session) => session?.state === "win" && session?.word_length === 3,
  },
  {
    id:          "6letter_win",
    name:        "Deep Dive",
    emoji:       "🔬",
    description: "Win a 6-letter challenge",
    rarity:      "uncommon",
    check:       (stats, session) => session?.state === "win" && session?.word_length === 6,
  },
  {
    id:          "all_lengths",
    name:        "Full Stack",
    emoji:       "📚",
    description: "Win at all 4 word lengths (3, 4, 5, 6) in a single day",
    rarity:      "epic",
    check:       (stats, session, ctx) => ctx?.winsToday?.length >= 4 && new Set(ctx.winsToday).size === 4,
  },

  // ── Social ─────────────────────────────────────────────────
  {
    id:          "first_share",
    name:        "Cast It",
    emoji:       "🟣",
    description: "Share a result to Farcaster",
    rarity:      "common",
    check:       (stats, session, ctx) => ctx?.shared === true,
  },
  {
    id:          "share_10",
    name:        "Influencer",
    emoji:       "📢",
    description: "Share 10 results",
    rarity:      "uncommon",
    check:       (stats) => (stats.share_count || 0) >= 10,
  },

  // ── Participation ──────────────────────────────────────────
  {
    id:          "played_7",
    name:        "Week One",
    emoji:       "📆",
    description: "Play 7 games total",
    rarity:      "common",
    check:       (stats) => stats.total_played >= 7,
  },
  {
    id:          "played_100",
    name:        "Degenerate",
    emoji:       "🎲",
    description: "Play 100 games",
    rarity:      "rare",
    check:       (stats) => stats.total_played >= 100,
  },
];

// Build lookup map
const ACHIEVEMENT_MAP = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));

const RARITY_ORDER = { legendary: 4, epic: 3, rare: 2, uncommon: 1, common: 0 };

module.exports = { ACHIEVEMENTS, ACHIEVEMENT_MAP, RARITY_ORDER };
