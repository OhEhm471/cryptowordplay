import { useState } from "react";
import { useAdmin } from "./hooks/useAdmin";
import DashboardScreen from "./components/DashboardScreen";
import WordsScreen     from "./components/WordsScreen";
import PlayersScreen   from "./components/PlayersScreen";
import ToolsScreen     from "./components/ToolsScreen";
import WordListScreen  from "./components/WordListScreen";
import ABTestScreen    from "./components/ABTestScreen";

// ─── CSS ─────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@400;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#060608;--sf:#0d0d12;--sf2:#13131a;--bd:#1e1e2a;
  --gr:#00e676;--gd:#00432a;--yw:#ffd60a;--yd:#3d3300;
  --gt:#666680;--tx:#c8c8e0;--tb:#e8e8ff;--rd:#ff4560;--ac:#7b61ff;
  --mo:'Share Tech Mono',monospace;--hd:'Rajdhani',sans-serif
}
body{background:var(--bg);color:var(--tx);font-family:var(--mo);min-height:100vh}
/* ── Layout ── */
.adm-shell{display:flex;min-height:100vh}
.adm-sidebar{
  width:200px;min-height:100vh;background:var(--sf);
  border-right:1px solid var(--bd);display:flex;flex-direction:column;
  position:sticky;top:0;flex-shrink:0
}
.adm-sidebar-logo{padding:18px 16px 14px;border-bottom:1px solid var(--bd)}
.adm-logo-title{font-family:var(--hd);font-size:15px;font-weight:700;color:var(--gr);letter-spacing:1px}
.adm-logo-sub{font-size:9px;color:var(--gt);letter-spacing:2px;margin-top:2px;text-transform:uppercase}
.adm-nav{padding:10px 0;flex:1}
.adm-nav-item{
  display:flex;align-items:center;gap:10px;padding:10px 16px;
  font-size:12px;color:var(--gt);cursor:pointer;transition:all .12s;
  border-left:2px solid transparent;letter-spacing:.5px
}
.adm-nav-item:hover{color:var(--tb);background:var(--sf2)}
.adm-nav-item.on{color:var(--gr);border-left-color:var(--gr);background:rgba(0,230,118,.05)}
.adm-nav-icon{font-size:14px;width:18px;text-align:center}
.adm-sidebar-footer{padding:12px 16px;border-top:1px solid var(--bd)}
.adm-main{flex:1;padding:20px;overflow-y:auto;min-height:100vh}
/* ── Shared components ── */
.adm-screen-hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}
.adm-screen-title{font-family:var(--hd);font-size:22px;font-weight:700;color:var(--tb);letter-spacing:1px}
.adm-screen-sub{font-size:10px;color:var(--gt);letter-spacing:1px;margin-top:3px}
.adm-card{background:var(--sf);border:1px solid var(--bd);border-radius:6px;padding:14px;margin-bottom:0}
.adm-card-title{font-family:var(--hd);font-size:13px;font-weight:700;color:var(--yw);letter-spacing:1px;text-transform:uppercase;margin-bottom:12px}
.adm-loading{color:var(--gt);font-size:11px;letter-spacing:1px;padding:40px;text-align:center}
.adm-loading-sm{color:var(--gt);font-size:11px;padding:10px 0}
.adm-error{color:var(--rd);font-size:11px;display:flex;align-items:center;gap:8px}
.adm-error-sm{color:var(--rd);font-size:11px;padding:4px 0}
.adm-btn{
  background:var(--gd);border:1px solid var(--gr);color:var(--gr);
  padding:7px 14px;cursor:pointer;font-family:var(--mo);font-size:10px;
  border-radius:3px;transition:all .15s;letter-spacing:1px;text-transform:uppercase
}
.adm-btn:hover:not(:disabled){filter:brightness(1.1)}
.adm-btn:disabled{opacity:.5;cursor:not-allowed}
.adm-btn.danger{background:rgba(255,69,96,.1);border-color:var(--rd);color:var(--rd)}
.adm-btn-sm{
  background:var(--sf2);border:1px solid var(--bd);color:var(--gt);
  padding:5px 10px;cursor:pointer;font-family:var(--mo);font-size:9px;
  border-radius:3px;transition:all .12s;letter-spacing:1px
}
.adm-btn-sm:hover{border-color:var(--gr);color:var(--gr)}
.adm-input{
  background:var(--sf2);border:1px solid var(--bd);color:var(--tb);
  padding:6px 10px;font-family:var(--mo);font-size:11px;border-radius:3px;
  outline:none;transition:border-color .12s
}
.adm-input:focus{border-color:var(--ac)}
.adm-tabs{display:flex;gap:4px}
.adm-tab{
  background:var(--sf2);border:1px solid var(--bd);color:var(--gt);
  padding:5px 12px;cursor:pointer;font-family:var(--mo);font-size:10px;
  border-radius:3px;letter-spacing:1px;transition:all .12s
}
.adm-tab.on{background:var(--gd);border-color:var(--gr);color:var(--gr)}
/* ── Table ── */
.adm-table{width:100%;border-collapse:collapse;font-size:11px}
.adm-table th{
  text-align:left;padding:8px 12px;font-size:9px;color:var(--gt);
  letter-spacing:1.5px;text-transform:uppercase;border-bottom:1px solid var(--bd);
  background:var(--sf2);font-weight:400
}
.adm-table td{padding:8px 12px;border-bottom:1px solid var(--bd);color:var(--tx)}
.adm-table tr:last-child td{border-bottom:none}
.adm-table tr:hover td{background:rgba(255,255,255,.02)}
/* ── Words ── */
.adm-today-word{
  display:flex;flex-direction:column;gap:4px;padding:10px;
  background:var(--sf2);border:1px solid var(--yd);border-left:3px solid var(--yw);
  border-radius:3px;margin-bottom:12px
}
.adm-word-grid{
  display:flex;flex-wrap:wrap;gap:5px;max-height:280px;overflow-y:auto;
  padding-right:2px
}
.adm-word-chip{
  padding:3px 8px;background:var(--sf2);border:1px solid var(--bd);
  border-radius:3px;font-size:10px;color:var(--gt);font-family:var(--mo);
  letter-spacing:1px;transition:border-color .1s
}
.adm-word-chip.today{background:var(--yd);border-color:var(--yw);color:var(--yw)}
/* ── Result banners ── */
.adm-result-ok{margin-top:10px;padding:8px 11px;background:var(--gd);border:1px solid var(--gr);color:var(--gr);border-radius:3px;font-size:10px;word-break:break-all}
.adm-result-err{margin-top:10px;padding:8px 11px;background:rgba(255,69,96,.08);border:1px solid var(--rd);color:var(--rd);border-radius:3px;font-size:10px}
/* ── Login ── */
.adm-login{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg)}
.adm-login-box{width:360px;background:var(--sf);border:1px solid var(--bd);border-radius:8px;padding:32px}
.adm-login-logo{text-align:center;margin-bottom:24px}
.adm-scan-line{position:fixed;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,230,118,.008) 2px,rgba(0,230,118,.008) 4px);pointer-events:none;z-index:9999}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:var(--bg)}::-webkit-scrollbar-thumb{background:var(--bd);border-radius:2px}
select option{background:var(--sf2);color:var(--tb)}
textarea.adm-input{padding:8px 10px;line-height:1.6}
`;

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "words",     label: "Words",     icon: "📝" },
  { id: "players",   label: "Players",   icon: "👥" },
  { id: "wordlist",  label: "Word Lists", icon: "📝" },
  { id: "abtest",    label: "Experiments", icon: "🧪" },
  { id: "tools",     label: "Tools",     icon: "🔧" },
];

// ─── Login Screen ─────────────────────────────────────────────
function LoginScreen({ login, isLoggingIn, loginError }) {
  const [secret, setSecret] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    login(secret);
  }

  return (
    <div className="adm-login">
      <div className="adm-scan-line" />
      <div className="adm-login-box">
        <div className="adm-login-logo">
          <div style={{ fontFamily: "var(--hd)", fontSize: 24, fontWeight: 700, color: "var(--gr)", letterSpacing: 2 }}>
            ⚡ CRYPTOPLAY
          </div>
          <div style={{ fontSize: 9, color: "var(--gt)", letterSpacing: 3, marginTop: 4 }}>ADMIN PANEL</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, color: "var(--gt)", letterSpacing: 1.5, marginBottom: 6, textTransform: "uppercase" }}>
              Admin Secret
            </div>
            <input
              type="password"
              className="adm-input"
              style={{ width: "100%" }}
              placeholder="Enter ADMIN_SECRET…"
              value={secret}
              onChange={e => setSecret(e.target.value)}
              autoFocus
            />
          </div>

          {loginError && (
            <div style={{ color: "var(--rd)", fontSize: 11 }}>⚠️ {loginError}</div>
          )}

          <button
            className="adm-btn"
            type="submit"
            style={{ width: "100%", padding: "10px" }}
            disabled={isLoggingIn || !secret}
          >
            {isLoggingIn ? "⏳ Authenticating..." : "⚡ Enter Admin Panel"}
          </button>
        </form>

        <div style={{ marginTop: 16, fontSize: 10, color: "var(--gt)", textAlign: "center" }}>
          JWT session · 8 hour expiry
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("dashboard");
  const { isAuthed, isLoggingIn, loginError, login, logout } = useAdmin();

  const SCREENS = {
    dashboard: <DashboardScreen />,
    words:     <WordsScreen />,
    players:   <PlayersScreen />,
    wordlist:  <WordListScreen />,
    abtest:    <ABTestScreen />,
    tools:     <ToolsScreen />,
  };

  if (!isAuthed) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <LoginScreen login={login} isLoggingIn={isLoggingIn} loginError={loginError} />
      </>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="adm-scan-line" />
      <div className="adm-shell">

        {/* Sidebar */}
        <div className="adm-sidebar">
          <div className="adm-sidebar-logo">
            <div className="adm-logo-title">⚡ CRYPTOPLAY</div>
            <div className="adm-logo-sub">Admin Panel</div>
          </div>

          <nav className="adm-nav">
            {NAV.map(n => (
              <div
                key={n.id}
                className={`adm-nav-item${screen === n.id ? " on" : ""}`}
                onClick={() => setScreen(n.id)}
              >
                <span className="adm-nav-icon">{n.icon}</span>
                {n.label}
              </div>
            ))}
          </nav>

          <div className="adm-sidebar-footer">
            <button
              className="adm-btn-sm"
              onClick={logout}
              style={{ width: "100%", textAlign: "center", color: "var(--rd)", borderColor: "var(--rd)" }}
            >
              🔌 Logout
            </button>
          </div>
        </div>

        {/* Main content */}
        <main className="adm-main">
          {SCREENS[screen]}
        </main>

      </div>
    </>
  );
}
