const { expect }  = require("chai");
const { ethers }  = require("hardhat");

// ============================================================
// CryptoWordplayBadges — Test Suite
// ============================================================

describe("CryptoWordplayBadges", function () {
  let contract, owner, signer, player, other;
  const TOTAL_BADGES = 24;

  async function deployFixture() {
    [owner, signer, player, other] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("CryptoWordplayBadges");
    contract = await factory.deploy(
      signer.address,
      "https://api.cryptowordplay.xyz/badges/metadata/",
      "https://api.cryptowordplay.xyz/badges/contract"
    );
    await contract.waitForDeployment();
    return { contract, owner, signer, player, other };
  }

  // Helper: generate a valid mint signature
  async function sign(playerAddr, tokenId, nonce) {
    const messageHash = ethers.solidityPackedKeccak256(
      ["address", "uint256", "bytes32"],
      [playerAddr, tokenId, nonce]
    );
    // ethers v6: signer.signMessage signs with eth_sign prefix
    return signer.signMessage(ethers.getBytes(messageHash));
  }

  function randomNonce() {
    return ethers.hexlify(ethers.randomBytes(32));
  }

  // ── Deployment ─────────────────────────────────────────────

  describe("Deployment", () => {
    it("sets the correct signer", async () => {
      const { contract, signer } = await deployFixture();
      expect(await contract.signer()).to.equal(signer.address);
    });

    it("sets TOTAL_BADGES to 24", async () => {
      const { contract } = await deployFixture();
      expect(await contract.TOTAL_BADGES()).to.equal(TOTAL_BADGES);
    });

    it("sets the correct owner", async () => {
      const { contract, owner } = await deployFixture();
      expect(await contract.owner()).to.equal(owner.address);
    });
  });

  // ── Minting ────────────────────────────────────────────────

  describe("claimBadge", () => {
    it("allows a player to claim a valid badge", async () => {
      const { contract, player } = await deployFixture();
      const tokenId = 0;
      const nonce   = randomNonce();
      const sig     = await sign(player.address, tokenId, nonce);

      await expect(
        contract.connect(player).claimBadge(tokenId, nonce, "first_blood", sig)
      ).to.emit(contract, "BadgeClaimed")
        .withArgs(player.address, tokenId, "first_blood");

      expect(await contract.balanceOf(player.address, tokenId)).to.equal(1);
    });

    it("marks badge as claimed after minting", async () => {
      const { contract, player } = await deployFixture();
      const tokenId = 1;
      const nonce   = randomNonce();
      const sig     = await sign(player.address, tokenId, nonce);
      await contract.connect(player).claimBadge(tokenId, nonce, "ten_wins", sig);
      expect(await contract.hasClaimed(player.address, tokenId)).to.be.true;
    });

    it("reverts on invalid signature (wrong signer)", async () => {
      const { contract, player, other } = await deployFixture();
      const tokenId = 0;
      const nonce   = randomNonce();
      // Sign with 'other' instead of 'signer'
      const badSig  = await other.signMessage(
        ethers.getBytes(ethers.solidityPackedKeccak256(
          ["address", "uint256", "bytes32"],
          [player.address, tokenId, nonce]
        ))
      );
      await expect(
        contract.connect(player).claimBadge(tokenId, nonce, "first_blood", badSig)
      ).to.be.revertedWithCustomError(contract, "InvalidSignature");
    });

    it("reverts on double-claim (AlreadyClaimed)", async () => {
      const { contract, player } = await deployFixture();
      const tokenId = 0;
      const nonce1  = randomNonce();
      const nonce2  = randomNonce();
      const sig1    = await sign(player.address, tokenId, nonce1);
      const sig2    = await sign(player.address, tokenId, nonce2);

      await contract.connect(player).claimBadge(tokenId, nonce1, "first_blood", sig1);
      await expect(
        contract.connect(player).claimBadge(tokenId, nonce2, "first_blood", sig2)
      ).to.be.revertedWithCustomError(contract, "AlreadyClaimed");
    });

    it("reverts on nonce reuse (NonceAlreadyUsed)", async () => {
      const { contract, player } = await deployFixture();
      const nonce = randomNonce();
      const sig0  = await sign(player.address, 0, nonce);
      await contract.connect(player).claimBadge(0, nonce, "first_blood", sig0);

      // Try to use the same nonce for a different badge
      const sig1 = await sign(player.address, 1, nonce);
      await expect(
        contract.connect(player).claimBadge(1, nonce, "ten_wins", sig1)
      ).to.be.revertedWithCustomError(contract, "NonceAlreadyUsed");
    });

    it("reverts on invalid tokenId (>= TOTAL_BADGES)", async () => {
      const { contract, player } = await deployFixture();
      const nonce = randomNonce();
      const sig   = await sign(player.address, TOTAL_BADGES, nonce);
      await expect(
        contract.connect(player).claimBadge(TOTAL_BADGES, nonce, "bad", sig)
      ).to.be.revertedWithCustomError(contract, "InvalidTokenId");
    });

    it("allows different players to claim the same badge", async () => {
      const { contract, player, other } = await deployFixture();
      const tokenId = 0;
      const nonce1  = randomNonce();
      const nonce2  = randomNonce();
      const sig1    = await sign(player.address, tokenId, nonce1);
      const sig2    = await sign(other.address,  tokenId, nonce2);

      await contract.connect(player).claimBadge(tokenId, nonce1, "first_blood", sig1);
      await contract.connect(other).claimBadge(tokenId, nonce2, "first_blood", sig2);

      expect(await contract.balanceOf(player.address, tokenId)).to.equal(1);
      expect(await contract.balanceOf(other.address,  tokenId)).to.equal(1);
    });
  });

  // ── Soulbound ──────────────────────────────────────────────

  describe("Soulbound transfers", () => {
    it("reverts on safeTransferFrom", async () => {
      const { contract, player, other } = await deployFixture();
      const nonce = randomNonce();
      const sig   = await sign(player.address, 0, nonce);
      await contract.connect(player).claimBadge(0, nonce, "first_blood", sig);

      await expect(
        contract.connect(player).safeTransferFrom(player.address, other.address, 0, 1, "0x")
      ).to.be.revertedWithCustomError(contract, "SoulboundToken");
    });

    it("reverts on safeBatchTransferFrom", async () => {
      const { contract, player, other } = await deployFixture();
      await expect(
        contract.connect(player).safeBatchTransferFrom(player.address, other.address, [0], [1], "0x")
      ).to.be.revertedWithCustomError(contract, "SoulboundToken");
    });
  });

  // ── View functions ─────────────────────────────────────────

  describe("getBadgesOf", () => {
    it("returns all claimed badge IDs for a player", async () => {
      const { contract, player } = await deployFixture();
      for (const tokenId of [0, 3, 7]) {
        const nonce = randomNonce();
        const sig   = await sign(player.address, tokenId, nonce);
        await contract.connect(player).claimBadge(tokenId, nonce, "any", sig);
      }
      const badges = await contract.getBadgesOf(player.address);
      expect(badges.map(b => Number(b))).to.deep.equal([0, 3, 7]);
    });
  });

  // ── Admin ──────────────────────────────────────────────────

  describe("Admin", () => {
    it("owner can airdrop a badge", async () => {
      const { contract, owner, other } = await deployFixture();
      await expect(
        contract.connect(owner).airdropBadge(other.address, 0)
      ).to.emit(contract, "BadgeClaimed").withArgs(other.address, 0, "airdrop");
      expect(await contract.balanceOf(other.address, 0)).to.equal(1);
    });

    it("non-owner cannot airdrop", async () => {
      const { contract, player, other } = await deployFixture();
      await expect(
        contract.connect(player).airdropBadge(other.address, 0)
      ).to.be.revertedWithCustomError(contract, "OwnableUnauthorizedAccount");
    });

    it("owner can update signer", async () => {
      const { contract, owner, other } = await deployFixture();
      await expect(
        contract.connect(owner).setSigner(other.address)
      ).to.emit(contract, "SignerUpdated");
      expect(await contract.signer()).to.equal(other.address);
    });
  });
});
