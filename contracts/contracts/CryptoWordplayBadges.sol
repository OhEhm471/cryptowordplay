// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title  CryptoWordplayBadges
 * @notice Soulbound ERC-1155 achievement badges for Crypto Wordplay.
 *         Each token ID corresponds to one achievement (0–23).
 *         Minting is controlled via ECDSA signatures from the backend signer.
 *         Tokens are non-transferable (soulbound) after minting.
 *
 * Mint flow:
 *   1. Player earns an achievement in-game
 *   2. Player requests a mint voucher from the backend API
 *   3. Backend signs: keccak256(abi.encodePacked(wallet, tokenId, nonce))
 *   4. Player calls claimBadge(tokenId, nonce, signature) — pays their own gas
 *   5. Contract verifies signature, checks nonce not used, mints 1 token
 */
contract CryptoWordplayBadges is ERC1155, Ownable {
    using ECDSA for bytes32;
    using Strings for uint256;

    // ─── State ────────────────────────────────────────────────

    /// @notice Address whose private key signs mint vouchers (backend wallet)
    address public signer;

    /// @notice Base URI for token metadata (e.g. ipfs://CID/ or https://api.cryptowordplay.xyz/badges/)
    string  public baseURI;

    /// @notice Contract-level metadata URI (OpenSea collection info)
    string  public contractURI;

    /// @notice Total number of achievement types
    uint256 public constant TOTAL_BADGES = 24;

    /// @notice Tracks used nonces per address to prevent replay attacks
    mapping(address => mapping(bytes32 => bool)) public usedNonces;

    /// @notice Tracks which badges each address has claimed
    mapping(address => mapping(uint256 => bool)) public hasClaimed;

    // ─── Events ───────────────────────────────────────────────

    event BadgeClaimed(address indexed player, uint256 indexed tokenId, string achievementId);
    event SignerUpdated(address indexed oldSigner, address indexed newSigner);
    event BaseURIUpdated(string newBaseURI);

    // ─── Errors ───────────────────────────────────────────────

    error InvalidSignature();
    error NonceAlreadyUsed();
    error AlreadyClaimed();
    error InvalidTokenId();
    error SoulboundToken();

    // ─── Constructor ──────────────────────────────────────────

    constructor(
        address _signer,
        string memory _baseURI,
        string memory _contractURI
    ) ERC1155(_baseURI) Ownable(msg.sender) {
        require(_signer != address(0), "Zero signer address");
        signer      = _signer;
        baseURI     = _baseURI;
        contractURI = _contractURI;
    }

    // ─── Minting ──────────────────────────────────────────────

    /**
     * @notice Claim an achievement badge.
     * @param tokenId      Achievement token ID (0 to TOTAL_BADGES-1)
     * @param nonce        Unique bytes32 nonce from the backend (prevents replay)
     * @param achievementId Human-readable achievement ID string (emitted in event)
     * @param signature    ECDSA signature from the backend signer
     */
    function claimBadge(
        uint256 tokenId,
        bytes32 nonce,
        string calldata achievementId,
        bytes calldata signature
    ) external {
        if (tokenId >= TOTAL_BADGES)            revert InvalidTokenId();
        if (hasClaimed[msg.sender][tokenId])    revert AlreadyClaimed();
        if (usedNonces[msg.sender][nonce])      revert NonceAlreadyUsed();

        // Verify signature: signer must have signed (player, tokenId, nonce)
        bytes32 messageHash = keccak256(
            abi.encodePacked(msg.sender, tokenId, nonce)
        );
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(messageHash);
        address recovered = ethSignedHash.recover(signature);

        if (recovered != signer) revert InvalidSignature();

        // Mark nonce used and badge claimed before mint (checks-effects-interactions)
        usedNonces[msg.sender][nonce]      = true;
        hasClaimed[msg.sender][tokenId]    = true;

        _mint(msg.sender, tokenId, 1, "");

        emit BadgeClaimed(msg.sender, tokenId, achievementId);
    }

    /**
     * @notice Owner can airdrop badges (for early users, corrections, etc.)
     */
    function airdropBadge(address to, uint256 tokenId) external onlyOwner {
        if (tokenId >= TOTAL_BADGES) revert InvalidTokenId();
        hasClaimed[to][tokenId] = true;
        _mint(to, tokenId, 1, "");
        emit BadgeClaimed(to, tokenId, "airdrop");
    }

    // ─── Soulbound ────────────────────────────────────────────

    /**
     * @dev Override transfer functions to make tokens soulbound.
     *      Only minting (from == address(0)) is allowed.
     */
    function safeTransferFrom(
        address,
        address,
        uint256,
        uint256,
        bytes memory
    ) public pure override {
        revert SoulboundToken();
    }

    function safeBatchTransferFrom(
        address,
        address,
        uint256[] memory,
        uint256[] memory,
        bytes memory
    ) public pure override {
        revert SoulboundToken();
    }

    // ─── Metadata ─────────────────────────────────────────────

    /**
     * @notice Returns token metadata URI.
     *         e.g. https://api.cryptowordplay.xyz/badges/metadata/0
     */
    function uri(uint256 tokenId) public view override returns (string memory) {
        if (tokenId >= TOTAL_BADGES) revert InvalidTokenId();
        return string(abi.encodePacked(baseURI, tokenId.toString()));
    }

    // ─── View helpers ─────────────────────────────────────────

    /**
     * @notice Returns all badge token IDs claimed by an address
     */
    function getBadgesOf(address player) external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < TOTAL_BADGES; i++) {
            if (hasClaimed[player][i]) count++;
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < TOTAL_BADGES; i++) {
            if (hasClaimed[player][i]) result[idx++] = i;
        }
        return result;
    }

    /**
     * @notice Returns which badges a player can claim (earned but not yet minted)
     */
    function getClaimableBadges(
        address player,
        bool[] calldata earnedFlags
    ) external view returns (uint256[] memory) {
        require(earnedFlags.length == TOTAL_BADGES, "Wrong flags length");
        uint256 count = 0;
        for (uint256 i = 0; i < TOTAL_BADGES; i++) {
            if (earnedFlags[i] && !hasClaimed[player][i]) count++;
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < TOTAL_BADGES; i++) {
            if (earnedFlags[i] && !hasClaimed[player][i]) result[idx++] = i;
        }
        return result;
    }

    // ─── Admin ────────────────────────────────────────────────

    function setSigner(address _signer) external onlyOwner {
        require(_signer != address(0), "Zero address");
        emit SignerUpdated(signer, _signer);
        signer = _signer;
    }

    function setBaseURI(string calldata _baseURI) external onlyOwner {
        baseURI = _baseURI;
        emit BaseURIUpdated(_baseURI);
    }

    function setContractURI(string calldata _contractURI) external onlyOwner {
        contractURI = _contractURI;
    }

    // ─── ERC165 ───────────────────────────────────────────────

    function supportsInterface(bytes4 interfaceId)
        public view override returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
