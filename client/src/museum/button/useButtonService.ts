import { useEffect } from "react";
import { buttonService } from "./buttonService";

export function useButtonService(): void {
  useEffect(() => {
    buttonService.start();
    return () => {
      buttonService.stop();
    };
  }, []);
}
