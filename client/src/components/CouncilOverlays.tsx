import Completed from "./overlays/Completed";
import Summary from "./overlays/Summary";
import Name from "./overlays/Name";

import OverlayWrapper from './OverlayWrapper';
import { Character } from "@shared/ModelTypes";
import { TopicSelection } from "./settings/SelectTopic";

export type CouncilOverlayType = "name" | "completed" | "summary" | null;

interface CouncilOverlaysProps {
  activeOverlay: CouncilOverlayType;
  onContinue: (data?: TopicSelection) => void;
  onWrapItUp: () => void;
  proceedWithHumanName: (data: { humanName: string }) => void;
  canExtendMeeting: boolean;
  removeOverlay: () => void;
  summary: any; // TODO: Strictly type Summary content
  meetingId: string;
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
      case "completed":
        return (
          <Completed
            onContinue={onContinue}
            onWrapItUp={onWrapItUp}
            canExtendMeeting={canExtendMeeting}
          />
        );
      case "summary":
        return (
          <Summary
            summary={summary}
            meetingId={meetingId}
          />
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
