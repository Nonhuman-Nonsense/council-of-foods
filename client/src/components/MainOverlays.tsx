import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router";

import OverlayWrapper from './OverlayWrapper';
import Overlay from "./Overlay";
import About from "./overlays/About";
import Contact from "./overlays/Contact";
import ResetWarning from "./overlays/ResetWarning";
import SelectTopic, { Topic } from "./settings/SelectTopic";
import { useTranslation } from "react-i18next";


interface MainOverlaysProps {
    topics: Topic[];
    topic: Partial<Topic>;
    onReset: (resetData?: { topic: string, custom: string }) => void;
    onCloseOverlay: () => void;
}

/**
 * MainOverlays Component
 * 
 * Manages the top-level application overlays that are triggered via URL hash.
 * Examples: #about, #contact, #settings, #reset.
 * 
 * @param {MainOverlaysProps} props
 */
function MainOverlays({ topics, topic, onReset, onCloseOverlay }: MainOverlaysProps) {

    const navigate = useNavigate();
    const location = useLocation();

    const { t } = useTranslation();

    // Reset the hash in certain conditions
    useEffect(() => {
        const hash = location.hash;
        if (hash) {
            if (!["#about", "#contact", "#reset", "#settings", '#warning'].includes(hash)) {
                removeOverlay();
            } else if (!location.pathname.substring(1).startsWith('meeting') && ["#settings"].includes(hash)) {
                removeOverlay();
            } else if (location.pathname.substring(1) === '' && ["#reset", '#warning'].includes(hash)) {
                removeOverlay();
            }
        }
    }, [location]);

    function removeOverlay() {
        navigate({ hash: "" });
        onCloseOverlay();
    }

    const showOverlay = (location.hash !== "");

    const renderOverlayContent = () => {
        switch (location.hash) {
            case "#about":
                // @ts-ignore
                return <About />;
            case "#contact":
                // @ts-ignore
                return <Contact />;
            case "#settings":
                return (
                    <SelectTopic
                        topics={topics}
                        currentTopic={topic as Topic} // Casting as it might be Partial but SelectTopic expects Topic or undefined? Actually SelectTopic props: topics, currentTopic, others.
                        onContinueForward={() => { }} // SelectTopic needs onContinueForward usually? Wait, let's check its props. 
                        // In SelectTopic.tsx: interface SelectTopicProps { topics: Topic[]; onContinueForward?: ...; currentTopic?: Topic; onReset?: ...; onCancel?: ... }
                        // So onContinueForward is optional if we provide onReset? 
                        onReset={onReset}
                        onCancel={removeOverlay}
                    />
                );
            case "#reset":
                return <ResetWarning
                    onReset={() => onReset()}
                    onCancel={removeOverlay}
                />;
            case "#warning":
                return <ResetWarning
                    message={t('reset.lang')}
                    onReset={() => onReset()}
                    onCancel={removeOverlay}
                />;
            default:
                return null; // No overlay content if no section is active
        }
    };

    return (
        <Overlay isActive={showOverlay}>
            {showOverlay &&
                <OverlayWrapper showX={true} removeOverlay={removeOverlay} isVisible={true}>
                    {renderOverlayContent()}
                </OverlayWrapper>
            }
        </Overlay>
    );
}

export default MainOverlays;
