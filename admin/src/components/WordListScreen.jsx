import { useState, useCallback, useEffect } from "react";

const LENGTHS = [3, 4, 5, 6];

// Self-contained request helper
function wlReq(path, opts = {}) {
  const BASE  = (import.meta.env.VITE_API_URL || "/api") + "/admin";
  const token = localStorage.getItem("cwp_admin_token") || "";
  return fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, ...(opts.headers || {}) },
  }).then(async r => {
    if (r.status === 401) { localStorage.removeItem("cwp_admin_token"); window.location.reload(); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
  });
}

// ── Fetch helpers ─────────────────────────────────────────────
async function fetchWords(length, inactive = false) {
  return wlReq(`/wordlist/${length}${inactive ? "?inactive=true" : ""}`);
}
async function fetchSchedule(length, days) {
  return wlReq(`/wordlist/${length}/schedule?days=${days}`);
}
async function fetchSummary() {
  return wlReq("/wordlist/summary");
}

// ── Sub-components ────────────────────────────────────────────

function Toast({ msg, type = "ok", onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [msg]);
  const bg = type === "ok" ? "var(--gd)" : "rgba(255,69,96,.12)";
  const bc = type === "ok" ? "var(--gr)"  : "var(--rd)";
  return (
    <div style={{
      position: "fixed", top: 20, right: 20, zIndex: 9999,
      background: bg, border: `1px solid ${bc}`, color: bc,
      padding: "10px 16px", borderRadius: 5, fontSize: 12,
      fontFamily: "var(--hd)", letterSpacing: 1, maxWidth: 360,
      animation: "rpin .2s ease",
    }}>
      {msg}
    </div>
  );
}

