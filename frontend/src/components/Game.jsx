import "../index.css";
import { useState, useEffect, useCallback } from "react";
import { useGame } from "../hooks/useGame";
import { useLeaderboard } from "../hooks/useLeaderboard";
import { useWalletAuth } from "../hooks/useWalletAuth";
import { playerApi } from "../lib/api";
import WalletButton from "./WalletButton";
import AchievementsModal from "./AchievementsModal";

// ============================================================
// KEYBOARD
// ============================================================
const KB_ROWS = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["ENTER","Z","X","C","V","B","N","M","⌫"],
];

// ============================================================
// STYLES
// ============================================================
// ============================================================
// GAME COMPONENT
// ============================================================
export default function Game() {
  const [wordLength, setWordLength] = useState(5);
  const [modal, setModal]           = useState(null); // null|leaderboard|faq|achievements
  const [newAchievements, setNewAchievements] = useState([]);
  const { displayName, isFarcasterFrame, isAuthenticated } = useWalletAuth();
  const game = useGame(wordLength);
  const lb   = useLeaderboard();

  const [playerStats, setPlayerStats] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cwp_pstats") || "null"); } catch { return null; }
  });

  // Fetch player stats from API
  useEffect(() => {
    playerApi.getMe()
      .then(data => {
        if (data.stats) {
          setPlayerStats(data.stats);
          localStorage.setItem("cwp_pstats", JSON.stringify(data.stats));
        }
      })
      .catch(() => {
        // Use game stats as fallback
      });
  }, [game.gameState]);

  // Watch for new achievements from game completion
  useEffect(() => {
    if (game.gameState === "win" || game.gameState === "loss") {
      if (game.newAchievements?.length > 0) {
        setNewAchievements(game.newAchievements);
        setTimeout(() => setModal("achievements"), 1200); // show after result panel
      }
    }
  }, [game.gameState]);

  // Keyboard input
  useEffect(() => {
    if (modal) return;
    const h = (e) => {
      if (e.key === "Enter") game.submitGuess();
      else if (e.key === "Backspace") game.deleteLetter();
      else if (/^[a-zA-Z]$/.test(e.key)) game.addLetter(e.key.toUpperCase());
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [modal, game.submitGuess, game.deleteLetter, game.addLetter]);

  const openLeaderboard = () => {
    lb.open();
    setModal("leaderboard");
  };

  const stats = playerStats || game.stats || { streak: 0, wins: 0, played: 0, bestScore: 0 };

  // Board rendering
  const MAX = 4;
  const rows = [];
  for (let r = 0; r < MAX; r++) {
    const isCur = r === game.guesses.length && game.gameState === "playing";
    const rg    = r < game.guesses.length ? game.guesses[r] : (isCur ? game.currentGuess : "");
    const re    = r < game.evaluations.length ? game.evaluations[r] : null;
    const isWin = game.winRow === r;
    const tiles = [];
    for (let c = 0; c < wordLength; c++) {
      const l  = rg[c] || "";
      const st = re ? re[c] : null;
      let cl = "tile"
        + (st ? ` ${st}` : "")
        + (l && !st ? " hl" : "")
        + (isCur ? " ar" : "")
        + (isCur && game.shakeBoard ? " shake" : "")
        + (isCur && game.popIndex === c ? " pop" : "")
        + (isWin ? " wb" : "");
      tiles.push(
        <div key={c} className={cl} style={isWin ? { animationDelay: `${c * .08}s` } : {}}>
          {l}
        </div>
      );
    }
    rows.push(<div key={r} className="brow">{tiles}</div>);
  }

  return (
    <>
      <div className="app">
        {game.toast && <div className="toast">{game.toast}</div>}

        {/* Header */}
        <div className="hdr">
          <div>
            <div className="logo">⚡ Crypto<span>Play</span></div>
            <div className="logosub">DAILY CRYPTO WORD CHALLENGE</div>
          </div>
          <div className="hdr-r">
            <WalletButton />
            <button className="ibtn" onClick={openLeaderboard}>🏆</button>
            <button className="ibtn" onClick={() => { setNewAchievements([]); setModal("achievements"); }}>🏅</button>
            <button className="ibtn" onClick={() => setModal("faq")}>?</button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="sbar">
          {[
            { v: stats.streak || stats.current_streak || 0, l: "🔥 Streak", fire: true },
            { v: stats.wins || stats.total_wins || 0,       l: "Wins" },
            { v: stats.played || stats.total_played || 0,   l: "Played" },
            { v: stats.bestScore || stats.best_score || 0,  l: "Best" },
          ].map((s, i) => (
            <div key={i} className="si">
              <div className={`sv${s.fire && (s.v > 0) ? " fire" : ""}`}>{s.v}</div>
              <div className="sl">{s.l}</div>
            </div>
          ))}
        </div>

        {/* Word length selector */}
        <div className="lsel">
          <span className="llb">Length:</span>
          {[3, 4, 5, 6].map(l => (
            <button
              key={l}
              className={`lbtn${wordLength === l ? " on" : ""}`}
              onClick={() => setWordLength(l)}
            >
              {l}L
            </button>
          ))}
        </div>

        {/* Game area */}
        <div className="ga">
          <div className="dbadge">
            📅 DAILY — {wordLength}-LETTER — {4 - game.guesses.length} ATTEMPTS LEFT
            {!isAuthenticated && <span style={{ marginLeft: "auto", color: "var(--gt)", fontSize: "8px" }}>CONNECT TO SAVE</span>}
          </div>

          {game.isLoading ? (
            <div className="load-screen">
              <div className="load-dot" />
              LOADING CHALLENGE...
            </div>
          ) : (
            <>
              <div className="board">{rows}</div>

              {/* Result panel */}
              {(game.gameState === "win" || game.gameState === "loss") && (
                <div className="rp">
                  <div className={`rt ${game.gameState}`}>
                    {game.gameState === "win" ? "🚀 WAGMI!" : "😔 REKT"}
                  </div>
                  <div className="rw">Answer: <strong>{game.targetWord}</strong></div>
                  <div className="rs">
                    <div>
                      <div className="sn">+{game.score}</div>
                      <div className="slb">Points</div>
                      {game.scoreBreakdown?.bonuses?.length > 0 && (
                        <div className="sb-list">
                          <div className="sb-row"><span>Base</span><span>{game.scoreBreakdown.base}</span></div>
                          {game.scoreBreakdown.bonuses.map((b, i) => (
                            <div key={i} className="sb-row"><span>{b.label}</span><span>+{b.value}</span></div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ marginLeft: "auto", textAlign: "right" }}>
                      <div style={{ fontFamily: "var(--hd)", fontSize: 14, color: "var(--yw)" }}>
                        🔥 {stats.streak || stats.current_streak || 1}
                      </div>
                      <div className="slb">Streak</div>
                    </div>
                  </div>
                  <div className="ract">
                    <button className="btn bs" onClick={game.shareResult}>📤 Share</button>
                    {game.castUrl && (
                      <button className="btn bfc" onClick={() => window.open(game.castUrl, "_blank")}>
                        🟣 Cast
                      </button>
                    )}
                    <button className="btn bl" onClick={openLeaderboard}>🏆 Ranks</button>
                  </div>
                </div>
              )}

              {/* Keyboard */}
              {game.gameState === "playing" && (
                <div className="kb">
                  {KB_ROWS.map((row, ri) => (
                    <div key={ri} className="kr">
                      {row.map(k => {
                        const isW = k === "ENTER" || k === "⌫";
                        const st  = game.letterStates[k] || "";
                        return (
                          <div
                            key={k}
                            className={`key${isW ? " wd" : ""}${st ? " " + st : ""}`}
                            onClick={() => {
                              if (k === "ENTER") game.submitGuess();
                              else if (k === "⌫") game.deleteLetter();
                              else game.addLetter(k);
                            }}
                          >
                            {k}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Leaderboard Modal */}
        {modal === "leaderboard" && (
          <div className="ov" onClick={() => setModal(null)}>
            <div className="mdl" onClick={e => e.stopPropagation()}>
              <div className="mh">
                <span className="mt">🏆 Leaderboard</span>
                <button className="mc" onClick={() => setModal(null)}>✕</button>
              </div>
              <div className="mb">
                <div className="ltr">
                  <div className={`lt${lb.activeTab === "daily" ? " on" : ""}`}
                    onClick={() => lb.fetchTab("daily")}>Daily</div>
                  <div className={`lt${lb.activeTab === "alltime" ? " on" : ""}`}
                    onClick={() => lb.fetchTab("alltime")}>All-Time</div>
                </div>
                {lb.isLoading ? (
                  <div className="lb-loading">⚡ Loading rankings...</div>
                ) : lb.currentEntries.length === 0 ? (
                  <div className="lem">No scores yet!<br />Be the first ⚡</div>
                ) : (
                  lb.currentEntries.slice(0, 20).map((e, i) => (
                    <div key={i} className="le">
                      <div className={`lrk${i===0?" g":i===1?" s":i===2?" b":""}`}>
                        {i < 3 ? ["🥇","🥈","🥉"][i] : `#${e.rank || i+1}`}
                      </div>
                      <div>
                        <div className="lnm">{e.username || e.name}</div>
                        {(e.streak || e.current_streak) > 0 && (
                          <div className="lsk">🔥 {e.streak || e.current_streak} streak</div>
                        )}
                      </div>
                      <div className="lsc">{e.score || e.total_score}</div>
                    </div>
                  ))
                )}
                {lb.playerRank && (
                  <div className="player-rank">Your rank: <strong>#{lb.playerRank}</strong></div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* FAQ Modal */}
        {modal === "faq" && (
          <div className="ov" onClick={() => setModal(null)}>
            <div className="mdl" onClick={e => e.stopPropagation()}>
              <div className="mh">
                <span className="mt">⚡ How to Play</span>
                <button className="mc" onClick={() => setModal(null)}>✕</button>
              </div>
              <div className="mb">
                <div className="leg">
                  <div className="li"><div className="ld green" /><span>Correct spot</span></div>
                  <div className="li"><div className="ld yellow" /><span>Wrong spot</span></div>
                  <div className="li"><div className="ld gray" /><span>Not in word</span></div>
                </div>
                {[
                  ["What is Crypto Wordplay?","A daily crypto-native word puzzle. Guess the hidden crypto term in 4 attempts or less. New word every day, synced globally for all players!"],
                  ["How does scoring work?","1 attempt = 1000pts (+500 bonus) · 2 = 800pts · 3 = 600pts · 4 = 400pts · Loss = 10pts. Streaks add +100 (3+ days) or +200 (7+ days)!"],
                  ["What do the colors mean?","🟩 GREEN = correct letter, correct position\n🟨 YELLOW = letter exists, wrong position\n⬛ GRAY = letter not in the word"],
                  ["How many attempts do I get?","Exactly 4 attempts per round. Fail all 4 and the correct answer is revealed immediately."],
                  ["What word lengths are supported?","3, 4, 5, and 6-letter crypto words. Each length has its own daily challenge!"],
                  ["Do I need a wallet or crypto?","No! Core gameplay is 100% free. Connect a wallet or use Farcaster to save scores to the global leaderboard."],
                  ["How does the leaderboard work?","Connect wallet or use Farcaster to save scores. Rankings update after every completed game. Daily and all-time boards available."],
                  ["What is the daily streak?","Complete a challenge each day to grow your streak. Missing a day resets it. Streaks unlock score bonuses!"],
                ].map(([q, a], i, arr) => (
                  <div key={i} className="fi" style={i===arr.length-1?{borderBottom:"none"}:{}}>
                    <div className="fq">{q}</div>
                    <div className="fa">{a.split("\n").map((l, j) => <span key={j}>{l}{j < a.split("\n").length-1 && <br />}</span>)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Achievements Modal */}
        {modal === "achievements" && (
          <AchievementsModal
            onClose={() => setModal(null)}
            newAchievements={newAchievements}
          />
        )}
      </div>
    </>
  );
}
