import Completed from "./overlays/Completed";
import Summary from "./overlays/Summary";
import Name from "./overlays/Name";

import OverlayWrapper from './OverlayWrapper.jsx';

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
 * 
 * @param {Object} props
 * @param {string} props.activeOverlay - ID of the overlay to show.
 * @param {Function} props.onContinue - Extend meeting handler.
 * @param {Function} props.onWrapItUp - Generate summary handler.
 * @param {Function} props.proceedWithHumanName - Name submission handler.
 * @param {boolean} props.canExtendMeeting - Flag for completed view.
 * @param {Function} props.removeOverlay - Close handler.
 * @param {Object} props.summary - Summary text/markdown data.
 * @param {string} props.meetingId - Unique meeting identifier.
 * @param {Array} props.participants - List of participants for name validation.
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
}) {

  // Conditional rendering of overlay content based on activeOverlay state
  const renderOverlayContent = () => {
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
