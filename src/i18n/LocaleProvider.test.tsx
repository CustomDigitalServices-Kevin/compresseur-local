import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { LocaleProvider } from "./LocaleProvider";
import { useLocale } from "./locale-context";
import { LOCALE_STORAGE_KEY } from "./messages";

function Probe(): ReactElement {
  const { locale, setLocale, t } = useLocale();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="title">{t("app.title")}</span>
      <button
        type="button"
        onClick={() => {
          setLocale(locale === "fr" ? "en" : "fr");
        }}
      >
        toggle
      </button>
    </div>
  );
}

afterEach(() => {
  localStorage.clear();
  document.documentElement.lang = "";
});

describe("LocaleProvider", () => {
  it("mirrors the active locale into the html lang attribute", async () => {
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    expect(document.documentElement.lang).toBe("en");

    await userEvent.click(screen.getByRole("button", { name: "toggle" }));

    expect(screen.getByTestId("locale")).toHaveTextContent("fr");
    expect(screen.getByTestId("title")).toHaveTextContent("Compresseur local");
    expect(document.documentElement.lang).toBe("fr");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("fr");
  });

  it("throws a clear error when useLocale is used outside the provider", () => {
    expect(() => render(<Probe />)).toThrow(/useLocale must be used inside/);
  });
});
