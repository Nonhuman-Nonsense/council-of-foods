import { useTranslation } from 'react-i18next';
import { useMobile } from '../../utils';
import Loading from '../Loading';

/**
 * Reconnecting Overlay
 * 
 * Displayed when the socket connection is lost.
 * Shows a loading spinner and a standardized error message.
 * Automatically disappears when connection is restored (handled by parent logic).
 */
function Reconnecting() {

    const isMobile = useMobile();
    const { t } = useTranslation();

    return (
        <div>
            <div style={{ position: "relative", display: "flex", justifyContent: "center", transform: "translateY(-50%)", height: `${(isMobile ? 100 : 150) / 2}px` }}>
                <Loading />
            </div>
            <h2>{t('error.connection')}</h2>
            <p>{t('error.reconnecting')}</p>
        </div>
    );
}

export default Reconnecting;
