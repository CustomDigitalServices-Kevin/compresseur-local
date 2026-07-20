import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { detectLocale, messages, persistLocale } from "./messages";
import type { Locale, MessageKey } from "./messages";
import { LocaleContext } from "./locale-context";

export function LocaleProvider({ children }: { children: ReactNode }): ReactElement {
  const [locale, setLocaleState] = useState<Locale>(() => detectLocale());
  const setLocale = useCallback((next: Locale): void => {
    persistLocale(next);
    setLocaleState(next);
  }, []);
  const t = useCallback((key: MessageKey): string => messages[locale][key], [locale]);

  // Keep <html lang> in sync: screen readers pick the pronunciation from it,
  // and index.html can only carry one static value.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
