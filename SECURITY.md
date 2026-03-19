# Security Notes

## Known Considerations

### Private Key (BADGE_SIGNER_PRIVATE_KEY)
The badge mint signer private key is loaded from environment variables. If unset, badge minting
is disabled gracefully. Before mainnet:
- Store the key in a secrets manager (AWS KMS, HashiCorp Vault, etc.)
- Implement key rotation if the key is ever exposed
- Monitor badge_vouchers for unusual minting activity

### Wallet Auth — localStorage Signature Storage
The frontend stores wallet signatures in localStorage for session persistence. In the Farcaster
Mini App context (sandboxed iframe inside Warpcast), XSS attack surface is significantly reduced.
However, for a standalone web deployment, consider:
- Short-lived signatures (server-issued session tokens exchanged for the sig)
- httpOnly cookie strategy for non-Farcaster web contexts

### JWT Secret
JWT_SECRET must be set via environment variable. The server will return 500 rather than fall
back to an insecure default. Set a minimum 32-character random value in production.

### Smart Contract
The ERC-1155 badge contract has not undergone a professional security audit. Recommended before
mainnet deployment:
- OpenZeppelin Defender audit
- Slither + Mythril static analysis
- Consider an emergency pause mechanism (PausableUpgradeable)

### Word Salt
WORD_SALT determines all future daily words. It must never change once players have started
playing, as any change would break streak continuity and invalidate historical game records.
Store it in a secrets manager with explicit change management controls.
