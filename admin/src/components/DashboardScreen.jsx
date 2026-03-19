import { useAdminFetch } from "../hooks/useAdmin";
import { adminApi } from "../lib/api";

// ── Mini bar chart ────────────────────────────────────────────
function Bar({ label, value, max, color = "var(--gr)" }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--gt)", marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ color: "var(--tb)" }}>{value}</span>
      </div>
      <div style={{ height: 6, background: "var(--bd)", borderRadius: 3 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width .4s ease" }} />
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────
function StatCard({ label, value, sub, color = "var(--gr)", icon }) {
  return (
    <div className="adm-card" style={{ flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontFamily: "var(--hd)", fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontFamily: "var(--hd)", fontSize: 11, color: "var(--tb)", marginTop: 4, letterSpacing: 1 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--gt)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export default function DashboardScreen() {
  const { data, isLoading, error, reload } = useAdminFetch(() => adminApi.getDashboard());

  if (isLoading) return <div className="adm-loading">⚡ Loading dashboard...</div>;
  if (error)     return <div className="adm-error">❌ {error} <button className="adm-btn-sm" onClick={reload}>Retry</button></div>;
  if (!data)     return null;

  const { dau, totalPlayers, todayGames, weeklyRetention, topEvents, date } = data;
  const maxEvent = topEvents?.[0]?.count || 1;

  const retentionPct = dau > 0 ? Math.round((weeklyRetention / dau) * 100) : 0;

  return (
    <div>
      <div className="adm-screen-hdr">
        <div>
          <div className="adm-screen-title">Dashboard</div>
          <div className="adm-screen-sub">{date} · Live data</div>
        </div>
        <button className="adm-btn-sm" onClick={reload}>↻ Refresh</button>
      </div>

      {/* Top stat cards */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <StatCard icon="👥" label="DAILY ACTIVE" value={dau} sub={`of ${totalPlayers} total`} color="var(--gr)" />
        <StatCard icon="🎮" label="GAMES TODAY"  value={todayGames.total} sub={`${todayGames.inProgress} in progress`} color="var(--yw)" />
        <StatCard icon="🏆" label="WIN RATE"     value={todayGames.winRate} sub={`${todayGames.wins}W / ${todayGames.losses}L`} color="var(--ac)" />
        <StatCard icon="🔄" label="RETENTION"    value={`${retentionPct}%`} sub={`${weeklyRetention} returning`} color="#00e5ff" />
      </div>

      {/* Two column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>

        {/* Today's game breakdown */}
        <div className="adm-card">
          <div className="adm-card-title">Today's Games</div>
          <Bar label="Wins"        value={todayGames.wins}       max={todayGames.total} color="var(--gr)" />
          <Bar label="Losses"      value={todayGames.losses}     max={todayGames.total} color="var(--rd)" />
          <Bar label="In Progress" value={todayGames.inProgress} max={todayGames.total} color="var(--yw)" />
          <div style={{ marginTop: 10, padding: "8px 0", borderTop: "1px solid var(--bd)", fontSize: 11, color: "var(--gt)" }}>
            Total: <span style={{ color: "var(--tb)" }}>{todayGames.total}</span> games played today
          </div>
        </div>

        {/* Top events */}
        <div className="adm-card">
          <div className="adm-card-title">Top Events (24h)</div>
          {topEvents?.length === 0 && (
            <div style={{ color: "var(--gt)", fontSize: 11 }}>No events yet today</div>
          )}
          {topEvents?.map((ev, i) => (
            <Bar key={i} label={ev.event} value={ev.count} max={maxEvent}
              color={i === 0 ? "var(--gr)" : i === 1 ? "var(--yw)" : "var(--ac)"} />
          ))}
        </div>

        {/* Players summary */}
        <div className="adm-card">
          <div className="adm-card-title">Player Stats</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { l: "Total Registered", v: totalPlayers, c: "var(--tb)" },
              { l: "Active Today",     v: dau,          c: "var(--gr)" },
              { l: "Returning (7d)",   v: weeklyRetention, c: "#00e5ff" },
              { l: "New Today",        v: Math.max(0, dau - weeklyRetention), c: "var(--yw)" },
            ].map(({ l, v, c }) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, borderBottom: "1px solid var(--bd)", paddingBottom: 6 }}>
                <span style={{ color: "var(--gt)" }}>{l}</span>
                <span style={{ fontFamily: "var(--hd)", fontWeight: 700, color: c }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Win/loss funnel */}
        <div className="adm-card">
          <div className="adm-card-title">Win Distribution</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 80, marginTop: 8 }}>
            {todayGames.total > 0 ? (
              <>
                {[
                  { l: "Win",  v: todayGames.wins,   c: "var(--gr)" },
                  { l: "Loss", v: todayGames.losses,  c: "var(--rd)" },
                  { l: "Live", v: todayGames.inProgress, c: "var(--yw)" },
                ].map(({ l, v, c }) => {
                  const h = Math.max(6, Math.round((v / todayGames.total) * 72));
                  return (
                    <div key={l} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <div style={{ fontSize: 10, color: c, fontFamily: "var(--hd)", fontWeight: 700 }}>{v}</div>
                      <div style={{ width: "100%", height: h, background: c, borderRadius: "3px 3px 0 0", opacity: .85 }} />
                      <div style={{ fontSize: 9, color: "var(--gt)", letterSpacing: 1 }}>{l}</div>
                    </div>
                  );
                })}
              </>
            ) : (
              <div style={{ color: "var(--gt)", fontSize: 11, width: "100%", textAlign: "center", paddingTop: 20 }}>No games yet today</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
