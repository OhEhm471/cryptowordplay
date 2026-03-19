const achievementService = require("../services/achievementService");
const { ACHIEVEMENTS, RARITY_ORDER } = require("../services/achievementDefinitions");
const analytics = require("../services/analyticsService");

async function getMyAchievements(req, res, next) {
  try {
    if (!req.player) {
      // Return all achievements as locked for anonymous users
      return res.json({
        achievements: ACHIEVEMENTS.map(a => ({ ...a, unlocked: false, unlockedAt: null })),
        unlockedCount: 0,
        totalCount: ACHIEVEMENTS.length,
      });
    }

    const all = await achievementService.getPlayerAchievements(req.player.id);
    // Sort: unlocked first (by date desc), then by rarity
    all.sort((a, b) => {
      if (a.unlocked && !b.unlocked) return -1;
      if (!a.unlocked && b.unlocked) return 1;
      if (a.unlocked && b.unlocked) return new Date(b.unlockedAt) - new Date(a.unlockedAt);
      return (RARITY_ORDER[b.rarity] || 0) - (RARITY_ORDER[a.rarity] || 0);
    });

    const unlockedCount = all.filter(a => a.unlocked).length;

    analytics.track("achievements_viewed", req.player?.id, {});

    res.json({
      achievements: all,
      unlockedCount,
      totalCount: ACHIEVEMENTS.length,
    });
  } catch (err) { next(err); }
}

async function getGlobalStats(req, res, next) {
  try {
    const stats = await achievementService.getGlobalStats();
    res.json({ stats });
  } catch (err) { next(err); }
}

module.exports = { getMyAchievements, getGlobalStats };
