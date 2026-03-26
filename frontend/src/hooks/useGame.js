import { useState, useEffect, useCallback, useRef } from "react";
import { gameApi } from "../lib/api";

// ============================================================
// useGame — Complete game state machine connected to backend
// Falls back to localStorage when not authenticated
// ============================================================

const MAX_ATTEMPTS = 4;

// Client-side word engine for instant feedback (mirrors server)
function evaluateGuessClient(guess, target) {
  const result = Array(guess.length).fill("gray");
  const targetUsed = Array(target.length).fill(false);
  const guessUsed  = Array(guess.length).fill(false);
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === target[i]) { result[i]="green"; targetUsed[i]=guessUsed[i]=true; }
  }
  for (let i = 0; i < guess.length; i++) {
    if (guessUsed[i]) continue;
    for (let j = 0; j < target.length; j++) {
      if (!targetUsed[j] && guess[i]===target[j]) { result[i]="yellow"; targetUsed[j]=true; break; }
    }
  }
  return result;
}

export function useGame(wordLength) {
  const [guesses,     setGuesses]     = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [currentGuess, setCurrentGuess] = useState("");
  const [gameState,   setGameState]   = useState("playing"); // playing|win|loss
  const [targetWord,  setTargetWord]  = useState(null);
  const [score,       setScore]       = useState(0);
  const [scoreBreakdown, setScoreBreakdown] = useState(null);
  const [shareText,   setShareText]   = useState(null);
  const [castUrl,     setCastUrl]     = useState(null);
  const [stats,       setStats]       = useState(null);
  const [isLoading,   setIsLoading]   = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error,       setError]       = useState(null);
  const [shakeBoard,  setShakeBoard]  = useState(false);
  const [popIndex,    setPopIndex]    = useState(null);
  const [winRow,      setWinRow]      = useState(null);
  const [toast,       setToast]       = useState(null);
  const [newAchievements, setNewAchievements] = useState([]);
  const toastRef = useRef(null);

  const showToast = useCallback((msg, duration = 1800) => {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), duration);
  }, []);

  // Load session on mount and word length change
  useEffect(() => {
    loadSession();
  }, [wordLength]);

  async function loadSession() {
    setIsLoading(true);
    setCurrentGuess("");
    try {
      const data = await gameApi.getDailyChallenge(wordLength);
      if (data.session) {
        setGuesses(data.session.guesses || []);
        setEvaluations(data.session.evaluations || []);
        setGameState(data.session.state || "playing");
        setScore(data.session.score || 0);
        if (data.session.targetWord) setTargetWord(data.session.targetWord);
      } else {
        setGuesses([]);
        setEvaluations([]);
        setGameState("playing");
        setScore(0);
        setTargetWord(null);
      }
    } catch {
      // API unavailable — load from localStorage fallback
      loadFromLocalStorage();
    } finally {
      setIsLoading(false);
    }
  }

  function loadFromLocalStorage() {
    try {
      const key  = `cwp_${new Date().toISOString().split("T")[0]}_${wordLength}`;
      const sess = JSON.parse(localStorage.getItem(key) || "null");
      if (sess) {
        setGuesses(sess.g || []);
        setEvaluations(sess.e || []);
        setGameState(sess.gs || "playing");
        setScore(sess.sc || 0);
        if (sess.tw) setTargetWord(sess.tw);
      } else {
        setGuesses([]); setEvaluations([]); setGameState("playing"); setScore(0);
      }
    } catch { /* start fresh */ }
  }

  function saveToLocalStorage(g, e, gs, sc, tw) {
    const key = `cwp_${new Date().toISOString().split("T")[0]}_${wordLength}`;
    localStorage.setItem(key, JSON.stringify({ g, e, gs, sc, tw }));
  }

  const addLetter = useCallback((letter) => {
    if (gameState !== "playing" || isSubmitting) return;
    if (currentGuess.length >= wordLength) return;
    setCurrentGuess(prev => prev + letter);
    setPopIndex(currentGuess.length);
    setTimeout(() => setPopIndex(null), 140);
  }, [gameState, currentGuess, wordLength, isSubmitting]);

  const deleteLetter = useCallback(() => {
    if (gameState !== "playing") return;
    setCurrentGuess(prev => prev.slice(0, -1));
  }, [gameState]);

  const submitGuess = useCallback(async () => {
    if (gameState !== "playing" || isSubmitting) return;
    if (currentGuess.length !== wordLength) {
      showToast(`Need ${wordLength} letters`);
      setShakeBoard(true);
      setTimeout(() => setShakeBoard(false), 450);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await gameApi.submitGuess(currentGuess, wordLength);
      const newGuesses = [...guesses, currentGuess];
      const newEvals   = [...evaluations, result.evaluation];

      setGuesses(newGuesses);
      setEvaluations(newEvals);
      setCurrentGuess("");

      if (result.state === "win" || result.state === "loss") {
        setGameState(result.state);
        setTargetWord(result.targetWord);
        setScore(result.score);
        setScoreBreakdown(result.scoreBreakdown);
        setShareText(result.shareText);
        setCastUrl(result.castUrl);
        if (result.stats) setStats(result.stats);
        if (result.newAchievements?.length > 0) setNewAchievements(result.newAchievements);

        saveToLocalStorage(newGuesses, newEvals, result.state, result.score, result.targetWord);

        if (result.state === "win") {
          setWinRow(newGuesses.length - 1);
          setTimeout(() => setWinRow(null), 900);
          const msgs = ["WAGMI! 🚀", "Bullish! 🔥", "Based! 💎", "Close call! ✅"];
          setTimeout(() => showToast(msgs[newGuesses.length - 1] || "GG!", 2200), 300);
        } else {
          setTimeout(() => showToast(`Answer: ${result.targetWord}`, 3000), 300);
        }
      } else {
        saveToLocalStorage(newGuesses, newEvals, "playing", 0, null);
      }
    } catch (err) {
      if (err.status === 422) {
        showToast("Not in word list");
        setShakeBoard(true);
        setTimeout(() => setShakeBoard(false), 450);
      } else if (err.status === 409) {
        showToast("Round already complete");
      } else {
        // Fallback: client-side evaluation if API is down
        handleOfflineGuess();
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [gameState, isSubmitting, currentGuess, wordLength, guesses, evaluations]);

  function handleOfflineGuess() {
    // Client-side fallback — no server validation
    const OFFLINE_WORDS = { 3:["BTC","ETH","SOL"], 4:["HODL","DEFI","PUMP"], 5:["TOKEN","BLOCK","STAKE"], 6:["WALLET","BRIDGE","ORACLE"] };
    const list = OFFLINE_WORDS[wordLength] || OFFLINE_WORDS[5];
    const today = new Date().toISOString().split("T")[0];
    let hash = 0;
    for (const c of (today + wordLength)) { hash = ((hash<<5)-hash)+c.charCodeAt(0); hash|=0; }
    const tw = list[Math.abs(hash) % list.length];
    const ev = evaluateGuessClient(currentGuess, tw);
    const ng = [...guesses, currentGuess];
    const ne = [...evaluations, ev];
    const won  = currentGuess === tw;
    const lost = !won && ng.length >= MAX_ATTEMPTS;
    setGuesses(ng); setEvaluations(ne); setCurrentGuess("");
    if (won || lost) {
      const gs = won ? "win" : "loss";
      setGameState(gs); setTargetWord(tw);
      saveToLocalStorage(ng, ne, gs, 0, tw);
    }
  }

  const shareResult = useCallback(async () => {
  const text = shareText || `⚡ Crypto Wordplay — ${gameState === "win" ? `Solved ${guesses.length}/4` : "Failed 4/4"} cryptowordplay-app.vercel.app`;
  
  try {
    // Try Farcaster SDK first (inside Warpcast)
    const { sdk } = await import("@farcaster/frame-sdk");
    await sdk.actions.openUrl(
      `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}`
    );
  } catch {
    // Fallback: try castUrl, then clipboard
    if (castUrl) {
      window.open(castUrl, "_blank");
    } else {
      try {
        await navigator.clipboard.writeText(text);
        showToast("Copied to clipboard! 📋");
      } catch {
        showToast(text);
      }
    }
  }
  
  gameApi.trackShare(wordLength).catch(() => {});
}, [shareText, castUrl, gameState, guesses.length, wordLength]);
  // Keyboard letter state map
  const letterStates = {};
  evaluations.forEach((er, ri) => {
    er.forEach((s, ci) => {
      const l = guesses[ri]?.[ci];
      if (!l) return;
      const p = { green: 3, yellow: 2, gray: 1 };
      if (!letterStates[l] || p[s] > p[letterStates[l]]) letterStates[l] = s;
    });
  });

  return {
    // State
    guesses, evaluations, currentGuess, gameState,
    targetWord, score, scoreBreakdown, stats,
    shareText, castUrl,
    isLoading, isSubmitting, error,
    // UI state
    shakeBoard, popIndex, winRow, toast,
    letterStates,
    attemptsLeft: MAX_ATTEMPTS - guesses.length,
    newAchievements,
    // Actions
    addLetter, deleteLetter, submitGuess, shareResult, loadSession,
  };
}
