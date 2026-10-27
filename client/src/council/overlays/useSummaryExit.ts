import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useCouncilSettings } from "@/settings/councilSettings";
import { useRouting } from "@/navigation";
import { useErrorStore } from "@main/overlay/errorStore";
import { useButton } from "@/museum/button/useButton";
import { useButtonBanner } from "@/museum/button/useButtonBanner";
import { SUMMARY_RETURN_TO_ROOT_MS, useAutoplayStore } from "@/autoplay/autoplayStore";

/**
 * How a meeting's last page — the summary, or the credits — is left at an installation: the
 * talk button starts a new meeting (with its banner saying so), and once the reading or the
 * credits have finished the app returns to the landing page by itself where it does that.
 */
export function useSummaryExit(buttonRestarts: boolean): void {
  const connectionError = useErrorStore((s) => s.connectionError);
  const navigate = useNavigate();
  const { rootPath } = useRouting();
  const { capabilities } = useCouncilSettings();
  const autoplayPhase = useAutoplayStore((state) => state.phase);
  const summaryProtocolFinished = useAutoplayStore((state) => state.summaryProtocolFinished);
  const button = useButton("summary");
  const prevPressedRef = useRef(false);

  useEffect(() => {
    if (!buttonRestarts) {
      return;
    }
    button.claim();
    return () => button.release();
  }, [buttonRestarts, button.claim, button.release]);

  useEffect(() => {
    if (!buttonRestarts) {
      return;
    }
    button.setArmed(true);
  }, [buttonRestarts, button.setArmed]);

  useButtonBanner({
    owner: "summary",
    sessionActive: buttonRestarts,
    micOpen: false,
    isConnecting: false,
    bannerImmediate: true,
    messageKey: "summary.banner.pressToRestart",
  });

  useEffect(() => {
    if (!buttonRestarts) {
      return;
    }

    const pressed = button.pressed;
    const wasPressed = prevPressedRef.current;
    prevPressedRef.current = pressed;

    if (pressed && !wasPressed) {
      navigate(rootPath);
    }
  }, [button.pressed, buttonRestarts, navigate, rootPath]);

  useEffect(() => {
    if (!capabilities.autoReturnToLanding || autoplayPhase === "active") {
      return;
    }
    if (connectionError) {
      return;
    }
    if (!summaryProtocolFinished) {
      return;
    }

    const timerId = window.setTimeout(() => {
      navigate(rootPath);
    }, SUMMARY_RETURN_TO_ROOT_MS);

    return () => window.clearTimeout(timerId);
  }, [
    autoplayPhase,
    capabilities.autoReturnToLanding,
    connectionError,
    navigate,
    rootPath,
    summaryProtocolFinished,
  ]);
}
