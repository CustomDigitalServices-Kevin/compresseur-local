import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

// COMPRESSION_LEVELS order in core/types.ts drives the tile order in FileCard.
const LEVEL_INDEX = { light: 0, balanced: 1, maximum: 2 } as const;
export type LevelName = keyof typeof LEVEL_INDEX;

export async function openApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("dropzone")).toBeVisible();
}

export async function addFile(page: Page, filePath: string): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles(filePath);
}

/** Waits for one level's real compression to land (the cell shows a size). */
export async function waitForEstimate(page: Page, level: LevelName): Promise<void> {
  await expect(
    page.locator(".level-tile").nth(LEVEL_INDEX[level]).locator(".level-size"),
  ).toBeVisible({ timeout: 150_000 });
}

export async function selectLevel(page: Page, level: LevelName): Promise<void> {
  await page.locator(".level-tile").nth(LEVEL_INDEX[level]).click();
}

export interface DownloadedFile {
  bytes: Buffer;
  name: string;
}

/** Clicks Download, waits for the real full compression, returns the bytes. */
export async function downloadResult(page: Page): Promise<DownloadedFile> {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 150_000 }),
    page.locator(".btn-download").first().click(),
  ]);
  const path = await download.path();
  return { bytes: await readFile(path), name: download.suggestedFilename() };
}

function startsWith(bytes: Buffer, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

/** Identifies the real container from magic bytes, ignoring the file name. */
export function sniffFormat(bytes: Buffer): string {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (
    bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
    bytes.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "webp";
  }
  if (bytes.subarray(4, 12).toString("latin1") === "ftypavif") return "avif";
  if (bytes.subarray(0, 4).toString("latin1") === "%PDF") return "pdf";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return "zip";
  return "unknown";
}

export interface DecodedSize {
  width: number;
  height: number;
}

/**
 * Decodes bytes back inside Chromium via createImageBitmap: proves the output
 * is a real image the browser can open, not just plausible magic bytes.
 */
export async function decodeInBrowser(page: Page, bytes: Buffer): Promise<DecodedSize> {
  return await page.evaluate(async (base64: string): Promise<DecodedSize> => {
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
    const bitmap = await createImageBitmap(new Blob([array]));
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  }, bytes.toString("base64"));
}

export function gainPercent(before: number, after: number): number {
  return ((before - after) / before) * 100;
}
