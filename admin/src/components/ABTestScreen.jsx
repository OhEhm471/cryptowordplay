import { useState, useCallback, useEffect } from "react";

// Extend adminApi inline to avoid circular deps
function abReq(path, opts = {}) {
  const BASE  = (import.meta.env.VITE_API_URL || "/api") + "/admin";
  const token = localStorage.getItem("cwp_admin_token") || "";
  return fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, ...(opts.headers||{}) },
  }).then(async r => {
    if (r.status === 401) { localStorage.removeItem("cwp_admin_token"); window.location.reload(); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
  });
}

const STATUS_COLORS = {
  active:   { bg: "var(--gd)",               bc: "var(--gr)",  tx: "var(--gr)"  },
  paused:   { bg: "rgba(255,214,10,.1)",      bc: "var(--yw)",  tx: "var(--yw)"  },
  draft:    { bg: "rgba(123,97,255,.1)",       bc: "var(--ac)",  tx: "var(--ac)"  },
  archived: { bg: "rgba(102,102,128,.1)",      bc: "var(--gt)",  tx: "var(--gt)"  },
};

const GOAL_LABELS = {
  game_won:           "Win Rate",
  result_shared:      "Share Rate",
  game_started:       "Session Start",
  leaderboard_viewed: "Leaderboard Views",
};

// ── Status badge ──────────────────────────────────────────────
function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.draft;
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 3, fontSize: 9, letterSpacing: 1.5,
      fontFamily: "var(--hd)", fontWeight: 700, textTransform: "uppercase",
      background: c.bg, border: `1px solid ${c.bc}`, color: c.tx,
    }}>{status}</span>
  );
}

// ── Results bar ───────────────────────────────────────────────
function ResultBar({ label, value, max, color, sub }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: "var(--tb)" }}>{label}</span>
        <span style={{ color, fontFamily: "var(--hd)", fontWeight: 700 }}>{value}{sub}</span>
      </div>
      <div style={{ height: 8, background: "var(--bd)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width .5s ease" }} />
      </div>
    </div>
  );
}

// ── Variant editor row ────────────────────────────────────────
function VariantRow({ v, index, onChange, onRemove, canRemove }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
      <input
        className="adm-input" style={{ width: 90, fontFamily: "var(--mo)", fontSize: 11, letterSpacing: 1 }}
        placeholder="id" value={v.id}
        onChange={e => onChange(index, "id", e.target.value.toLowerCase().replace(/\s/g, "_"))}
      />
      <input
        className="adm-input" style={{ flex: 1 }}
        placeholder="Display name" value={v.name}
        onChange={e => onChange(index, "name", e.target.value)}
      />
      <input
        className="adm-input" style={{ width: 60 }}
        type="number" min="1" max="99" placeholder="wt"
        value={v.weight}
        onChange={e => onChange(index, "weight", parseInt(e.target.value) || 1)}
      />
      {canRemove && (
        <button className="adm-btn-sm" onClick={() => onRemove(index)}
          style={{ color: "var(--rd)", borderColor: "var(--rd)", padding: "4px 8px" }}>×</button>
      )}
    </div>
  );
}

