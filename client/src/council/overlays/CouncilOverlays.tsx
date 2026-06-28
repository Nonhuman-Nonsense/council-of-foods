import type { Character } from "@shared/ModelTypes";
import QueryExtension from "./QueryExtension";
import Incomplete from "./Incomplete";
import Summary, { SummaryData } from "./Summary";
import Name from "./Name";
import OverlayWrapper from "@main/overlay/OverlayWrapper";
import type { Topic } from "@shared/ModelTypes";

export type CouncilOverlayType = "name" | "query_extension" | "summary" | "incomplete" | null;

interface CouncilOverlaysProps {
  activeOverlay: CouncilOverlayType;
  onContinue: (data?: Topic) => void;
  onAttemptResume: () => void;
  onWrapItUp: () => void;
  proceedWithHumanName: (data: { humanName: string }) => void;
  cancelOverlay: () => void;
  summary: SummaryData | null;
  meetingId: number;
  participants: Character[];
}

/**
 * CouncilOverlays Component
 * 
 * Manages modal overlays specific to the active meeting flow.
 * Unlike MainOverlays (which are hash-based), these are controlled by internal meeting state.
 * 
 * Supported Overlays:
 * - `name`: Human Participant name input.
 * - `query_extension`: Soft cap — visitor may extend or wrap up.
 * - `summary`: Final protocol and PDF download.
 */
function CouncilOverlays({
  activeOverlay,
  onContinue,
  onAttemptResume,
  onWrapItUp,
  proceedWithHumanName,
  cancelOverlay,
  summary,
  meetingId,
  participants,
}: CouncilOverlaysProps): React.ReactElement {

  // Conditional rendering of overlay content based on activeOverlay state
  const renderOverlayContent = (): React.ReactElement | null => {
    switch (activeOverlay) {
      case "name":
        return (
          <Name participants={participants} onContinueForward={proceedWithHumanName} />
        );
      case "incomplete":
        return (
          <Incomplete
            onAttemptResume={onAttemptResume}
            onNevermind={cancelOverlay}
          />
        );
      case "query_extension":
        return (
          <QueryExtension
            onContinue={onContinue}
            onWrapItUp={onWrapItUp}
          />
        );
      case "summary":
        return (summary ?
          <Summary
            summary={summary}
            meetingId={meetingId}
          /> : null
        );
      default:
        return null; // No overlay content if no section is active
    }
  };

  return (
    <OverlayWrapper showX={true} cancelOverlay={cancelOverlay}>
      {renderOverlayContent()}
    </OverlayWrapper>
  );
}

export default CouncilOverlays;
