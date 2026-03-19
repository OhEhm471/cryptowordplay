import { useState, useCallback } from "react";
import { leaderboardApi } from "../lib/api";

export function useLeaderboard() {
  const [dailyEntries,   setDailyEntries]   = useState([]);
  const [alltimeEntries, setAlltimeEntries] = useState([]);
  const [isLoading,      setIsLoading]      = useState(false);
  const [playerRank,     setPlayerRank]     = useState(null);
  const [activeTab,      setActiveTab]      = useState("daily");

  const fetchDaily = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await leaderboardApi.getDaily();
      setDailyEntries(data.entries || []);
      setPlayerRank(data.playerRank || null);
    } catch {
      // Fallback to mock data for demo
      setDailyEntries(MOCK_LEADERBOARD);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchAllTime = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await leaderboardApi.getAllTime();
      setAlltimeEntries(data.entries || []);
    } catch {
      setAlltimeEntries(MOCK_LEADERBOARD);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchTab = useCallback((tab) => {
    setActiveTab(tab);
    if (tab === "daily")   fetchDaily();
    if (tab === "alltime") fetchAllTime();
  }, [fetchDaily, fetchAllTime]);

  const open = useCallback(() => {
    fetchDaily();
  }, [fetchDaily]);

  const currentEntries = activeTab === "daily" ? dailyEntries : alltimeEntries;

  return { currentEntries, isLoading, playerRank, activeTab, fetchTab, open };
}

const MOCK_LEADERBOARD = [
  { username: "0xDeGen.eth", score: 1200, streak: 7,  rank: 1 },
  { username: "vitalik.eth", score: 1100, streak: 5,  rank: 2 },
  { username: "satoshi.base",score: 950,  streak: 3,  rank: 3 },
  { username: "wagmi_maxi",  score: 800,  streak: 2,  rank: 4 },
  { username: "ngmi_lol",    score: 650,  streak: 1,  rank: 5 },
  { username: "apegang.eth", score: 520,  streak: 0,  rank: 6 },
];
