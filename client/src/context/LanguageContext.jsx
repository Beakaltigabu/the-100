import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { translations } from '../i18n/translations';

const LanguageContext = createContext(null);
const STORAGE_KEY = 'the100_lang';

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'am' || saved === 'en') return saved;
    const browserLang = navigator.language || 'en';
    return browserLang.toLowerCase().startsWith('am') ? 'am' : 'en';
  });

  // Keep <html lang> in sync — including the initial stored preference.
  useEffect(() => {
    document.documentElement.lang = lang === 'am' ? 'am' : 'en';
  }, [lang]);

  const setLang = useCallback((next) => {
    setLangState(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next === 'am' ? 'am' : 'en';
  }, []);

  const t = useMemo(() => {
    const dict = translations[lang] || translations.en;
    return (key, vars) => {
      let str = dict[key] ?? translations.en[key] ?? key;
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          str = str.replaceAll(`{${k}}`, String(v));
        });
      }
      return str;
    };
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}