import { useTranslation } from "react-i18next";

interface ResetWarningProps {
    message?: string;
    onReset: () => void;
    onCancel: () => void;
}

/**
 * ResetWarning Overlay
 * 
 * A confirmation dialog used when the user selects "Restart"
 * from the navigation menu or attempts a destructive action.
 * 
 * @param {ResetWarningProps} props
 */
function ResetWarning({ message, onReset, onCancel }: ResetWarningProps) {

    const { t } = useTranslation();

    return (
        <div>
            <h2>{t('reset.title')}</h2>
            <h4 style={{ maxWidth: "min(600px,80vw)", whiteSpace: 'pre-wrap' }}>
                {message ?? t('reset.default')}
            </h4>
            <div>
                <button
                    onClick={onReset}
                    style={{ marginRight: "9px" }}
                >{t('restart')}</button>
                <button
                    onClick={onCancel}
                    style={{ marginLeft: "9px" }}
                >{t('cancel')}</button>
            </div>
        </div>
    );
}

export default ResetWarning;
