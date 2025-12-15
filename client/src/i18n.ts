import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
// Optional
import Backend from 'i18next-http-backend';

/**
 * i18n Configuration
 * 
 * Sets up internationalization using i18next.
 * Loads translations from the static /public/locales folder via HTTP backend.
 */
i18n
    .use(Backend) // load translations from /public/locales
    .use(initReactI18next) // pass i18n to react-i18next
    .init({
        fallbackLng: 'en', // fallback language
        debug: (import.meta as any).env.DEV, // show logs
        interpolation: {
            escapeValue: false, // React already escapes
        }
    });

export default i18n;
