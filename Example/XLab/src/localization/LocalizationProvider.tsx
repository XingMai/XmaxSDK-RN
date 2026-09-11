import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import {
  resolveLocale,
  systemLocale,
  translate,
  type XLabLanguage,
  type XLabLocale,
} from './Localization';
import type { MessageKey } from './messages';

/** React copy access for XLab; the configuration store owns preference persistence. */
const LocalizationContext = createContext<{
  locale: XLabLocale;
  t: (
    key: MessageKey,
    parameters?: Readonly<Record<string, string | number>>,
  ) => string;
} | null>(null);

/** Refreshes system-following copy on foregrounding without remounting navigation or inputs. */
export function LocalizationProvider({
  language,
  children,
}: {
  language: XLabLanguage;
  children: ReactNode;
}) {
  const [deviceLocale, setDeviceLocale] = useState(systemLocale);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') setDeviceLocale(systemLocale());
    });

    return () => subscription.remove();
  }, []);

  const locale = resolveLocale(language, deviceLocale);
  const value = useMemo(
    () => ({
      locale,
      t: (
        key: MessageKey,
        parameters?: Readonly<Record<string, string | number>>,
      ) => translate(locale, key, parameters),
    }),
    [locale],
  );

  return (
    <LocalizationContext.Provider value={value}>
      {children}
    </LocalizationContext.Provider>
  );
}

/** Reads the current XLab interface language; must be inside the app provider. */
export function useLocalization() {
  const context = useContext(LocalizationContext);

  if (!context) throw new Error('XLab localization provider is missing');

  return context;
}
