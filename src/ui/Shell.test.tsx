import { afterEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LOCALE_STORAGE_KEY } from "../i18n/messages";
import { Shell } from "./Shell";
import { renderWithLocale } from "./test-utils";

afterEach(() => {
  localStorage.clear();
});

describe("Shell i18n", () => {
  it("starts in English (happy-dom navigator) and switches to French", async () => {
    renderWithLocale(<Shell />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Compress your files/i);

    await userEvent.click(screen.getByTestId("locale-toggle"));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Compressez vos fichiers/i);
    expect(screen.getByText(/vos fichiers ne quittent jamais/i)).toBeInTheDocument();
  });

  it("persists the chosen language in localStorage", async () => {
    renderWithLocale(<Shell />);
    await userEvent.click(screen.getByTestId("locale-toggle"));
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("fr");
  });

  it("restores the persisted language on the next mount", () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "fr");
    renderWithLocale(<Shell />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Compressez vos fichiers/i);
  });
});

describe("Shell navigation", () => {
  it("opens the third-party licenses page from the footer and comes back", async () => {
    renderWithLocale(<Shell />);
    const footerLinks = screen.getAllByRole("button", { name: /Third-party licenses/i });
    // The last one is the footer entry (the first is the header nav).
    await userEvent.click(footerLinks[footerLinks.length - 1] as HTMLElement);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Third-party licenses/i);
    expect(screen.getByRole("columnheader", { name: /Library/i })).toBeInTheDocument();
    expect(screen.getByText("react / react-dom")).toBeInTheDocument();
    expect(screen.getByText("fflate")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Back to home/i }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Compress your files/i);
  });

  it("opens the why-100%-local page and marks the current nav item", async () => {
    renderWithLocale(<Shell />);
    const navLink = screen.getByRole("button", { name: /Why 100% local/i });
    await userEvent.click(navLink);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Why 100% local/i);
    expect(screen.getByText(/Your files stay with you/i)).toBeInTheDocument();
    expect(screen.getByText(/Unlike online compressors/i)).toBeInTheDocument();
    expect(navLink).toHaveAttribute("aria-current", "page");
  });

  it("keeps the static pages translated after a language switch", async () => {
    renderWithLocale(<Shell />);
    await userEvent.click(screen.getByRole("button", { name: /Why 100% local/i }));
    await userEvent.click(screen.getByTestId("locale-toggle"));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Pourquoi 100% local/i);
  });
});
