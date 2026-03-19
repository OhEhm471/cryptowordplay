// ============================================================
// API CLIENT — Typed calls to the Crypto Wordplay backend
// ============================================================

const BASE_URL = import.meta.env.VITE_API_URL || "/api";

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data   = data;
  }
}

async function request(path, options = {}, headers = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...headers,
      ...options.headers,
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(data.error || "Request failed", res.status, data);
  }

  return data;
}

// ============================================================
// Auth headers — pulled from localStorage (set by useWalletAuth)
// ============================================================
function getAuthHeaders() {
  const headers = {};
  const wallet  = localStorage.getItem("cwp_wallet");
  const sig     = localStorage.getItem("cwp_sig");
  const fid     = localStorage.getItem("cwp_fid");
  const session = localStorage.getItem("cwp_session_id");
  const username = localStorage.getItem("cwp_username");

  if (wallet && sig) {
    headers["x-wallet-address"]  = wallet;
    headers["x-wallet-signature"] = sig;
  }
  if (fid)     headers["x-farcaster-fid"] = fid;
  if (session) headers["x-session-id"]    = session;
  if (username) headers["x-username"]     = username;

  return headers;
}

// ============================================================
// Game API
// ============================================================
export const gameApi = {
  getDailyChallenge: (length) =>
    request(`/game/daily/${length}`),

  getSession: (length) =>
    request(`/game/session/${length}`),

  submitGuess: (guess, wordLength) =>
    request("/game/guess", {
      method: "POST",
      body:   JSON.stringify({ guess, wordLength }),
    }),

  trackShare: (wordLength) =>
    request("/game/share", {
      method: "POST",
      body:   JSON.stringify({ wordLength }),
    }),
};

// ============================================================
// Leaderboard API
// ============================================================
export const leaderboardApi = {
  getDaily:   (date)  => request(`/leaderboard/daily${date ? `?date=${date}` : ""}`),
  getAllTime:  ()      => request("/leaderboard/alltime"),
  getNearby:  ()      => request("/leaderboard/nearby"),
};

// ============================================================
// Player API
// ============================================================
export const playerApi = {
  getMe:           ()         => request("/player/me"),
  updateUsername:  (username) =>
    request("/player/username", {
      method: "PATCH",
      body:   JSON.stringify({ username }),
    }),
};

// ============================================================
// Health
// ============================================================
export const healthApi = {
  check: () => request("/health"),
};

export { ApiError };

// ============================================================
// Achievements API — Sprint 3
// ============================================================
export const achievementsApi = {
  getMine:     ()  => request("/achievements"),
  getGlobal:   ()  => request("/achievements/global"),
};

// ============================================================
// Badge Minting API — Sprint 4
// ============================================================
export const badgeApi = {
  getStatus:     ()                          => request("/badges/status"),
  requestVoucher:(achievementId)             => request("/badges/voucher", {
    method: "POST",
    body:   JSON.stringify({ achievementId }),
  }),
  confirmMint:   (achievementId, txHash)     => request("/badges/confirm", {
    method: "POST",
    body:   JSON.stringify({ achievementId, txHash }),
  }),
};
