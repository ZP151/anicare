import { getLocales } from 'expo-localization';
import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';

import { Locale, MessageKey, translate } from './catalog';

interface LocaleValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
}

const LocaleContext = createContext<LocaleValue | null>(null);

function initialLocale(): Locale {
  return getLocales()[0]?.languageCode === 'zh' ? 'zh-CN' : 'en';
}

export function LocaleProvider({ children }: PropsWithChildren) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const value = useMemo<LocaleValue>(
    () => ({ locale, setLocale, t: (key) => translate(locale, key) }),
    [locale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useLocale must be used inside LocaleProvider');
  return value;
}

