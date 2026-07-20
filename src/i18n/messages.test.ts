import { afterEach, describe, expect, it } from "vitest";
import { detectLocale, LOCALE_STORAGE_KEY, messages, persistLocale } from "./messages";

afterEach(() => {
  localStorage.clear();
});

describe("message catalog", () => {
  it("exposes the exact same key set in both locales", () => {
    expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.fr).sort());
  });

  it("never uses an em dash in French copy", () => {
    for (const [key, text] of Object.entries(messages.fr)) {
      expect(text.includes("—"), `fr key ${key} contains an em dash`).toBe(false);
    }
  });
});

describe("detectLocale", () => {
  it("prefers the locale persisted in localStorage", () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "fr");
    expect(detectLocale()).toBe("fr");
  });

  it("ignores a corrupted stored value and falls back to the navigator language", () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "de");
    // happy-dom reports an English navigator.language by default.
    expect(detectLocale()).toBe("en");
  });

  it("round-trips through persistLocale", () => {
    persistLocale("fr");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("fr");
    expect(detectLocale()).toBe("fr");
  });
});
