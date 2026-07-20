import type { ReactElement } from "react";
import { useLocale } from "../i18n/locale-context";
import { RUNTIME_LICENSES } from "./licenses-data";

interface LicensesPageProps {
  onBack: () => void;
}

/**
 * Third-party licenses page. Renders the RUNTIME_LICENSES table, which
 * licenses-page.test.ts locks against package.json in both directions (pattern
 * D14 from the convertisseur), so this list can never silently drift.
 */
export function LicensesPage({ onBack }: LicensesPageProps): ReactElement {
  const { t } = useLocale();
  return (
    <section className="page">
      <h1 className="page-title">{t("licenses.title")}</h1>
      <p className="page-card">{t("licenses.intro")}</p>
      <div className="page-card">
        <table className="table">
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
      </div>
      <button type="button" className="btn btn-ghost back-btn" onClick={onBack}>
        {t("licenses.back")}
      </button>
    </section>
  );
}
