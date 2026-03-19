import { useState, useRef, useEffect } from "react";
import { useWalletAuth } from "../hooks/useWalletAuth";

export default function WalletButton() {
  const {
    address, isConnected, isConnecting, isSigned, isSigningIn,
    farcasterUser, isFarcasterFrame, isAuthenticated,
    connectors, connectWallet, signIn, signOut, displayName, error,
  } = useWalletAuth();

  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  if (isFarcasterFrame) {
    return (
      <div className="wb-btn fc-frame">
        <div className="wb-dot" />
        {farcasterUser?.username ? `@${farcasterUser.username}` : `fid:${farcasterUser?.fid}`}
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="wb-wrap" ref={ref}>
        <button className="wb-btn" onClick={() => setOpen(o => !o)} disabled={isConnecting}>
          {isConnecting ? "Connecting..." : "⚡ Connect"}
        </button>
        {open && (
          <div className="wb-menu">
            <div className="wb-menu-label">Connect Wallet</div>
            <div className="wb-connector-list">
              {connectors.map(c => (
                <div key={c.id} className="wb-connector" onClick={() => { connectWallet(c.id); setOpen(false); }}>
                  🔗 {c.name}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="wb-wrap" ref={ref}>
      <button
        className={`wb-btn ${isSigned ? "connected" : ""}`}
        onClick={() => setOpen(o => !o)}
      >
        <div className="wb-dot" />
        {displayName || "Wallet"}
      </button>
      {open && (
        <div className="wb-menu">
          <div className="wb-menu-label">{displayName}</div>
          {!isSigned && (
            <div className="wb-menu-item" onClick={() => { signIn(); setOpen(false); }}>
              ✍️ {isSigningIn ? "Signing..." : "Sign in to save scores"}
            </div>
          )}
          {isSigned && (
            <div className="wb-menu-item" style={{ color: "var(--gr)", cursor: "default" }}>
              ✅ Scores saved onchain
            </div>
          )}
          <div className="wb-menu-item danger" onClick={() => { signOut(); setOpen(false); }}>
            🔌 Disconnect
          </div>
        </div>
      )}
    </div>
  );
}
