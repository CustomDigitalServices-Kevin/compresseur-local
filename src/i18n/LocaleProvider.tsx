import { useCallback, useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { detectLocale, messages } from "./messages";
import type { Locale, MessageKey } from "./messages";
import { LocaleContext } from "./locale-context";

export function LocaleProvider({ children }: { children: ReactNode }): ReactElement {
  const [locale, setLocale] = useState<Locale>(() => detectLocale());
  const t = useCallback((key: MessageKey): string => messages[locale][key], [locale]);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
