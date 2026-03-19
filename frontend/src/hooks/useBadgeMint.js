import { useState, useCallback } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain } from "wagmi";
import { badgeApi } from "../lib/api";

// ============================================================
// useBadgeMint — Onchain badge minting hook
// Flow:
//   1. fetchStatus()     — load minted + claimable badges
//   2. mintBadge(id)     — request voucher → send tx → confirm
// ============================================================

// Minimal ABI for claimBadge function only
const BADGE_ABI = [
  {
    name:    "claimBadge",
    type:    "function",
    inputs:  [
      { name: "tokenId",      type: "uint256" },
      { name: "nonce",        type: "bytes32"  },
      { name: "achievementId",type: "string"   },
      { name: "signature",    type: "bytes"    },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
];

export function useBadgeMint() {
  const [status,    setStatus]    = useState(null);   // { minted[], claimable[], enabled }
  const [isLoading, setIsLoading] = useState(false);
  const [minting,   setMinting]   = useState(null);   // achievementId currently being minted
  const [error,     setError]     = useState(null);
  const [txHash,    setTxHash]    = useState(null);

  const chainId          = useChainId();
  const { switchChain }  = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  // Watch for tx confirmation
  const { isSuccess: txConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
    enabled: !!txHash,
  });

  // ── Load status ─────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await badgeApi.getStatus();
      setStatus(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Mint a badge ─────────────────────────────────────────────
  const mintBadge = useCallback(async (achievementId) => {
    setMinting(achievementId);
    setError(null);
    setTxHash(null);

    try {
      // 1. Request signed voucher from backend
      const { voucher } = await badgeApi.requestVoucher(achievementId);

      // 2. Switch chain if needed
      if (chainId !== voucher.chainId) {
        await switchChain({ chainId: voucher.chainId });
        // Brief pause for chain switch
        await new Promise(r => setTimeout(r, 500));
      }

      // 3. Call claimBadge on the contract
      const hash = await writeContractAsync({
        address:      voucher.contractAddress,
        abi:          BADGE_ABI,
        functionName: "claimBadge",
        args: [
          BigInt(voucher.tokenId),
          voucher.nonce,
          voucher.achievementId,
          voucher.signature,
        ],
      });

      setTxHash(hash);

      // 4. Confirm with backend (fire-and-forget, also handles auto-confirm on txConfirmed)
      badgeApi.confirmMint(achievementId, hash).catch(() => {});

      // 5. Refresh status
      setTimeout(fetchStatus, 3000);

      return { success: true, txHash: hash };

    } catch (err) {
      const msg = err?.shortMessage || err?.message || "Transaction failed";
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setMinting(null);
    }
  }, [chainId, switchChain, writeContractAsync, fetchStatus]);

  // Auto-confirm when tx lands
  const handleTxConfirmed = useCallback(async () => {
    if (txHash && minting) {
      await badgeApi.confirmMint(minting, txHash).catch(() => {});
      await fetchStatus();
    }
  }, [txHash, minting, fetchStatus]);

  // Derive set of minted achievement IDs for quick lookup
  const mintedIds   = new Set(status?.minted?.map(m => m.achievementId) || []);
  const claimableIds = new Set(status?.claimable?.map(c => c.achievementId) || []);

  return {
    status,
    isLoading,
    mintedIds,
    claimableIds,
    minting,       // achievementId currently being minted
    txHash,
    txConfirmed,
    error,
    enabled: status?.enabled ?? false,
    fetchStatus,
    mintBadge,
  };
}
