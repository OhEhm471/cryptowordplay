import { createConfig, http } from "wagmi";
import { base, baseSepolia, mainnet } from "wagmi/chains";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "";

export const wagmiConfig = createConfig({
  chains: [base, baseSepolia, mainnet],
  connectors: [
    injected(),
    coinbaseWallet({
      appName: "Crypto Wordplay",
      appLogoUrl: `${import.meta.env.VITE_APP_URL || ""}/icon.png`,
    }),
    ...(projectId
      ? [walletConnect({ projectId, metadata: { name: "Crypto Wordplay", description: "Daily crypto word puzzle on Farcaster", url: import.meta.env.VITE_APP_URL || "", icons: [] } })]
      : []),
  ],
  transports: {
    [base.id]:        http(),
    [baseSepolia.id]: http(),
    [mainnet.id]:     http(),
  },
});
