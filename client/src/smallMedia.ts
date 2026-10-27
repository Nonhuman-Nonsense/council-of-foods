import { useMobile } from "@/utils";
import { getCapabilities } from "@/settings/councilSettings";

/**
 * Whether to load the small media set (character videos, stage background): the mobile
 * breakpoint, unless this install always shows full resolution.
 */
export function useSmallMedia(): boolean {
  const isMobile = useMobile();
  return isMobile && !getCapabilities().fullResolutionMedia;
}
