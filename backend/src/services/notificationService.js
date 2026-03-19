// ============================================================
// FARCASTER NOTIFICATION SERVICE
// Sends notifications via Farcaster's notification API
// Types: daily_reminder, streak_at_risk, achievement_unlocked
// ============================================================

const db     = require("../db/postgres");
const cache  = require("../db/redis");
const logger = require("../utils/logger");

const FARCASTER_NOTIF_API = "https://api.farcaster.xyz/v1/frame/notifications";

// ─── Notification Templates ──────────────────────────────────

const TEMPLATES = {
  daily_reminder: (streak) => ({
    title:  "⚡ Daily Crypto Word is Ready",
    body:   streak > 1
      ? `Your ${streak}-day streak is waiting! Guess today's word. 🔥`
      : "A new crypto word challenge awaits. Can you solve it in 4 tries?",
    url:    process.env.FARCASTER_APP_URL || "https://cryptowordplay.xyz",
  }),

  streak_at_risk: (streak) => ({
    title:  "🔥 Streak at Risk!",
    body:   `Your ${streak}-day streak ends at midnight. Play now to keep it alive!`,
    url:    process.env.FARCASTER_APP_URL || "https://cryptowordplay.xyz",
  }),

  achievement_unlocked: (achievement) => ({
    title:  `${achievement.emoji} Achievement Unlocked!`,
    body:   `You earned "${achievement.name}" — ${achievement.description}`,
    url:    process.env.FARCASTER_APP_URL || "https://cryptowordplay.xyz",
  }),

  leaderboard_rank: (rank) => ({
    title:  "🏆 You're on the Leaderboard!",
    body:   `You're ranked #${rank} today. Keep playing to climb higher!`,
    url:    `${process.env.FARCASTER_APP_URL || "https://cryptowordplay.xyz"}`,
  }),

  new_record: (score) => ({
    title:  "📈 New Personal Best!",
    body:   `You just scored ${score} points — your highest ever. WAGMI! 🚀`,
    url:    process.env.FARCASTER_APP_URL || "https://cryptowordplay.xyz",
  }),
};

// ─── Send Notification ───────────────────────────────────────

/**
 * Send a notification to a specific Farcaster FID.
 * Respects user notification preferences.
 * Deduplicates within a time window.
 */
