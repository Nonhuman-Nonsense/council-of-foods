import type { Character } from "@shared/ModelTypes";
import Completed from "./overlays/Completed";
import Incomplete from "./overlays/Incomplete";
import Summary, { SummaryData } from "./overlays/Summary";
import Name from "./overlays/Name";
import OverlayWrapper from './OverlayWrapper';
import type { Topic } from "@shared/ModelTypes";

export type CouncilOverlayType = "name" | "completed" | "summary" | "incomplete" | null;

interface CouncilOverlaysProps {
  activeOverlay: CouncilOverlayType;
  onContinue: (data?: Topic) => void;
  onAttemptResume: () => void;
  onWrapItUp: () => void;
  proceedWithHumanName: (data: { humanName: string }) => void;
  canExtendMeeting: boolean;
  removeOverlay: () => void;
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
 * - `completed`: Meeting finished options.
 * - `summary`: Final protocol and PDF download.
 */
function CouncilOverlays({
  activeOverlay,
  onContinue,
  onAttemptResume,
  onWrapItUp,
  proceedWithHumanName,
  canExtendMeeting,
  removeOverlay,
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
            onNevermind={removeOverlay}
          />
        );
      case "completed":
        return (
          <Completed
            onContinue={onContinue}
            onWrapItUp={onWrapItUp}
            canExtendMeeting={canExtendMeeting}
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
    <OverlayWrapper showX={true} removeOverlay={removeOverlay}>
      {renderOverlayContent()}
    </OverlayWrapper>
  );
}

export default CouncilOverlays;
