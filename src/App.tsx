import { useState } from "react";
import type { ReactElement } from "react";
import { useLocale } from "./i18n/locale-context";
import { LicensesPage } from "./components/LicensesPage";

type View = "home" | "licenses";

// Minimal shell for T1. The compression UI (dropzone, per-level estimate grid,
// batch download) is delivered in T5; this only proves the app mounts, the i18n
// context works, and the licenses surface is reachable.
export function App(): ReactElement {
  const { t } = useLocale();
  const [view, setView] = useState<View>("home");

  if (view === "licenses") {
    return (
      <LicensesPage
        onBack={() => {
          setView("home");
        }}
      />
    );
  }

  return (
    <main>
      <h1>{t("app.title")}</h1>
      <p>{t("app.tagline")}</p>
      <p role="note">{t("app.localBanner")}</p>
      <button
        type="button"
        onClick={() => {
          setView("licenses");
        }}
      >
        {t("nav.licenses")}
      </button>
    </main>
  );
}
