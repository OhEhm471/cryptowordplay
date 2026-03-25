import { useEffect } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "./lib/wagmi";
import Game from "./components/Game";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30000 },
  },
});

function FarcasterReady() {
  useEffect(() => {
    async function notifyReady() {
      try {
        const { sdk } = await import("@farcaster/frame-sdk");
        await sdk.actions.ready();
      } catch {
        // Not in Farcaster frame — ignore
      }
    }
    notifyReady();
  }, []);
  return null;
}

export default function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <FarcasterReady />
        <Game />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
