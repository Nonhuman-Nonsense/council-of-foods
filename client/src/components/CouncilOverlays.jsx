import Completed from "./overlays/Completed";
import Summary from "./overlays/Summary";
import Name from "./overlays/Name";

import OverlayWrapper from './OverlayWrapper.jsx';

function CouncilOverlays({
  activeOverlay,
  onContinue,
  onWrapItUp,
  proceedWithHumanName,
  canExtendMeeting,
  removeOverlay,
  summary,
  meetingId,
}) {

  // Conditional rendering of overlay content based on activeOverlay state
  const renderOverlayContent = () => {
    switch (activeOverlay) {
      case "name":
        return (
          <Name onContinueForward={proceedWithHumanName} />
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
