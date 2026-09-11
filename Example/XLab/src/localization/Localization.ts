import { english, simplifiedChinese, type MessageKey } from './messages';

/** Persisted UI preference; system follows the device locale. XLab uses the resolved locale to select its API environment. */
export type XLabLanguage = 'system' | 'zh-Hans' | 'en';

export type XLabLocale = Exclude<XLabLanguage, 'system'>;

/** Matches the supported Chinese locale family, falling back to English. */
export function resolveLocale(
  language: XLabLanguage,
  deviceLocale: string,
): XLabLocale {
  if (language !== 'system') return language;

  return /^zh(?:[-_]|$)/i.test(deviceLocale) ? 'zh-Hans' : 'en';
}

/** Reads the runtime's device locale; unavailable Intl data falls back to English. */
export function systemLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return 'en';
  }
}

/** Resolves a typed key and substitutes named parameters without changing SDK identifiers. */
export function translate(
  locale: XLabLocale,
  key: MessageKey,
  parameters: Readonly<Record<string, string | number>> = {},
): string {
  const catalog = locale === 'zh-Hans' ? simplifiedChinese : english;

  return catalog[key].replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    parameters[name] === undefined ? placeholder : String(parameters[name]),
  );
}
