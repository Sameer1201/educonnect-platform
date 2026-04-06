import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface PlatformSettings {
  id: number;
  learningAccessEnabled: boolean;
  updatedAt: string;
}

export function usePlatformSettings(enabled = true) {
  return useQuery<PlatformSettings>({
    queryKey: ["platform-settings"],
    queryFn: async () => {
      const response = await fetch(`${BASE}/api/platform-settings`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load platform settings");
      return response.json();
    },
    enabled,
    staleTime: 30_000,
  });
}
