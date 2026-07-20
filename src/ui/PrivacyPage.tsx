import type { ReactElement } from "react";
import { useLocale } from "../i18n/locale-context";
import type { MessageKey } from "../i18n/messages";

interface PrivacyPageProps {
  onBack: () => void;
}

const SECTIONS: readonly { title: MessageKey; body: MessageKey }[] = [
  { title: "privacy.intro.title", body: "privacy.intro.body" },
  { title: "privacy.local.title", body: "privacy.local.body" },
  { title: "privacy.comparison.title", body: "privacy.comparison.body" },
  { title: "privacy.data.title", body: "privacy.data.body" },
];

/** "Why 100% local" page: short GDPR-focused argument, bilingual. */
export function PrivacyPage({ onBack }: PrivacyPageProps): ReactElement {
  const { t } = useLocale();
  return (
    <section className="page">
      <h1 className="page-title">{t("privacy.title")}</h1>
      {SECTIONS.map((section) => (
        <div key={section.title} className="page-card">
          <h2>{t(section.title)}</h2>
          <p>{t(section.body)}</p>
        </div>
      ))}
      <button type="button" className="btn btn-ghost back-btn" onClick={onBack}>
        {t("privacy.back")}
      </button>
    </section>
  );
}
