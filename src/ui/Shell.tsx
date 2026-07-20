import { useState } from "react";
import type { ReactElement } from "react";
import { useLocale } from "../i18n/locale-context";
import type { Locale } from "../i18n/messages";
import { LicensesPage } from "../components/LicensesPage";
import { CompressionQueue } from "./CompressionQueue";
import { PrivacyPage } from "./PrivacyPage";
import { BoltIcon, LockIcon, LogoIcon, WrenchIcon } from "./icons";

type Page = "home" | "privacy" | "licenses";

interface TrustCard {
  icon: ReactElement;
  title: string;
  body: string;
}

/** Top-level app frame: header, routed pages, trust strip, footer. */
export function Shell(): ReactElement {
  const { locale, setLocale, t } = useLocale();
  const [page, setPage] = useState<Page>("home");
  const nextLocale: Locale = locale === "fr" ? "en" : "fr";

  const goHome = (): void => {
    setPage("home");
  };

  const trustCards: TrustCard[] = [
    { icon: <LockIcon />, title: t("trust.gdpr.title"), body: t("trust.gdpr.body") },
    { icon: <BoltIcon />, title: t("trust.offline.title"), body: t("trust.offline.body") },
    { icon: <WrenchIcon />, title: t("trust.opensource.title"), body: t("trust.opensource.body") },
  ];

  return (
    <div>
      <header className="site-header">
        <div className="wrap nav">
          <span className="brand">
            <span className="brand-ico">
              <LogoIcon />
            </span>
            {t("app.title")}
          </span>
          <nav className="nav-links" aria-label={t("nav.home")}>
            <button
              type="button"
              className="nav-link"
              aria-current={page === "home" ? "page" : undefined}
              onClick={goHome}
            >
              {t("nav.home")}
            </button>
            <button
              type="button"
              className="nav-link"
              aria-current={page === "privacy" ? "page" : undefined}
              onClick={() => {
                setPage("privacy");
              }}
            >
              {t("nav.privacy")}
            </button>
            <button
              type="button"
              className="nav-link"
              aria-current={page === "licenses" ? "page" : undefined}
              onClick={() => {
                setPage("licenses");
              }}
            >
              {t("nav.licenses")}
            </button>
          </nav>
          <button
            type="button"
            className="lang-toggle"
            data-testid="locale-toggle"
            aria-label={nextLocale === "fr" ? "Passer en français" : "Switch to English"}
            onClick={() => {
              setLocale(nextLocale);
            }}
          >
            {nextLocale.toUpperCase()}
          </button>
        </div>
      </header>

      <main>
        {page === "home" && (
          <>
            <section className="hero">
              <div className="wrap">
                <p className="pill" data-testid="local-banner">
                  <span className="pill-dot" aria-hidden="true" />
                  {t("app.localBanner")}
                </p>
                <h1 className="hero-title">
                  {t("hero.title1")}
                  <br />
                  <span className="grad">{t("hero.title2")}</span>
                </h1>
                <p className="hero-sub">{t("app.tagline")}</p>
              </div>
            </section>

            <section className="wrap">
              <CompressionQueue />
            </section>

            <section className="trust wrap">
              {trustCards.map((card) => (
                <div key={card.title} className="t-item">
                  <h3>
                    <span className="t-ico">{card.icon}</span>
                    {card.title}
                  </h3>
                  <p>{card.body}</p>
                </div>
              ))}
            </section>
          </>
        )}

        {page === "privacy" && <PrivacyPage onBack={goHome} />}
        {page === "licenses" && <LicensesPage onBack={goHome} />}
      </main>

      <footer className="site-footer">
        <span>{t("footer.brand")}</span>
        <button
          type="button"
          className="footer-link"
          onClick={() => {
            setPage("licenses");
          }}
        >
          {t("nav.licenses")}
        </button>
      </footer>
    </div>
  );
}
