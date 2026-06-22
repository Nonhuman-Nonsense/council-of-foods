import { useEffect, useState } from "react";
import { fetchButtonBridgeHealth, type ButtonBridgeHealthState } from "./health";

export function useButtonBridgeHealth(enabled: boolean): ButtonBridgeHealthState {
  const [health, setHealth] = useState<ButtonBridgeHealthState>({ status: "checking" });

  useEffect(() => {
    if (!enabled) {
      setHealth({ status: "not_running" });
      return;
    }

    let cancelled = false;

    async function poll(): Promise<void> {
      const next = await fetchButtonBridgeHealth();
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
