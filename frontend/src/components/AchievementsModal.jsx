import "../index.css";
import { useState, useEffect } from "react";
import { achievementsApi } from "../lib/api";
import BadgeClaimModal from "./BadgeClaimModal";

// ============================================================
// ACHIEVEMENTS MODAL — Sprint 3 Frontend
// ============================================================

const RARITY_COLORS = {
  legendary: { border: "#ffd60a", glow: "rgba(255,214,10,0.3)", label: "#ffd60a",   bg: "#2a2200" },
  epic:      { border: "#7b61ff", glow: "rgba(123,97,255,0.3)", label: "#a084ff",   bg: "#1a1530" },
  rare:      { border: "#00e5ff", glow: "rgba(0,229,255,0.25)", label: "#00e5ff",   bg: "#002a30" },
  uncommon:  { border: "#00e676", glow: "rgba(0,230,118,0.2)",  label: "#00e676",   bg: "#00210f" },
  common:    { border: "#444460", glow: "none",                  label: "#888",      bg: "#13131a" },
};

export default function AchievementsModal({ onClose, newAchievements = [] }) {
  const [achievements, setAchievements] = useState([]);
  const [isLoading,    setIsLoading]    = useState(true);
  const [filter,       setFilter]       = useState("all"); // all|unlocked|locked
  const [rarityFilter, setRarityFilter] = useState("all");
  const [showBadges,   setShowBadges]   = useState(false);

  useEffect(() => {
    loadAchievements();
  }, []);

  async function loadAchievements() {
    setIsLoading(true);
    try {
      const data = await achievementsApi.getMine();
      setAchievements(data.achievements || []);
    } catch {
      setAchievements([]);
    } finally {
      setIsLoading(false);
    }
  }

  const unlocked   = achievements.filter(a => a.unlocked);
  const totalCount = achievements.length;
  const pct        = totalCount ? Math.round((unlocked.length / totalCount) * 100) : 0;

  const filters    = ["all", "unlocked", "locked"];
  const rarities   = ["all", "legendary", "epic", "rare", "uncommon", "common"];

  const displayed = achievements.filter(a => {
    if (filter === "unlocked" && !a.unlocked) return false;
    if (filter === "locked"   && a.unlocked)  return false;
    if (rarityFilter !== "all" && a.rarity !== rarityFilter) return false;
    return true;
  });

  return (
    <>
      <div className="ov" onClick={onClose}>
        <div className="mdl" onClick={e => e.stopPropagation()}>
          <div className="mh">
            <span className="mt">🏅 Achievements</span>
            <div style={{display:"flex",gap:6}}>
              <button className="ibtn" style={{fontSize:10,padding:"4px 9px"}} onClick={() => setShowBadges(true)}>⛓ Badges</button>
              <button className="mc" onClick={onClose}>✕</button>
            </div>
          </div>
          <div className="mb">
            {/* New unlock banner */}
            {newAchievements.length > 0 && (
              <div className="ach-new-banner">
                🎉 NEW: {newAchievements.map(a => `${a.emoji} ${a.name}`).join(" · ")}
              </div>
            )}

            {/* Progress bar */}
            <div className="ach-progress">
              <span className="ach-prog-label" style={{ color: "var(--gr)" }}>
                {unlocked.length}/{totalCount}
              </span>
              <div className="ach-prog-bar">
                <div className="ach-prog-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="ach-prog-label">{pct}% complete</span>
            </div>

            {/* Status filter */}
            <div className="ach-filter">
              {filters.map(f => (
                <div key={f} className={`ach-ftag${filter === f ? " on" : ""}`} onClick={() => setFilter(f)}>
                  {f}
                </div>
              ))}
              <div style={{ width: 1, background: "var(--bd)", margin: "0 4px" }} />
              {rarities.map(r => (
                <div key={r} className={`ach-ftag${rarityFilter === r ? " on" : ""}`}
                  onClick={() => setRarityFilter(r)}
                  style={r !== "all" ? { borderColor: RARITY_COLORS[r]?.border, color: rarityFilter === r ? RARITY_COLORS[r]?.label : undefined } : {}}
                >
                  {r}
                </div>
              ))}
            </div>

            {/* Grid */}
            {isLoading ? (
              <div className="ach-loading">⚡ Loading achievements...</div>
            ) : displayed.length === 0 ? (
              <div className="ach-empty">No achievements found<br />Keep playing to unlock them!</div>
            ) : (
              <div className="ach-grid">
                {displayed.map(a => {
                  const rc = RARITY_COLORS[a.rarity] || RARITY_COLORS.common;
                  return (
                    <div
                      key={a.id}
                      className={`ach-card${a.unlocked ? "" : " locked"}`}
                      style={{
                        borderColor: a.unlocked ? rc.border : "#2a2a3a",
                        background:  a.unlocked ? rc.bg : "#0d0d12",
                        boxShadow:   a.unlocked ? `0 0 12px ${rc.glow}` : "none",
                      }}
                    >
                      {!a.unlocked && <span className="ach-lock">🔒</span>}
                      <span className="ach-emoji">{a.emoji}</span>
                      <div className="ach-name" style={{ color: a.unlocked ? rc.label : "#666" }}>
                        {a.name}
                      </div>
                      <div className="ach-rarity" style={{ color: rc.label }}>{a.rarity}</div>
                      <div className="ach-desc">{a.description}</div>
                      {a.unlocked && a.unlockedAt && (
                        <div className="ach-date">
                          {new Date(a.unlockedAt).toLocaleDateString("en", { month: "short", day: "numeric" })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      {showBadges && (
        <BadgeClaimModal
          onClose={() => setShowBadges(false)}
          achievements={achievements}
        />
      )}
    </>
  );
}
