import Completed from "./overlays/Completed";
import Summary from "./overlays/Summary";
import Name from "./overlays/Name";

import OverlayWrapper from './OverlayWrapper';
import { ConversationMessage, Character } from "@shared/ModelTypes";


interface CouncilOverlaysProps {
    activeOverlay: string;
    onContinue: () => void;
    onWrapItUp: () => void;
    proceedWithHumanName: (data: { humanName: string }) => void;
    canExtendMeeting: boolean;
    removeOverlay: () => void;
    summary?: ConversationMessage;
    meetingId?: string | number;
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
}: CouncilOverlaysProps) {

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
                if (summary) {
                    return (
                        <Summary
                            summary={summary}
                            meetingId={meetingId}
                        />
                    );
                } else {
                    return null;
                }
            default:
                return null; // No overlay content if no section is active
        }
    };

    return (
        <OverlayWrapper showX={true} removeOverlay={removeOverlay} isVisible={true}>
            {renderOverlayContent()}
        </OverlayWrapper>
    );
}

export default CouncilOverlays;
