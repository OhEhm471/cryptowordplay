// ============================================================
// Admin API Client
// ============================================================

const BASE = (import.meta.env.VITE_API_URL || "/api") + "/admin";

function getToken() {
  return localStorage.getItem("cwp_admin_token") || "";
}

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${getToken()}`,
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    localStorage.removeItem("cwp_admin_token");
    window.location.reload();
    throw new Error("Session expired");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const adminApi = {
  // Auth
  login: (secret) =>
    fetch((import.meta.env.VITE_API_URL || "/api") + "/admin/login", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ secret }),
    }).then(r => r.json()),

  // Dashboard
  getDashboard: () => req("/dashboard"),

  // Words
  getWordList:    (length) => req(`/words${length ? `?length=${length}` : ""}`),
  previewWord:    (date, length) => req(`/words/daily?date=${date}&length=${length}`),
  getSchedule:    (length, days) => req(`/words/schedule?length=${length}&days=${days}`),

  // Players
  getPlayers: (search = "", offset = 0) =>
    req(`/players?limit=50&offset=${offset}${search ? `&search=${encodeURIComponent(search)}` : ""}`),

  // Notifications
  triggerDaily:  () => req("/notify/daily",  { method: "POST" }),
  triggerStreak: () => req("/notify/streak", { method: "POST" }),

  // Cache
  flushLeaderboard: () => req("/cache/flush-leaderboard", { method: "POST" }),

  // OG Preview — returns image URL (use in <img> tag)
  ogPreviewUrl: (type, wordLength) =>
    `${BASE}/og/preview?type=${type}&wordLength=${wordLength}&token=${getToken()}`,
};
