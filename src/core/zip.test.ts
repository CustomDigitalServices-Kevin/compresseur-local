import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { createZip } from "./zip";

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("createZip", () => {
  it("produces a valid archive that round-trips through unzipSync", async () => {
    const blob = createZip([
      { name: "a.png", data: bytes("alpha") },
      { name: "b.pdf", data: bytes("bravo") },
    ]);
    expect(blob.type).toBe("application/zip");
    const unzipped = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(unzipped).sort()).toEqual(["a.png", "b.pdf"]);
    expect(new TextDecoder().decode(unzipped["a.png"])).toBe("alpha");
    expect(new TextDecoder().decode(unzipped["b.pdf"])).toBe("bravo");
  });

  it("deduplicates colliding entry names with a numbered suffix", async () => {
    const blob = createZip([
      { name: "doc.pdf", data: bytes("one") },
      { name: "doc.pdf", data: bytes("two") },
      { name: "readme", data: bytes("three") },
      { name: "readme", data: bytes("four") },
    ]);
    const unzipped = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(unzipped).sort()).toEqual([
      "doc (1).pdf",
      "doc.pdf",
      "readme",
      "readme (1)",
    ]);
  });
});