// ── Experiment results panel ──────────────────────────────────
function ResultsPanel({ exp, results, trend }) {
  if (!results || results.length === 0) {
    return (
      <div style={{ color: "var(--gt)", fontSize: 11, padding: "16px 0", textAlign: "center" }}>
        No assignments yet — activate the experiment to start collecting data
      </div>
    );
  }

  const maxConversions = Math.max(...results.map(r => r.conversions), 1);
  const maxAssignments = Math.max(...results.map(r => r.assignments), 1);
  const maxRate        = Math.max(...results.map(r => parseFloat(r.conversionRate)), 1);
  const colors         = ["var(--gr)", "var(--ac)", "var(--yw)", "#00e5ff"];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${results.length}, 1fr)`, gap: 8, marginBottom: 16 }}>
        {results.map((r, i) => {
          const variantDef = exp.variants?.find(v => v.id === r.variantId);
          return (
            <div key={r.variantId} className="adm-card" style={{ textAlign: "center", padding: "12px 8px" }}>
              <div style={{ fontSize: 9, color: "var(--gt)", letterSpacing: 1.5, marginBottom: 4 }}>
                {variantDef?.name || r.variantId}
              </div>
              <div style={{ fontFamily: "var(--hd)", fontSize: 26, fontWeight: 700, color: colors[i] }}>
                {r.conversionRate}%
              </div>
              <div style={{ fontSize: 9, color: "var(--gt)", marginTop: 2 }}>
                {GOAL_LABELS[exp.goal_metric] || exp.goal_metric}
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: "var(--gt)", lineHeight: 1.8 }}>
                <div>{r.assignments.toLocaleString()} assigned</div>
                <div>{r.conversions.toLocaleString()} converted</div>
                {r.avgScore && <div>avg score: <span style={{ color: "var(--tb)" }}>{r.avgScore}</span></div>}
                {r.avgAttempts && <div>avg attempts: <span style={{ color: "var(--tb)" }}>{r.avgAttempts}</span></div>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="adm-card-title" style={{ marginBottom: 10 }}>Conversion Rate by Variant</div>
      {results.map((r, i) => {
        const variantDef = exp.variants?.find(v => v.id === r.variantId);
        return (
          <ResultBar
            key={r.variantId}
            label={variantDef?.name || r.variantId}
            value={parseFloat(r.conversionRate)}
            max={maxRate}
            color={colors[i]}
            sub="%"
          />
        );
      })}

      <div className="adm-card-title" style={{ marginBottom: 10, marginTop: 14 }}>Assignments by Variant</div>
      {results.map((r, i) => {
        const variantDef = exp.variants?.find(v => v.id === r.variantId);
        return (
          <ResultBar
            key={r.variantId}
            label={variantDef?.name || r.variantId}
            value={r.assignments}
            max={maxAssignments}
            color={colors[i]}
            sub=""
          />
        );
      })}

      {/* Winner callout */}
      {results.length >= 2 && results.every(r => r.assignments > 20) && (() => {
        const sorted = [...results].sort((a, b) => parseFloat(b.conversionRate) - parseFloat(a.conversionRate));
        const winner = sorted[0];
        const loser  = sorted[1];
        const delta  = (parseFloat(winner.conversionRate) - parseFloat(loser.conversionRate)).toFixed(1);
        const winDef = exp.variants?.find(v => v.id === winner.variantId);
        return (
          <div style={{
            marginTop: 14, padding: "10px 14px",
            background: "var(--gd)", border: "1px solid var(--gr)", borderRadius: 4,
            fontSize: 11, color: "var(--gr)", lineHeight: 1.7,
          }}>
            <strong>🏆 Leading variant:</strong> {winDef?.name || winner.variantId}<br />
            <span style={{ color: "var(--gt)" }}>
              +{delta}pp vs runner-up · {winner.assignments} assignments · {winner.conversionRate}% {GOAL_LABELS[exp.goal_metric] || "conversion"}
            </span>
          </div>
        );
      })()}
    </div>
  );
}

// ── Create experiment form ────────────────────────────────────
function CreateForm({ onCreated, onCancel }) {
  const [form, setForm] = useState({
    slug: "", name: "", description: "", trafficPct: 100, goalMetric: "game_won",
    variants: [
      { id: "control",   name: "Control (current)",  weight: 50 },
      { id: "treatment", name: "Treatment",           weight: 50 },
    ],
  });
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState(null);

  function updateVariant(i, field, value) {
    setForm(f => { const v = [...f.variants]; v[i] = { ...v[i], [field]: value }; return { ...f, variants: v }; });
  }
  function addVariant() {
    setForm(f => ({ ...f, variants: [...f.variants, { id: `variant_${f.variants.length}`, name: `Variant ${f.variants.length}`, weight: 50 }] }));
  }
  function removeVariant(i) {
    setForm(f => ({ ...f, variants: f.variants.filter((_, j) => j !== i) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await abReq("/ab/experiments", { method: "POST", body: JSON.stringify(form) });
      onCreated(res.experiment);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="adm-card">
      <div className="adm-card-title">New Experiment</div>
      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 9, color: "var(--gt)", letterSpacing: 1, marginBottom: 4 }}>SLUG</div>
            <input className="adm-input" style={{ width: "100%", fontFamily: "var(--mo)" }}
              placeholder="e.g. max_attempts"
              value={form.slug}
              onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s/g, "_") }))}
            />
          </div>
          <div>
            <div style={{ fontSize: 9, color: "var(--gt)", letterSpacing: 1, marginBottom: 4 }}>NAME</div>
            <input className="adm-input" style={{ width: "100%" }}
              placeholder="Max Attempts: 4 vs 5"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: "var(--gt)", letterSpacing: 1, marginBottom: 4 }}>DESCRIPTION (optional)</div>
          <input className="adm-input" style={{ width: "100%" }}
            placeholder="Hypothesis and expected outcome…"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 9, color: "var(--gt)", letterSpacing: 1, marginBottom: 4 }}>TRAFFIC %</div>
            <input className="adm-input" style={{ width: "100%" }}
              type="number" min="1" max="100"
              value={form.trafficPct}
              onChange={e => setForm(f => ({ ...f, trafficPct: parseInt(e.target.value) || 100 }))}
            />
          </div>
          <div>
            <div style={{ fontSize: 9, color: "var(--gt)", letterSpacing: 1, marginBottom: 4 }}>GOAL METRIC</div>
            <select className="adm-input" style={{ width: "100%" }}
              value={form.goalMetric}
              onChange={e => setForm(f => ({ ...f, goalMetric: e.target.value }))}
            >
              {Object.entries(GOAL_LABELS).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 9, color: "var(--gt)", letterSpacing: 1 }}>VARIANTS (id · name · weight)</div>
            <button type="button" className="adm-btn-sm" onClick={addVariant}>+ Add variant</button>
          </div>
          {form.variants.map((v, i) => (
            <VariantRow key={i} v={v} index={i}
              onChange={updateVariant}
              onRemove={removeVariant}
              canRemove={form.variants.length > 2}
            />
          ))}
          <div style={{ fontSize: 9, color: "var(--gt)", marginTop: 4 }}>Weight controls probability ratio between variants</div>
        </div>

        {error && <div className="adm-result-err" style={{ marginBottom: 10 }}>❌ {error}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button className="adm-btn" type="submit" disabled={busy || !form.slug || !form.name}>
            {busy ? "⏳ Creating..." : "✨ Create Experiment"}
          </button>
          <button type="button" className="adm-btn-sm" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────
export default function ABTestScreen() {
  const [experiments, setExperiments] = useState([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [selected,    setSelected]    = useState(null); // { experiment, results, trend }
  const [showCreate,  setShowCreate]  = useState(false);
  const [actionBusy,  setActionBusy]  = useState(null);
  const [error,       setError]       = useState(null);

  const loadList = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await abReq("/ab/experiments");
      setExperiments(data.experiments || []);
    } catch (err) { setError(err.message); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  async function selectExp(exp) {
    try {
      const data = await abReq(`/ab/experiments/${exp.id}`);
      setSelected(data);
      setShowCreate(false);
    } catch (err) { setError(err.message); }
  }

  async function setStatus(exp, status) {
    setActionBusy(exp.id + status);
    try {
      await abReq(`/ab/experiments/${exp.id}/status`, { method: "POST", body: JSON.stringify({ status }) });
      await loadList();
      if (selected?.experiment?.id === exp.id) {
        await selectExp({ ...exp, status });
      }
    } catch (err) { setError(err.message); }
    finally { setActionBusy(null); }
  }

  function handleCreated(exp) {
    setShowCreate(false);
    loadList();
    selectExp(exp);
  }

  const activeCount   = experiments.filter(e => e.status === "active").length;
  const totalAssigned = experiments.reduce((s, e) => s + parseInt(e.total_assignments || 0), 0);

  return (
    <div>
      <div className="adm-screen-hdr">
        <div>
          <div className="adm-screen-title">A/B Experiments</div>
          <div className="adm-screen-sub">
            {activeCount} active · {experiments.length} total · {totalAssigned.toLocaleString()} total assignments
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="adm-btn-sm" onClick={loadList}>↻ Refresh</button>
          <button className="adm-btn" onClick={() => { setShowCreate(true); setSelected(null); }}>
            + New Experiment
          </button>
        </div>
      </div>

      {error && <div className="adm-error" style={{ marginBottom: 12 }}>❌ {error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 12 }}>

        {/* Left — experiment list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {isLoading && <div className="adm-loading-sm">Loading experiments...</div>}

          {experiments.map(exp => {
            const isSelected = selected?.experiment?.id === exp.id;
            return (
              <div
                key={exp.id}
                onClick={() => selectExp(exp)}
                style={{
                  padding: "10px 12px", borderRadius: 5, cursor: "pointer",
                  background: isSelected ? "var(--sf2)" : "var(--sf)",
                  border: `1px solid ${isSelected ? "var(--gr)" : "var(--bd)"}`,
                  transition: "border-color .12s",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 5 }}>
                  <div style={{ fontFamily: "var(--hd)", fontSize: 13, fontWeight: 700, color: isSelected ? "var(--gr)" : "var(--tb)", lineHeight: 1.3 }}>
                    {exp.name}
                  </div>
                  <StatusBadge status={exp.status} />
                </div>
                <div style={{ fontSize: 9, color: "var(--gt)", fontFamily: "var(--mo)", marginBottom: 4 }}>{exp.slug}</div>
                <div style={{ display: "flex", gap: 10, fontSize: 10, color: "var(--gt)" }}>
                  <span>👥 {parseInt(exp.total_assignments || 0).toLocaleString()}</span>
                  <span>✅ {parseInt(exp.total_conversions || 0).toLocaleString()}</span>
                  <span>🎯 {GOAL_LABELS[exp.goal_metric] || exp.goal_metric}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right — detail panel */}
        <div>
          {showCreate && (
            <CreateForm onCreated={handleCreated} onCancel={() => setShowCreate(false)} />
          )}

          {!showCreate && !selected && (
            <div className="adm-card" style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🧪</div>
              <div style={{ color: "var(--gt)", fontSize: 11, lineHeight: 1.7 }}>
                Select an experiment to see results,<br />
                or create a new one to start testing.
              </div>
            </div>
          )}

          {!showCreate && selected && (() => {
            const exp = selected.experiment;
            const c   = STATUS_COLORS[exp.status];
            return (
              <div>
                <div className="adm-card" style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontFamily: "var(--hd)", fontSize: 17, fontWeight: 700, color: "var(--tb)" }}>{exp.name}</div>
                      <div style={{ fontSize: 10, color: "var(--gt)", fontFamily: "var(--mo)", marginTop: 2 }}>{exp.slug}</div>
                    </div>
                    <StatusBadge status={exp.status} />
                  </div>

                  {exp.description && (
                    <div style={{ fontSize: 11, color: "var(--gt)", marginBottom: 10, lineHeight: 1.6, borderLeft: "2px solid var(--bd)", paddingLeft: 10 }}>
                      {exp.description}
                    </div>
                  )}

                  {/* Stats row */}
                  <div style={{ display: "flex", gap: 12, fontSize: 11, marginBottom: 12 }}>
                    {[
                      { l: "Traffic", v: `${exp.traffic_pct}%` },
                      { l: "Assigned", v: parseInt(exp.total_assignments||0).toLocaleString() },
                      { l: "Converted", v: parseInt(exp.total_conversions||0).toLocaleString() },
                      { l: "Goal", v: GOAL_LABELS[exp.goal_metric] || exp.goal_metric },
                      { l: "Variants", v: exp.variants?.length || 0 },
                    ].map(({ l, v }) => (
                      <div key={l} style={{ textAlign: "center" }}>
                        <div style={{ fontFamily: "var(--hd)", fontWeight: 700, fontSize: 14, color: "var(--tb)" }}>{v}</div>
                        <div style={{ fontSize: 9, color: "var(--gt)", letterSpacing: 1 }}>{l}</div>
                      </div>
                    ))}
                  </div>

                  {/* Variants chips */}
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
                    {exp.variants?.map((v, i) => {
                      const cols = ["var(--gr)", "var(--ac)", "var(--yw)", "#00e5ff"];
                      return (
                        <span key={v.id} style={{
                          padding: "3px 10px", borderRadius: 3, fontSize: 10,
                          background: "var(--sf2)", border: `1px solid ${cols[i] || "var(--bd)"}`,
                          color: cols[i] || "var(--tx)", fontFamily: "var(--mo)", letterSpacing: 1,
                        }}>
                          {v.name} · {v.weight}wt
                        </span>
                      );
                    })}
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {exp.status === "draft"  && <button className="adm-btn" disabled={actionBusy} onClick={() => setStatus(exp, "active")}>▶ Activate</button>}
                    {exp.status === "active" && <button className="adm-btn" disabled={actionBusy} onClick={() => setStatus(exp, "paused")} style={{ background: "var(--yd)", borderColor: "var(--yw)", color: "var(--yw)" }}>⏸ Pause</button>}
                    {exp.status === "paused" && <button className="adm-btn" disabled={actionBusy} onClick={() => setStatus(exp, "active")}>▶ Resume</button>}
                    {exp.status !== "archived" && (
                      <button className="adm-btn-sm danger" disabled={actionBusy}
                        onClick={() => { if (confirm("Archive this experiment? This ends data collection.")) setStatus(exp, "archived"); }}
                        style={{ color: "var(--rd)", borderColor: "var(--rd)" }}
                      >Archive</button>
                    )}
                    {exp.started_at && <span style={{ fontSize: 10, color: "var(--gt)", alignSelf: "center" }}>Started {new Date(exp.started_at).toLocaleDateString()}</span>}
                  </div>
                </div>

                {/* Results */}
                <div className="adm-card">
                  <div className="adm-card-title">Results — {GOAL_LABELS[exp.goal_metric] || exp.goal_metric}</div>
                  <ResultsPanel exp={exp} results={selected.results} trend={selected.trend} />
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
