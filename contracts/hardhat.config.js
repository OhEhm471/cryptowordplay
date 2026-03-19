require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "0x" + "0".repeat(64);
const BASESCAN_API_KEY     = process.env.BASESCAN_API_KEY     || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },

  networks: {
    // Local development
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545",
    },

    // Base Sepolia — testnet
    "base-sepolia": {
      url:      "https://sepolia.base.org",
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId:  84532,
      gasPrice: "auto",
    },

    // Base mainnet
    base: {
      url:      "https://mainnet.base.org",
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId:  8453,
      gasPrice: "auto",
    },
  },

  etherscan: {
    apiKey: {
      base:         BASESCAN_API_KEY,
      "base-sepolia": BASESCAN_API_KEY,
    },
    customChains: [
      {
        network:  "base",
        chainId:  8453,
        urls: {
          apiURL:     "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
      {
        network:  "base-sepolia",
        chainId:  84532,
        urls: {
          apiURL:     "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
    ],
  },

  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },
};
