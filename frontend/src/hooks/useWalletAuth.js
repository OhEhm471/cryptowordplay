import { useState, useEffect, useCallback } from "react";
import { useAccount, useConnect, useDisconnect, useSignMessage } from "wagmi";

// ============================================================
// useWalletAuth — Wallet connection + signature-based auth
// Also detects Farcaster frame context automatically
// ============================================================

const AUTH_MESSAGE = (address) =>
  `Crypto Wordplay Authentication\nAddress: ${address}`;

export function useWalletAuth() {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();

  const [isSigned, setIsSigned]     = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError]           = useState(null);
  const [farcasterCtx, setFarcasterCtx] = useState(null);

  // Detect Farcaster frame context on mount
  useEffect(() => {
    detectFarcaster();
    loadSavedAuth();
  }, []);

  // Auto-save address when wallet connects
  useEffect(() => {
    if (isConnected && address) {
      const saved = localStorage.getItem("cwp_wallet");
      if (saved === address.toLowerCase()) {
        setIsSigned(!!localStorage.getItem("cwp_sig"));
      } else {
        // New wallet connected — clear old sig
        localStorage.removeItem("cwp_sig");
        setIsSigned(false);
      }
    } else {
      setIsSigned(false);
    }
  }, [isConnected, address]);

  function loadSavedAuth() {
    const wallet = localStorage.getItem("cwp_wallet");
    const sig    = localStorage.getItem("cwp_sig");
    if (wallet && sig) setIsSigned(true);

    // Ensure anonymous session ID exists
    if (!localStorage.getItem("cwp_session_id")) {
      localStorage.setItem("cwp_session_id", `anon_${Math.random().toString(36).slice(2, 12)}`);
    }
  }

  async function detectFarcaster() {
    try {
      // Farcaster frame SDK detection
      const sdk = await import("@farcaster/frame-sdk").catch(() => null);
      if (!sdk) return;

      const ctx = await sdk.default.context;
      if (ctx?.user?.fid) {
        setFarcasterCtx(ctx);
        localStorage.setItem("cwp_fid", String(ctx.user.fid));
        if (ctx.user.username) {
          localStorage.setItem("cwp_username", ctx.user.username);
        }
        // Signal ready to Farcaster
        await sdk.default.actions.ready();
      }
    } catch {
      // Not in Farcaster frame — no-op
    }
  }

  const signIn = useCallback(async () => {
    if (!isConnected || !address) {
      setError("Connect wallet first");
      return;
    }
    setIsSigningIn(true);
    setError(null);
    try {
      const message = AUTH_MESSAGE(address);
      const sig = await signMessageAsync({ message });
      localStorage.setItem("cwp_wallet", address.toLowerCase());
      localStorage.setItem("cwp_sig", sig);
      setIsSigned(true);
    } catch (err) {
      setError(err.message || "Signature failed");
    } finally {
      setIsSigningIn(false);
    }
  }, [isConnected, address, signMessageAsync]);

  const signOut = useCallback(() => {
    localStorage.removeItem("cwp_wallet");
    localStorage.removeItem("cwp_sig");
    setIsSigned(false);
    disconnect();
  }, [disconnect]);

  const connectWallet = useCallback((connectorId) => {
    const connector = connectors.find((c) => c.id === connectorId) || connectors[0];
    if (connector) connect({ connector });
  }, [connect, connectors]);

  return {
    // Wallet state
    address,
    isConnected,
    chain,
    connectors,
    isConnecting,
    // Auth state
    isSigned,
    isSigningIn,
    isAuthenticated: isSigned || !!farcasterCtx,
    error,
    // Farcaster
    farcasterCtx,
    isFarcasterFrame: !!farcasterCtx,
    farcasterUser: farcasterCtx?.user || null,
    // Actions
    connectWallet,
    signIn,
    signOut,
    // Display identity
    displayName: farcasterCtx?.user?.username
      || localStorage.getItem("cwp_username")
      || (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : null),
  };
}
