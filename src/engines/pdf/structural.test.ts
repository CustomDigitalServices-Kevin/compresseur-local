// Verrouille la lecture des codes de sortie qpdf.
//
// Regression vecue en production le 2026-07-20 : un vrai PDF de formation
// (9 Mo, exporte par un outil tiers) faisait sortir qpdf en 3, traite alors
// comme un echec, si bien que la compression echouait sur la majorite des
// documents reels. Les fixtures generees par pdf-lib sortent toutes en 0 et
// ne pouvaient donc pas reveler le probleme.
//
// https://qpdf.readthedocs.io/en/stable/cli.html
import { describe, it, expect } from "vitest";

import { QPDF_EXIT_WARNINGS, isAcceptableQpdfExit } from "./structural";

describe("qpdf exit codes", () => {
  it("0 : aucun avertissement, sortie exploitable", () => {
    expect(isAcceptableQpdfExit(0)).toBe(true);
  });

  it("3 : avertissements SANS erreur, le fichier est bien produit", () => {
    expect(QPDF_EXIT_WARNINGS).toBe(3);
    expect(isAcceptableQpdfExit(QPDF_EXIT_WARNINGS)).toBe(true);
  });

  it("2 : erreurs, rien d'exploitable n'est produit", () => {
    expect(isAcceptableQpdfExit(2)).toBe(false);
  });

  it("tout autre code reste un echec", () => {
    for (const code of [1, 4, 5, 127, -1]) {
      expect(isAcceptableQpdfExit(code)).toBe(false);
    }
  });
});
