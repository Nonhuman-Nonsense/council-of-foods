import { Link } from "react-router";
import { useMobile, usePortrait } from "../../utils";
import { useTranslation } from 'react-i18next';
import React from 'react';

/**
 * About Overlay
 * 
 * Displays the project description ("What is this?").
 * Contains a link to switching to the "Contact" overlay via URL hash.
 */
function About() {

    const isMobile = useMobile();
    const isPortait = usePortrait();
    const { t } = useTranslation();

    const wrapper: React.CSSProperties = {
        width: isPortait ? "80vw" : "",
        maxWidth: isMobile ? "550px" : "450px",
    };

    return (
        <div style={wrapper}>
            <p style={{ whiteSpace: 'pre-wrap' }}>{t('aboutText.about')}</p>
            <p>{t('aboutText.link')}<br /><Link to={{ hash: "contact" } as any}>Nonhuman Nonsense</Link></p>
        </div>
    );
}

export default About;
