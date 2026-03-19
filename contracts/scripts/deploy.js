const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// ============================================================
// DEPLOY — CryptoWordplayBadges
// Usage:
//   npx hardhat run scripts/deploy.js --network base-sepolia
//   npx hardhat run scripts/deploy.js --network base
// ============================================================

// Token metadata base URI — update after uploading metadata to IPFS / your API
const BASE_URI = process.env.BADGE_BASE_URI
  || "https://cryptowordplay.xyz/api/badges/metadata/";

// OpenSea collection metadata URI
const CONTRACT_URI = process.env.BADGE_CONTRACT_URI
  || "https://cryptowordplay.xyz/api/badges/contract";

// Signer address — the backend wallet that signs mint vouchers
// MUST match BADGE_SIGNER_ADDRESS in backend/.env
const SIGNER_ADDRESS = process.env.BADGE_SIGNER_ADDRESS;

async function main() {
  if (!SIGNER_ADDRESS) {
    throw new Error(
      "BADGE_SIGNER_ADDRESS env var required. " +
      "This must be the public address of your backend signing wallet."
    );
  }

  const [deployer] = await ethers.getSigners();
  const balance    = await ethers.provider.getBalance(deployer.address);

  console.log("\n⚡ Crypto Wordplay Badge Deployment");
  console.log("════════════════════════════════════");
  console.log(`Network:   ${network.name} (chainId: ${network.config.chainId})`);
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Balance:   ${ethers.formatEther(balance)} ETH`);
  console.log(`Signer:    ${SIGNER_ADDRESS}`);
  console.log(`Base URI:  ${BASE_URI}`);
  console.log("════════════════════════════════════\n");

  if (balance < ethers.parseEther("0.001")) {
    throw new Error("Insufficient ETH balance for deployment. Need at least 0.001 ETH.");
  }

  // Deploy
  const factory  = await ethers.getContractFactory("CryptoWordplayBadges");
  const contract = await factory.deploy(SIGNER_ADDRESS, BASE_URI, CONTRACT_URI);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`✅ CryptoWordplayBadges deployed to: ${address}`);

  // Verify signer is set correctly
  const onchainSigner = await contract.signer();
  console.log(`✅ Signer verified onchain: ${onchainSigner}`);
  console.log(`✅ Total badge types: ${await contract.TOTAL_BADGES()}`);

  // Write deployment info to file
  const deployInfo = {
    network:    network.name,
    chainId:    network.config.chainId,
    address,
    deployer:   deployer.address,
    signer:     SIGNER_ADDRESS,
    baseURI:    BASE_URI,
    deployedAt: new Date().toISOString(),
    txHash:     contract.deploymentTransaction()?.hash,
  };

  const outPath = path.join(__dirname, `../deployments/${network.name}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(deployInfo, null, 2));
  console.log(`\n📄 Deployment info saved to contracts/deployments/${network.name}.json`);

  // Print env vars to add
  console.log("\n📋 Add to backend/.env:");
  console.log(`BADGE_CONTRACT_ADDRESS=${address}`);
  console.log(`BADGE_CHAIN_ID=${network.config.chainId}`);

  console.log("\n📋 Add to frontend/.env.local:");
  console.log(`VITE_BADGE_CONTRACT_ADDRESS=${address}`);
  console.log(`VITE_BADGE_CHAIN_ID=${network.config.chainId}`);

  // Verify on Basescan (optional — requires BASESCAN_API_KEY)
  if (process.env.BASESCAN_API_KEY && network.name !== "hardhat" && network.name !== "localhost") {
    console.log("\n⏳ Waiting 15s for Basescan to index...");
    await new Promise(r => setTimeout(r, 15000));
    try {
      const { run } = require("hardhat");
      await run("verify:verify", {
        address,
        constructorArguments: [SIGNER_ADDRESS, BASE_URI, CONTRACT_URI],
      });
      console.log("✅ Contract verified on Basescan");
    } catch (err) {
      console.log("⚠️  Basescan verification failed (can retry manually):", err.message);
    }
  }
}

main().catch((err) => {
  console.error("\n❌ Deployment failed:", err.message);
  process.exit(1);
});
