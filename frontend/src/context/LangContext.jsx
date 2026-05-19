import { createContext, useContext, useState, useCallback } from 'react';
import uz from '../i18n/uz';
import ru from '../i18n/ru';
import en from '../i18n/en';
import api from '../services/api';

const translations = { uz, ru, en };

const LangContext = createContext(null);

// Deep get: t('common.save') → translations[lang].common.save
function deepGet(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

export const LangProvider = ({ children }) => {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'uz');

  const changeLang = useCallback((l) => {
    setLang(l);
    localStorage.setItem('lang', l);
    // Send lang header with all future API requests
    api.defaults.headers.common['Accept-Language'] = l;
  }, []);

  // Set initial header
  api.defaults.headers.common['Accept-Language'] = lang;

  const t = useCallback((key) => {
    const val = deepGet(translations[lang], key);
    if (val === undefined) {
      // Fallback to uz
      return deepGet(translations.uz, key) ?? key;
    }
    return val;
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, changeLang, t }}>
      {children}
    </LangContext.Provider>
  );
};

export const useLang = () => {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used within LangProvider');
  return ctx;
};
