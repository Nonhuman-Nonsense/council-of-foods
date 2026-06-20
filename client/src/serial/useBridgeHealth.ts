import { useEffect, useState } from "react";
import { fetchBridgeHealth, type BridgeHealthState } from "@/serial/bridgeHealth";

export function useBridgeHealth(enabled: boolean): BridgeHealthState {
  const [health, setHealth] = useState<BridgeHealthState>({ status: "checking" });

  useEffect(() => {
    if (!enabled) {
      setHealth({ status: "not_running" });
      return;
    }

    let cancelled = false;

    async function poll(): Promise<void> {
      const next = await fetchBridgeHealth();
      if (!cancelled) {
        setHealth(next);
      }
    }

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled]);

  return health;
}
