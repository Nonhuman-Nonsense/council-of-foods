import type { Character } from "@shared/ModelTypes";
import QueryExtension from "./QueryExtension";
import Incomplete from "./Incomplete";
import Summary, { SummaryData } from "./Summary";
import Name from "./Name";
import OverlayWrapper from "@main/overlay/OverlayWrapper";
import { useCouncilSettings } from "@/settings/councilSettings";
import type { CouncilOverlayType } from "@council/hooks/useCouncilMachine";
import type { SummaryPlaybackState } from "@council/summaryScrollSync";

export type { CouncilOverlayType, OverlayCouncilState } from "@council/hooks/useCouncilMachine";

/** Non-null overlay passed when `CouncilOverlays` is mounted. */
export type ActiveCouncilOverlay = Exclude<CouncilOverlayType, null>;

interface CouncilOverlaysProps {
  overlay: ActiveCouncilOverlay;
  onAttemptResume: () => void;
  onExtendMeeting: () => void;
  onConcludeMeeting: () => void;
  proceedWithHumanName: (data: { humanName: string }) => void;
  onDismiss: () => void;
  summary: SummaryData | null;
  meetingId: number;
  participants: Character[];
  audioContext?: React.RefObject<AudioContext | null>;
  summaryPlayback?: SummaryPlaybackState;
}

/**
 * CouncilOverlays Component
 *
 * Modal overlays for the active meeting flow. Overlay council states use the same
 * names as `councilState`; visibility is resolved in `useCouncilMachine`.
 */
function CouncilOverlays({
  overlay,
  onAttemptResume,
  onExtendMeeting,
  onConcludeMeeting,
  proceedWithHumanName,
  onDismiss,
  summary,
  meetingId,
  participants,
  audioContext,
  summaryPlayback = null,
}: CouncilOverlaysProps): React.ReactElement {
  const { isMuseumMode } = useCouncilSettings();

  const renderOverlayContent = (): React.ReactElement | null => {
    switch (overlay) {
      case "name":
        return (
          <Name participants={participants} onContinueForward={proceedWithHumanName} />
        );
      case "meeting_incomplete":
        return (
          <Incomplete
            onAttemptResume={onAttemptResume}
            onNevermind={onDismiss}
          />
        );
      case "query_extension":
        return (
          <QueryExtension
            onExtendMeeting={onExtendMeeting}
            onConcludeMeeting={onConcludeMeeting}
          />
        );
      case "summary":
        return (summary ?
          <Summary
            summary={summary}
            meetingId={meetingId}
            audioContext={audioContext}
            summaryPlayback={summaryPlayback}
          /> : null
        );
      default:
        return null;
    }
  };

  // Summary in web mode fills the full main region height (scroll + download at
  // bottom). Museum summary breaks out with position:fixed anyway, so fillHeight
  // has no effect there but we keep the condition explicit.
  const fillHeight = overlay === "summary" && !isMuseumMode;

  return (
    <OverlayWrapper
      showX={!(overlay === "summary" && isMuseumMode)}
      cancelOverlay={onDismiss}
      fillHeight={fillHeight}
    >
      {renderOverlayContent()}
    </OverlayWrapper>
  );
}

export default CouncilOverlays;
