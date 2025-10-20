import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
// Optional
import Backend from 'i18next-http-backend';

i18n
  .use(Backend) // load translations from /public/locales
  .use(initReactI18next) // pass i18n to react-i18next
  .init({
    fallbackLng: 'en', // fallback language
    debug: true, // show logs

    interpolation: {
      escapeValue: false, // React already escapes
    },

    react: {
      useSuspense: false, // optionally turn off suspense
    },
  });

export default i18n;
