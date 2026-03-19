import { useState } from "react";
import { adminApi } from "../lib/api";

function ActionCard({ title, description, buttonLabel, onAction, danger = false, children }) {
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState(null);

  async function handle() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await onAction();
      setResult(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="adm-card">
      <div className="adm-card-title">{title}</div>
      <div style={{ fontSize: 11, color: "var(--gt)", marginBottom: 12, lineHeight: 1.6 }}>{description}</div>
      {children}
      <button
        className={`adm-btn${danger ? " danger" : ""}`}
        onClick={handle}
        disabled={loading}
        style={{ marginTop: children ? 10 : 0 }}
      >
        {loading ? "⏳ Working..." : buttonLabel}
      </button>
      {result && (
        <div className="adm-result-ok">
          ✅ {typeof result === "object" ? JSON.stringify(result) : result}
        </div>
      )}
      {error && <div className="adm-result-err">❌ {error}</div>}
    </div>
  );
}

export default function ToolsScreen() {
  const [ogType,   setOgType]   = useState("daily");
  const [ogLength, setOgLength] = useState(5);
  const [ogUrl,    setOgUrl]    = useState(null);

  function previewOg() {
    setOgUrl(adminApi.ogPreviewUrl(ogType, ogLength) + "&t=" + Date.now());
  }

  return (
    <div>
      <div className="adm-screen-hdr">
        <div>
          <div className="adm-screen-title">Tools</div>
          <div className="adm-screen-sub">Notifications · Cache · OG Images</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>

        {/* Daily reminders */}
        <ActionCard
          title="📬 Daily Reminders"
          description="Sends a push notification to all Farcaster users who haven't played today. The scheduler runs this automatically at 09:00 UTC — use this to trigger manually."
          buttonLabel="Send Daily Reminders"
          onAction={adminApi.triggerDaily}
        />

        {/* Streak warnings */}
        <ActionCard
          title="🔥 Streak Warnings"
          description="Sends a push notification to users with a streak ≥ 3 days who haven't played today. Scheduler runs at 21:00 UTC. Trigger early if needed."
          buttonLabel="Send Streak Warnings"
          onAction={adminApi.triggerStreak}
        />

        {/* Cache flush */}
        <ActionCard
          title="🗑️ Flush Leaderboard Cache"
          description="Clears the Redis cache for today's daily leaderboard and the all-time leaderboard. Use this if scores appear stale or after a data correction."
          buttonLabel="Flush Cache"
          danger
          onAction={() => adminApi.flushLeaderboard().then(r => r.message)}
        />

        {/* OG image preview */}
        <div className="adm-card">
          <div className="adm-card-title">🖼️ OG Image Preview</div>
          <div style={{ fontSize: 11, color: "var(--gt)", marginBottom: 12, lineHeight: 1.6 }}>
            Preview the dynamically generated OG images served by the backend. These appear when sharing on social or in Farcaster frames.
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            <select
              className="adm-input"
              value={ogType}
              onChange={e => setOgType(e.target.value)}
              style={{ flex: 1 }}
            >
              <option value="daily">Daily Challenge Card</option>
              <option value="result">Result Share Card</option>
            </select>
            <select
              className="adm-input"
              value={ogLength}
              onChange={e => setOgLength(Number(e.target.value))}
              style={{ width: 70 }}
            >
              {[3, 4, 5, 6].map(l => <option key={l} value={l}>{l}L</option>)}
            </select>
            <button className="adm-btn" onClick={previewOg}>Preview</button>
          </div>
          {ogUrl && (
            <div style={{ marginTop: 8 }}>
              <img
                src={ogUrl}
                alt="OG Preview"
                style={{
                  width: "100%", borderRadius: 4, border: "1px solid var(--bd)",
                  aspectRatio: "1200/630", objectFit: "cover",
                }}
                onError={e => {
                  e.target.style.display = "none";
                  e.target.nextSibling.style.display = "block";
                }}
              />
              <div style={{ display: "none", color: "var(--rd)", fontSize: 11, marginTop: 6 }}>
                ⚠️ Could not load image — canvas may not be available in dev mode
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
