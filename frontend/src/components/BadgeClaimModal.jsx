import { useEffect } from "react";
import { useBadgeMint } from "../hooks/useBadgeMint";
import { useWalletAuth } from "../hooks/useWalletAuth";

// ─── Rarity config ────────────────────────────────────────────
const RARITY_STYLE = {
  legendary: { border: "#ffd60a", bg: "rgba(255,214,10,.08)",  label: "#ffd60a" },
  epic:      { border: "#7b61ff", bg: "rgba(123,97,255,.08)", label: "#7b61ff" },
  rare:      { border: "#00e5ff", bg: "rgba(0,229,255,.07)",  label: "#00e5ff" },
  uncommon:  { border: "#00e676", bg: "rgba(0,230,118,.07)",  label: "#00e676" },
  common:    { border: "#2a2a35", bg: "rgba(42,42,53,.5)",    label: "#666680" },
};

// ─── Explorers ────────────────────────────────────────────────
function explorerUrl(txHash, chainId) {
  const base = chainId === 8453
    ? "https://basescan.org/tx/"
    : "https://sepolia.basescan.org/tx/";
  return base + txHash;
}

export default function BadgeClaimModal({ onClose, achievements = [] }) {
  const { isConnected, isAuthenticated, isFarcasterFrame } = useWalletAuth();
  const {
    status, isLoading, mintedIds, claimableIds,
    minting, txHash, txConfirmed, error, enabled,
    fetchStatus, mintBadge,
  } = useBadgeMint();

  useEffect(() => {
    fetchStatus();
  }, []);

  // ── Wallet not connected ──────────────────────────────────────
  if (!isConnected && !isFarcasterFrame) {
    return (
      <div className="ov" onClick={onClose}>
        <div className="mdl" onClick={e => e.stopPropagation()}>
          <div className="mh">
            <span className="mt">🎖️ Onchain Badges</span>
            <button className="mc" onClick={onClose}>✕</button>
          </div>
          <div className="mb" style={{ textAlign: "center", padding: "32px 20px" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🔗</div>
            <div style={{ fontFamily: "var(--hd)", fontSize: 15, color: "var(--tb)", marginBottom: 8 }}>
              Connect Your Wallet
            </div>
            <div style={{ fontSize: 11, color: "var(--gt)", lineHeight: 1.6 }}>
              Connect a wallet to mint your earned achievements as soulbound NFTs on Base.
              No purchase needed — you just pay gas.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Badge minting not configured ─────────────────────────────
  if (!enabled && !isLoading) {
    return (
      <div className="ov" onClick={onClose}>
        <div className="mdl" onClick={e => e.stopPropagation()}>
          <div className="mh">
            <span className="mt">🎖️ Onchain Badges</span>
            <button className="mc" onClick={onClose}>✕</button>
          </div>
          <div className="mb" style={{ textAlign: "center", padding: "32px 20px" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
            <div style={{ fontFamily: "var(--hd)", fontSize: 14, color: "var(--yw)" }}>
              Badge Minting Coming Soon
            </div>
            <div style={{ fontSize: 11, color: "var(--gt)", marginTop: 8, lineHeight: 1.6 }}>
              Earn achievements now. The onchain contract is being deployed to Base.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Build badge list from achievements prop ───────────────────
  const badgeRows = achievements.map(a => {
    const isMinted   = mintedIds.has(a.id);
    const isClaimable = claimableIds.has(a.id) && a.unlocked;
    const isLocked   = !a.unlocked;
    const isMinting  = minting === a.id;

    const rs = RARITY_STYLE[a.rarity] || RARITY_STYLE.common;

    return { ...a, isMinted, isClaimable, isLocked, isMinting, rs };
  }).filter(a => a.isMinted || a.isClaimable || (a.unlocked && !a.isMinted));

  const claimableCount = badgeRows.filter(b => b.isClaimable).length;
  const mintedCount    = mintedIds.size;

  return (
    <div className="ov" onClick={onClose}>
      <div className="mdl" onClick={e => e.stopPropagation()} style={{ maxHeight: "88vh" }}>

        {/* Header */}
        <div className="mh">
          <span className="mt">🎖️ Onchain Badges</span>
          <button className="mc" onClick={onClose}>✕</button>
        </div>

        <div className="mb">

          {/* Tx confirmed banner */}
          {txConfirmed && txHash && (
            <div className="bdg-banner bdg-banner-ok">
              ✅ Badge minted onchain!{" "}
              <a
                href={explorerUrl(txHash, status?.chainId)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "inherit", textDecoration: "underline" }}
              >
                View on Basescan →
              </a>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="bdg-banner bdg-banner-err">
              ⚠️ {error}
            </div>
          )}

          {/* Stats bar */}
          <div className="bdg-stats">
            <div className="bdg-stat">
              <div className="bdg-stat-v" style={{ color: "var(--gr)" }}>{mintedCount}</div>
              <div className="bdg-stat-l">Minted</div>
            </div>
            <div className="bdg-stat">
              <div className="bdg-stat-v" style={{ color: "var(--yw)" }}>{claimableCount}</div>
              <div className="bdg-stat-l">Claimable</div>
            </div>
            <div className="bdg-stat">
              <div className="bdg-stat-v" style={{ color: "var(--gt)" }}>
                {status?.chainId === 8453 ? "Base" : "Base Sepolia"}
              </div>
              <div className="bdg-stat-l">Network</div>
            </div>
          </div>

          {/* Info note */}
          <div className="bdg-info">
            🔒 Badges are <strong>soulbound</strong> — they can't be transferred or sold.
            Each one proves you earned it through gameplay.
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="bdg-loading">⚡ Loading badge status...</div>
          )}

          {/* Badge list */}
          {!isLoading && badgeRows.length === 0 && (
            <div className="bdg-empty">
              No badges earned yet. Complete achievements to unlock them!
            </div>
          )}

          {!isLoading && badgeRows.map(badge => {
            const { rs } = badge;
            return (
              <div
                key={badge.id}
                className="bdg-row"
                style={{ borderColor: rs.border, background: rs.bg }}
              >
                {/* Left: emoji + info */}
                <div className="bdg-row-left">
                  <div className="bdg-emoji">{badge.emoji}</div>
                  <div>
                    <div className="bdg-name">{badge.name}</div>
                    <div className="bdg-rarity" style={{ color: rs.label }}>
                      {badge.rarity.toUpperCase()}
                    </div>
                    {badge.isMinted && badge.txHash && (
                      <a
                        href={explorerUrl(badge.txHash, status?.chainId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bdg-tx-link"
                      >
                        View on Basescan ↗
                      </a>
                    )}
                  </div>
                </div>

                {/* Right: action */}
                <div className="bdg-row-right">
                  {badge.isMinted && (
                    <div className="bdg-pill bdg-pill-minted">✓ Minted</div>
                  )}
                  {badge.isClaimable && !badge.isMinted && (
                    <button
                      className="bdg-claim-btn"
                      style={{ borderColor: rs.border, color: rs.label }}
                      onClick={() => mintBadge(badge.id)}
                      disabled={!!minting}
                    >
                      {badge.isMinting ? (
                        <span className="bdg-spinner">⏳</span>
                      ) : (
                        "⛓ Mint"
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Minted section - show previously minted with tx links */}
          {!isLoading && status?.minted?.length > 0 && (
            <div className="bdg-minted-section">
              <div className="bdg-section-title">Previously Minted</div>
              {status.minted.map(m => (
                <div key={m.achievementId} className="bdg-minted-row">
                  <span>Token #{m.tokenId} — {m.achievementId}</span>
                  {m.txHash && (
                    <a
                      href={explorerUrl(m.txHash, status.chainId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bdg-tx-link"
                    >
                      ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