async function sendNotification({ fid, type, data = {} }) {
  if (!fid) return { sent: false, reason: "no_fid" };

  // Check opt-out
  const optOut = await cache.get(`notif:optout:${fid}`);
  if (optOut) return { sent: false, reason: "opted_out" };

  // Deduplicate — don't send same type twice in 20h
  const dedupKey = `notif:dedup:${fid}:${type}`;
  const alreadySent = await cache.get(dedupKey);
  if (alreadySent) return { sent: false, reason: "already_sent" };

  const template = TEMPLATES[type];
  if (!template) return { sent: false, reason: "unknown_type" };

  const payload = template(data);

  // Get notification tokens for this FID from DB
  const { rows } = await db.query(
    `SELECT notification_token, notification_url
     FROM player_notification_tokens
     WHERE farcaster_fid = $1 AND is_active = true`,
    [String(fid)]
  );

  if (!rows.length) return { sent: false, reason: "no_token" };

  let successCount = 0;
  for (const row of rows) {
    try {
      const res = await fetch(row.notification_url || FARCASTER_NOTIF_API, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${row.notification_token}`,
        },
        body: JSON.stringify({
          notificationId: `${type}_${fid}_${Date.now()}`,
          title:          payload.title,
          body:           payload.body,
          targetUrl:      payload.url,
        }),
      });

      if (res.ok) {
        successCount++;
      } else if (res.status === 400) {
        // Token invalid — deactivate it
        await db.query(
          `UPDATE player_notification_tokens SET is_active = false
           WHERE farcaster_fid = $1 AND notification_token = $2`,
          [String(fid), row.notification_token]
        );
        logger.debug("Deactivated invalid notification token", { fid });
      }
    } catch (err) {
      logger.debug("Notification send error", { fid, type, error: err.message });
    }
  }

  if (successCount > 0) {
    // Mark as sent for deduplication (20 hours)
    await cache.set(dedupKey, true, 72000);
    logger.info("Notification sent", { fid, type });
    return { sent: true };
  }

  return { sent: false, reason: "delivery_failed" };
}

// ─── Batch Operations ────────────────────────────────────────

/**
 * Send daily reminders to all active players who haven't played today.
 * Called by cron job at ~9am UTC.
 */
async function sendDailyReminders() {
  const today = new Date().toISOString().split("T")[0];
  logger.info("Sending daily reminders", { date: today });

  const { rows } = await db.query(`
    SELECT p.farcaster_fid, ps.current_streak
    FROM players p
    JOIN player_stats ps ON ps.player_id = p.id
    JOIN player_notification_tokens pnt ON pnt.farcaster_fid = p.farcaster_fid
    WHERE p.farcaster_fid IS NOT NULL
      AND pnt.is_active = true
      AND ps.last_played != $1
      AND ps.last_played IS NOT NULL
    LIMIT 1000
  `, [today]);

  let sent = 0;
  for (const row of rows) {
    const result = await sendNotification({
      fid:  row.farcaster_fid,
      type: "daily_reminder",
      data: row.current_streak || 0,
    });
    if (result.sent) sent++;
    // Small delay to avoid API rate limits
    await new Promise(r => setTimeout(r, 50));
  }

  logger.info("Daily reminders complete", { sent, total: rows.length });
  return { sent, total: rows.length };
}

/**
 * Send streak-at-risk warnings (~3 hours before midnight UTC)
 */
async function sendStreakWarnings() {
  const today = new Date().toISOString().split("T")[0];

  const { rows } = await db.query(`
    SELECT p.farcaster_fid, ps.current_streak
    FROM players p
    JOIN player_stats ps ON ps.player_id = p.id
    JOIN player_notification_tokens pnt ON pnt.farcaster_fid = p.farcaster_fid
    WHERE p.farcaster_fid IS NOT NULL
      AND pnt.is_active = true
      AND ps.current_streak >= 3
      AND ps.last_played != $1
    LIMIT 500
  `, [today]);

  let sent = 0;
  for (const row of rows) {
    const result = await sendNotification({
      fid:  row.farcaster_fid,
      type: "streak_at_risk",
      data: row.current_streak,
    });
    if (result.sent) sent++;
    await new Promise(r => setTimeout(r, 50));
  }

  logger.info("Streak warnings sent", { sent, total: rows.length });
  return { sent, total: rows.length };
}

/**
 * Send achievement notification (called immediately on unlock)
 */
async function sendAchievementNotification(fid, achievement) {
  if (!fid) return;
  return sendNotification({ fid, type: "achievement_unlocked", data: achievement });
}

// ─── Token Management ────────────────────────────────────────

/**
 * Save notification token from Farcaster webhook event
 */
async function saveNotificationToken({ farcasterFid, token, url }) {
  await db.query(
    `INSERT INTO player_notification_tokens (farcaster_fid, notification_token, notification_url, is_active)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (farcaster_fid, notification_token) DO UPDATE
       SET is_active = true, notification_url = EXCLUDED.notification_url`,
    [String(farcasterFid), token, url || FARCASTER_NOTIF_API]
  );
}

/**
 * Remove token (user disabled notifications)
 */
async function removeNotificationToken({ farcasterFid, token }) {
  await db.query(
    `UPDATE player_notification_tokens SET is_active = false
     WHERE farcaster_fid = $1 AND notification_token = $2`,
    [String(farcasterFid), token]
  );
}

module.exports = {
  sendNotification,
  sendDailyReminders,
  sendStreakWarnings,
  sendAchievementNotification,
  saveNotificationToken,
  removeNotificationToken,
  TEMPLATES,
};
