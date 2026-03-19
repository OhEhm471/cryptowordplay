import { useState } from "react";
import { useAdminFetch } from "../hooks/useAdmin";
import { adminApi } from "../lib/api";

const LENGTHS = [3, 4, 5, 6];

export default function WordsScreen() {
  const [activeLength, setActiveLength] = useState(5);
  const [schedDays, setSchedDays]       = useState(14);
  const [previewDate, setPreviewDate]   = useState(new Date().toISOString().split("T")[0]);
  const [previewLen,  setPreviewLen]    = useState(5);
  const [previewResult, setPreviewResult] = useState(null);
  const [isPreviewing,  setIsPreviewing]  = useState(false);

  const { data: wordData, isLoading: wLoading, error: wError, reload: wReload } =
    useAdminFetch(() => adminApi.getWordList(activeLength), [activeLength]);

  const { data: schedData, isLoading: sLoading, error: sError, reload: sReload } =
    useAdminFetch(() => adminApi.getSchedule(activeLength, schedDays), [activeLength, schedDays]);

  async function handlePreview() {
    setIsPreviewing(true);
    try {
      const res = await adminApi.previewWord(previewDate, previewLen);
      setPreviewResult(res);
    } catch (err) {
      setPreviewResult({ error: err.message });
    } finally {
      setIsPreviewing(false);
    }
  }

  const wordList = wordData?.[activeLength];
  const today    = new Date().toISOString().split("T")[0];

  return (
    <div>
      <div className="adm-screen-hdr">
        <div>
          <div className="adm-screen-title">Words</div>
          <div className="adm-screen-sub">Word lists · Daily schedule · Preview</div>
        </div>
      </div>

      {/* Length tabs */}
      <div className="adm-tabs" style={{ marginBottom: 14 }}>
        {LENGTHS.map(l => (
          <button key={l} className={`adm-tab${activeLength === l ? " on" : ""}`} onClick={() => setActiveLength(l)}>
            {l}-Letter
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>

        {/* Word list */}
        <div className="adm-card" style={{ gridRow: "span 2" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div className="adm-card-title" style={{ margin: 0 }}>
              {activeLength}-Letter Words
              {wordList && <span style={{ color: "var(--gt)", fontWeight: 400, marginLeft: 8 }}>({wordList.count} total)</span>}
            </div>
            <button className="adm-btn-sm" onClick={wReload}>↻</button>
          </div>

          {wLoading && <div className="adm-loading-sm">Loading...</div>}
          {wError   && <div className="adm-error-sm">❌ {wError}</div>}

          {wordList && (
            <>
              <div className="adm-today-word">
                <span style={{ color: "var(--gt)", fontSize: 10, letterSpacing: 1 }}>TODAY'S WORD</span>
                <span style={{ fontFamily: "var(--hd)", fontSize: 20, fontWeight: 700, color: "var(--yw)", letterSpacing: 3 }}>
                  {wordList.todayWord}
                </span>
              </div>
              <div className="adm-word-grid">
                {wordList.words.map((w, i) => (
                  <div
                    key={i}
                    className={`adm-word-chip${w === wordList.todayWord ? " today" : ""}`}
                    title={w === wordList.todayWord ? "Today's word" : ""}
                  >
                    {w}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Date preview */}
        <div className="adm-card">
          <div className="adm-card-title">Preview Word for Date</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            <input
              type="date"
              value={previewDate}
              onChange={e => setPreviewDate(e.target.value)}
              className="adm-input"
              style={{ flex: 1 }}
            />
            <select
              value={previewLen}
              onChange={e => setPreviewLen(Number(e.target.value))}
              className="adm-input"
              style={{ width: 80 }}
            >
              {LENGTHS.map(l => <option key={l} value={l}>{l}L</option>)}
            </select>
            <button className="adm-btn" onClick={handlePreview} disabled={isPreviewing}>
              {isPreviewing ? "..." : "Preview"}
            </button>
          </div>
          {previewResult?.error && <div className="adm-error-sm">{previewResult.error}</div>}
          {previewResult?.word && (
            <div className="adm-today-word" style={{ marginTop: 0 }}>
              <span style={{ fontSize: 10, color: "var(--gt)", letterSpacing: 1 }}>
                {previewResult.date} · {previewResult.length}L
              </span>
              <span style={{ fontFamily: "var(--hd)", fontSize: 22, fontWeight: 700, color: "var(--gr)", letterSpacing: 3 }}>
                {previewResult.word}
              </span>
            </div>
          )}
        </div>

        {/* Upcoming schedule */}
        <div className="adm-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div className="adm-card-title" style={{ margin: 0 }}>Upcoming Schedule</div>
            <select
              value={schedDays}
              onChange={e => setSchedDays(Number(e.target.value))}
              className="adm-input"
              style={{ width: 90 }}
            >
              {[7, 14, 21, 30].map(d => <option key={d} value={d}>{d} days</option>)}
            </select>
          </div>

          {sLoading && <div className="adm-loading-sm">Loading schedule...</div>}
          {sError   && <div className="adm-error-sm">❌ {sError}</div>}

          {schedData?.days && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 260, overflowY: "auto" }}>
              {schedData.days.map(({ date, word }) => (
                <div
                  key={date}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "5px 8px", borderRadius: 3, fontSize: 11,
                    background: date === today ? "var(--gd)" : "var(--sf2)",
                    border: `1px solid ${date === today ? "var(--gr)" : "var(--bd)"}`,
                  }}
                >
                  <span style={{ color: date === today ? "var(--gr)" : "var(--gt)", fontFamily: "monospace" }}>
                    {date}{date === today && " ← TODAY"}
                  </span>
                  <span style={{
                    fontFamily: "var(--hd)", fontWeight: 700,
                    color: date === today ? "var(--yw)" : "var(--tb)",
                    letterSpacing: 2, fontSize: 12,
                  }}>
                    {word}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
