import type { ReactElement } from "react";
import { useLocale } from "../i18n/locale-context";
import { RUNTIME_LICENSES } from "./licenses-data";

interface LicensesPageProps {
  onBack: () => void;
}

// Structure-only page for T1 (styling is T5). It renders the locked
// RUNTIME_LICENSES table so the "Third-party licenses" surface exists and is
// wired to i18n from the start.
export function LicensesPage({ onBack }: LicensesPageProps): ReactElement {
  const { t } = useLocale();
  return (
    <section>
      <h1>{t("licenses.title")}</h1>
      <p>{t("licenses.intro")}</p>
      <table>
        <thead>
          <tr>
            <th scope="col">{t("licenses.columnLibrary")}</th>
            <th scope="col">{t("licenses.columnLicense")}</th>
          </tr>
        </thead>
        <tbody>
          {RUNTIME_LICENSES.map((entry) => (
            <tr key={entry.name}>
              <td>{entry.name}</td>
              <td>{entry.license}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={onBack}>
        {t("licenses.back")}
      </button>
    </section>
  );
}
