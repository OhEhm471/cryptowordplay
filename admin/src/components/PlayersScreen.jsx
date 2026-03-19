import { useState, useCallback } from "react";
import { adminApi } from "../lib/api";

function fmt(n) { return n != null ? Number(n).toLocaleString() : "—"; }
function addr(s) { return s ? `${s.slice(0, 6)}…${s.slice(-4)}` : "—"; }

export default function PlayersScreen() {
  const [search,    setSearch]    = useState("");
  const [players,   setPlayers]   = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState(null);
  const [offset,    setOffset]    = useState(0);
  const [hasMore,   setHasMore]   = useState(false);
  const [dirty,     setDirty]     = useState(true); // load on mount

  const load = useCallback(async (newOffset = 0, append = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminApi.getPlayers(search, newOffset);
      const rows = data.players || [];
      setPlayers(append ? prev => [...prev, ...rows] : rows);
      setHasMore(rows.length === 50);
      setOffset(newOffset + rows.length);
      setDirty(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  // Load on mount
  if (dirty && !isLoading) load(0);

  function handleSearch(e) {
    e.preventDefault();
    setOffset(0);
    load(0);
  }

  return (
    <div>
      <div className="adm-screen-hdr">
        <div>
          <div className="adm-screen-title">Players</div>
          <div className="adm-screen-sub">Search and view player stats</div>
        </div>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input
          className="adm-input"
          style={{ flex: 1 }}
          placeholder="Search by username or wallet address…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className="adm-btn" type="submit" disabled={isLoading}>
          {isLoading ? "…" : "🔍 Search"}
        </button>
        {search && (
          <button className="adm-btn-sm" type="button" onClick={() => { setSearch(""); setDirty(true); }}>
            Clear
          </button>
        )}
      </form>

      {error && <div className="adm-error" style={{ marginBottom: 12 }}>❌ {error}</div>}

      {/* Table */}
      <div className="adm-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="adm-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Wallet</th>
                <th>FID</th>
                <th>Wins</th>
                <th>Played</th>
                <th>Streak</th>
                <th>Score</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {players.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", color: "var(--gt)", padding: "24px", fontSize: 11 }}>
                    {search ? "No players match your search" : "No players yet"}
                  </td>
                </tr>
              )}
              {players.map(p => (
                <tr key={p.id}>
                  <td>
                    <span style={{ color: "var(--tb)", fontFamily: "var(--hd)", fontWeight: 600 }}>
                      {p.username || <span style={{ color: "var(--gt)", fontStyle: "italic" }}>anonymous</span>}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--gt)" }}>
                      {addr(p.wallet_address)}
                    </span>
                  </td>
                  <td style={{ color: p.farcaster_fid ? "var(--ac)" : "var(--gt)" }}>
                    {p.farcaster_fid ? `#${p.farcaster_fid}` : "—"}
                  </td>
                  <td style={{ color: "var(--gr)", fontFamily: "var(--hd)", fontWeight: 700 }}>
                    {fmt(p.total_wins)}
                  </td>
                  <td>{fmt(p.total_played)}</td>
                  <td style={{ color: p.current_streak > 0 ? "var(--yw)" : "var(--gt)" }}>
                    {p.current_streak > 0 ? `🔥 ${p.current_streak}` : "0"}
                  </td>
                  <td style={{ color: "var(--ac)", fontFamily: "var(--hd)", fontWeight: 700 }}>
                    {fmt(p.total_score)}
                  </td>
                  <td style={{ color: "var(--gt)", fontSize: 10 }}>
                    {p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
              {isLoading && (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "16px", color: "var(--gt)", fontSize: 11 }}>
                    ⚡ Loading...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {(hasMore || offset > 50) && (
          <div style={{ padding: "10px 16px", borderTop: "1px solid var(--bd)", display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--gt)" }}>Showing {players.length} players</span>
            {hasMore && (
              <button
                className="adm-btn-sm"
                onClick={() => load(offset, true)}
                disabled={isLoading}
                style={{ marginLeft: "auto" }}
              >
                Load more
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