function SummaryBar({ summary }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
      {LENGTHS.map(l => {
        const row = summary?.find(s => parseInt(s.length) === l);
        return (
          <div key={l} className="adm-card" style={{ flex: 1, minWidth: 100, textAlign: "center", padding: "10px 8px" }}>
            <div style={{ fontFamily: "var(--hd)", fontSize: 24, fontWeight: 700, color: "var(--gr)" }}>
              {row?.active_count || 0}
            </div>
            <div style={{ fontSize: 9, color: "var(--gt)", letterSpacing: 1.5, marginTop: 2 }}>{l}-LETTER</div>
            {row?.inactive_count > 0 && (
              <div style={{ fontSize: 9, color: "var(--rd)", marginTop: 2 }}>{row.inactive_count} removed</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function WordListScreen() {
  const [activeLen,    setActiveLen]    = useState(5);
  const [wordData,     setWordData]     = useState(null);
  const [schedData,    setSchedData]    = useState(null);
  const [summary,      setSummary]      = useState(null);
  const [isLoading,    setIsLoading]    = useState(false);
  const [schedDays,    setSchedDays]    = useState(30);
  const [showInactive, setShowInactive] = useState(false);
  const [activeTab,    setActiveTab]    = useState("list"); // list|schedule|import
  const [toast,        setToast]        = useState(null);

  // Add word
  const [addWord,   setAddWord]   = useState("");
  const [addNotes,  setAddNotes]  = useState("");
  const [addBusy,   setAddBusy]   = useState(false);

  // Remove
  const [removingWord, setRemovingWord] = useState(null);

  // Bulk import
  const [importText, setImportText] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Search / filter within list
  const [search, setSearch] = useState("");

  const showToast = (msg, type = "ok") => setToast({ msg, type });

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [wd, sd, sm] = await Promise.all([
        fetchWords(activeLen, showInactive),
        fetchSchedule(activeLen, schedDays),
        fetchSummary(),
      ]);
      setWordData(wd);
      setSchedData(sd);
      setSummary(sm.summary);
    } catch (err) {
      showToast(err.message, "err");
    } finally {
      setIsLoading(false);
    }
  }, [activeLen, showInactive, schedDays]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Handlers ─────────────────────────────────────────────────
  async function handleAdd(e) {
    e.preventDefault();
    if (!addWord.trim()) return;
    setAddBusy(true);
    try {
      const res = await wlReq(`/wordlist/${activeLen}`, {
        method: "POST",
        body: JSON.stringify({ word: addWord.trim(), notes: addNotes.trim() || null }),
      });
      showToast(res.message || `"${res.word}" added`);
      setAddWord(""); setAddNotes("");
      loadAll();
    } catch (err) {
      showToast(err.message, "err");
    } finally {
      setAddBusy(false);
    }
  }

  async function handleRemove(word) {
    setRemovingWord(word);
    try {
      const res = await wlReq(`/wordlist/${activeLen}/${word}`, { method: "DELETE" });
      if (res.warning) showToast(res.warning, "err");
      else showToast(`"${word}" removed`);
      loadAll();
    } catch (err) {
      showToast(err.message, "err");
    } finally {
      setRemovingWord(null);
    }
  }

  async function handleImport(e) {
    e.preventDefault();
    if (!importText.trim()) return;
    setImportBusy(true);
    setImportResult(null);
    try {
      const res = await wlReq(`/wordlist/${activeLen}/import`, {
        method: "POST",
        body: JSON.stringify({ words: importText }),
      });
      setImportResult(res);
      if (res.imported > 0) { loadAll(); showToast(res.message); }
      else showToast(res.message, "err");
    } catch (err) {
      showToast(err.message, "err");
    } finally {
      setImportBusy(false);
    }
  }

  async function handleReload() {
    try {
      const res = await wlReq("/wordlist/reload", { method: "POST" });
      showToast(`Cache reloaded — ${res.loaded} words from ${res.source}`);
    } catch (err) {
      showToast(err.message, "err");
    }
  }

  // ── Filtered list ─────────────────────────────────────────────
  const filteredWords = (wordData?.words || []).filter(w =>
    !search || w.word.includes(search.toUpperCase())
  );
  const today = new Date().toISOString().split("T")[0];

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}

      <div className="adm-screen-hdr">
        <div>
          <div className="adm-screen-title">Word Lists</div>
          <div className="adm-screen-sub">Add · Remove · Bulk import · Schedule preview</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="adm-btn-sm" onClick={handleReload} title="Force reload cache from DB">↺ Reload Cache</button>
          <button className="adm-btn-sm" onClick={loadAll} disabled={isLoading}>↻ Refresh</button>
        </div>
      </div>

      {/* Summary bar */}
      <SummaryBar summary={summary} />

      {/* Length tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {LENGTHS.map(l => (
          <button key={l} className={`adm-tab${activeLen === l ? " on" : ""}`} onClick={() => setActiveLen(l)}>
            {l}-Letter
            {summary && (
              <span style={{ marginLeft: 6, opacity: .7, fontSize: 9 }}>
                ({summary.find(s => parseInt(s.length) === l)?.active_count || 0})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Mode tabs */}
      <div className="adm-tabs" style={{ marginBottom: 14, borderBottom: "1px solid var(--bd)", paddingBottom: 10 }}>
        {[
          { id: "list",     label: "📋 Word List" },
          { id: "schedule", label: "📅 Schedule" },
          { id: "import",   label: "📥 Bulk Import" },
        ].map(t => (
          <button key={t.id} className={`adm-tab${activeTab === t.id ? " on" : ""}`} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: WORD LIST ────────────────────────────────────── */}
      {activeTab === "list" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 12 }}>

          {/* Left — word grid */}
          <div className="adm-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <span className="adm-card-title" style={{ display: "inline" }}>
                  {activeLen}-Letter Words
                </span>
                <span style={{ marginLeft: 8, fontSize: 10, color: "var(--gt)" }}>
                  ({filteredWords.length}{search ? ` of ${wordData?.count || 0}` : ""} words)
                </span>
                {wordData?.todayWord && (
                  <span style={{ marginLeft: 10, fontSize: 10, color: "var(--yw)" }}>
                    Today: <strong style={{ letterSpacing: 2 }}>{wordData.todayWord}</strong>
                  </span>
                )}
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--gt)", cursor: "pointer" }}>
                <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
                Show removed
              </label>
            </div>

            {/* Search */}
            <input
              className="adm-input"
              style={{ width: "100%", marginBottom: 10 }}
              placeholder={`Filter ${activeLen}-letter words…`}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />

            {isLoading && <div className="adm-loading-sm">Loading...</div>}

            {!isLoading && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, maxHeight: 420, overflowY: "auto" }}>
                {filteredWords.length === 0 && (
                  <div style={{ color: "var(--gt)", fontSize: 11, padding: "12px 0" }}>No words found</div>
                )}
                {filteredWords.map(w => {
                  const isToday  = w.word === wordData?.todayWord;
                  const inactive = !w.active;
                  return (
                    <div
                      key={w.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "4px 8px 4px 10px",
                        background: isToday ? "var(--yd)" : inactive ? "rgba(255,69,96,.06)" : "var(--sf2)",
                        border: `1px solid ${isToday ? "var(--yw)" : inactive ? "var(--rd)" : "var(--bd)"}`,
                        borderRadius: 3, fontSize: 11,
                        opacity: inactive ? .5 : 1,
                      }}
                      title={w.notes || `Added by ${w.added_by} on ${new Date(w.added_at).toLocaleDateString()}`}
                    >
                      <span style={{
                        fontFamily: "var(--mo)", letterSpacing: 1.5,
                        color: isToday ? "var(--yw)" : inactive ? "var(--rd)" : "var(--tx)",
                      }}>
                        {w.word}
                        {isToday && " 📅"}
                      </span>
                      {!inactive && (
                        <button
                          onClick={() => handleRemove(w.word)}
                          disabled={removingWord === w.word}
                          style={{
                            background: "none", border: "none", color: "var(--gt)",
                            cursor: "pointer", fontSize: 11, lineHeight: 1, padding: "0 2px",
                            transition: "color .1s",
                          }}
                          onMouseEnter={e => e.target.style.color = "var(--rd)"}
                          onMouseLeave={e => e.target.style.color = "var(--gt)"}
                          title={`Remove "${w.word}"`}
                        >
                          {removingWord === w.word ? "…" : "×"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right — Add word form */}
          <div>
            <div className="adm-card">
              <div className="adm-card-title">Add Word</div>
              <form onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 9, color: "var(--gt)", letterSpacing: 1, marginBottom: 4 }}>WORD ({activeLen} letters)</div>
                  <input
                    className="adm-input"
                    style={{ width: "100%", textTransform: "uppercase", letterSpacing: 2, fontFamily: "var(--hd)", fontSize: 15 }}
                    placeholder={`e.g. ${"STAKE".slice(0, activeLen).padEnd(activeLen, "X")}`}
                    value={addWord}
                    onChange={e => setAddWord(e.target.value.toUpperCase())}
                    maxLength={activeLen}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "var(--gt)", letterSpacing: 1, marginBottom: 4 }}>NOTES (optional)</div>
                  <input
                    className="adm-input"
                    style={{ width: "100%" }}
                    placeholder="e.g. DeFi protocol name"
                    value={addNotes}
                    onChange={e => setAddNotes(e.target.value)}
                  />
                </div>
                <button
                  className="adm-btn"
                  type="submit"
                  disabled={addBusy || addWord.length !== activeLen}
                  style={{ marginTop: 4 }}
                >
                  {addBusy ? "⏳ Adding..." : `+ Add to ${activeLen}-Letter List`}
                </button>
              </form>

              {/* Quick rules */}
              <div style={{ marginTop: 14, fontSize: 10, color: "var(--gt)", lineHeight: 1.7, borderTop: "1px solid var(--bd)", paddingTop: 10 }}>
                <div>✓ Must be exactly {activeLen} letters</div>
                <div>✓ Letters only (A–Z)</div>
                <div>✓ Crypto/Web3 vocabulary</div>
                <div>✓ Uppercase automatically</div>
                <div>✗ No duplicates</div>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ── TAB: SCHEDULE ─────────────────────────────────────── */}
      {activeTab === "schedule" && (
        <div className="adm-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div className="adm-card-title" style={{ margin: 0 }}>
              Upcoming {activeLen}-Letter Words
            </div>
            <select
              className="adm-input"
              value={schedDays}
              onChange={e => setSchedDays(Number(e.target.value))}
              style={{ width: 100 }}
            >
              {[7, 14, 30, 60].map(d => <option key={d} value={d}>{d} days</option>)}
            </select>
          </div>

          <div style={{ fontSize: 10, color: "var(--gt)", marginBottom: 12, lineHeight: 1.6 }}>
            The schedule is deterministic — based on the word pool + WORD_SALT. Adding or removing words changes future assignments. Past games are unaffected.
          </div>

          {isLoading && <div className="adm-loading-sm">Loading schedule...</div>}

          {!isLoading && schedData?.schedule && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6 }}>
              {schedData.schedule.map(({ date, word, isToday }) => (
                <div
                  key={date}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "7px 10px", borderRadius: 4,
                    background: isToday ? "var(--gd)" : "var(--sf2)",
                    border: `1px solid ${isToday ? "var(--gr)" : "var(--bd)"}`,
                  }}
                >
                  <span style={{ fontSize: 10, color: isToday ? "var(--gr)" : "var(--gt)", fontFamily: "monospace" }}>
                    {date}{isToday && " ← TODAY"}
                  </span>
                  <span style={{
                    fontFamily: "var(--hd)", fontWeight: 700, fontSize: 13, letterSpacing: 2,
                    color: isToday ? "var(--yw)" : "var(--tb)",
                  }}>
                    {word}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: BULK IMPORT ──────────────────────────────────── */}
      {activeTab === "import" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="adm-card">
            <div className="adm-card-title">Bulk Import — {activeLen}-Letter Words</div>
            <div style={{ fontSize: 10, color: "var(--gt)", marginBottom: 12, lineHeight: 1.7 }}>
              Paste words separated by commas, spaces, or newlines.<br />
              Max 500 words per import. Each word is validated and deduplicated automatically.
            </div>
            <form onSubmit={handleImport} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <textarea
                className="adm-input"
                style={{ width: "100%", height: 180, resize: "vertical", textTransform: "uppercase", fontFamily: "var(--mo)", fontSize: 11, lineHeight: 1.8, letterSpacing: 1 }}
                placeholder={`STAKE, YIELD, CHAIN\nBLOCK\nMINER VAULT SHARD`}
                value={importText}
                onChange={e => setImportText(e.target.value.toUpperCase())}
              />
              <button
                className="adm-btn"
                type="submit"
                disabled={importBusy || !importText.trim()}
              >
                {importBusy ? "⏳ Importing..." : `📥 Import into ${activeLen}-Letter List`}
              </button>
            </form>
          </div>

          {/* Import results */}
          <div className="adm-card">
            <div className="adm-card-title">Import Results</div>
            {!importResult && (
              <div style={{ color: "var(--gt)", fontSize: 11, lineHeight: 1.7 }}>
                Results will appear here after import.<br /><br />
                <strong style={{ color: "var(--tb)" }}>Tips:</strong><br />
                • Words are auto-uppercased<br />
                • Duplicates are silently skipped<br />
                • Wrong-length words are rejected<br />
                • Already-removed words are re-activated
              </div>
            )}
            {importResult && (
              <div>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                  {[
                    { l: "Imported", v: importResult.imported, c: "var(--gr)" },
                    { l: "Skipped",  v: importResult.skipped,  c: "var(--yw)" },
                    { l: "Errors",   v: importResult.errors?.length || 0, c: "var(--rd)" },
                  ].map(({ l, v, c }) => (
                    <div key={l} style={{ flex: 1, textAlign: "center", background: "var(--sf2)", border: "1px solid var(--bd)", borderRadius: 4, padding: "8px 4px" }}>
                      <div style={{ fontFamily: "var(--hd)", fontSize: 20, fontWeight: 700, color: c }}>{v}</div>
                      <div style={{ fontSize: 9, color: "var(--gt)", letterSpacing: 1 }}>{l}</div>
                    </div>
                  ))}
                </div>

                {importResult.words?.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 9, color: "var(--gt)", letterSpacing: 1, marginBottom: 5 }}>ADDED</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {importResult.words.map(w => (
                        <span key={w} style={{ padding: "2px 7px", background: "var(--gd)", border: "1px solid var(--gr)", borderRadius: 3, fontSize: 10, color: "var(--gr)", fontFamily: "var(--mo)", letterSpacing: 1 }}>
                          {w}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {importResult.errors?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 9, color: "var(--rd)", letterSpacing: 1, marginBottom: 5 }}>ERRORS</div>
                    <div style={{ maxHeight: 140, overflowY: "auto" }}>
                      {importResult.errors.map((e, i) => (
                        <div key={i} style={{ fontSize: 10, color: "var(--rd)", padding: "2px 0", borderBottom: "1px solid var(--bd)" }}>
                          {e.word ? <strong>{e.word}:</strong> : ""} {e.error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
