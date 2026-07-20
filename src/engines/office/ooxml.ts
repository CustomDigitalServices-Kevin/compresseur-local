// Pure OOXML (docx/pptx/xlsx) package helpers for the office engine: media
// discovery, image sniffing (magic bytes, never the extension), PNG
// transparency detection, .rels target resolution and the two surgical
// rewrites ([Content_Types].xml + *.rels) needed when a media file changes
// extension. Everything here is string/byte level -- no DOM, no canvas -- so it
// runs identically in the worker and under Vitest/Node.

/** The only folders whose images the engine may re-encode (PRD T4). */
export const MEDIA_DIRS: readonly string[] = ["word/media/", "ppt/media/", "xl/media/"];

/** Formats the engine can re-encode. Anything else (emf/wmf/gif/tiff/video/
 * audio/fonts/ole) is copied through byte-for-byte. */
export type MediaImageFormat = "jpeg" | "png" | "webp";

export interface MediaImage {
  path: string;
  format: MediaImageFormat;
  /** Only meaningful for png: true when the file can carry transparency. */
  hasAlpha: boolean;
  bytes: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

function matchesAt(data: Uint8Array, bytes: readonly number[], offset: number): boolean {
  if (data.length < offset + bytes.length) return false;
  return bytes.every((b, i) => data[offset + i] === b);
}

/** Identifies a re-encodable raster from its magic bytes; null for anything else. */
export function sniffImageFormat(data: Uint8Array): MediaImageFormat | null {
  if (matchesAt(data, PNG_SIGNATURE, 0)) return "png";
  if (matchesAt(data, JPEG_SIGNATURE, 0)) return "jpeg";
  if (matchesAt(data, RIFF, 0) && matchesAt(data, WEBP, 8)) return "webp";
  return null;
}

/**
 * True when a PNG can carry transparency: IHDR color type 4 (gray+alpha) or
 * 6 (RGBA), or a tRNS chunk before the first IDAT (palette / keyed alpha).
 * Conservative on malformed input: an unreadable structure reports true, so a
 * suspicious PNG is left intact rather than risking alpha loss.
 */
export function pngHasTransparency(data: Uint8Array): boolean {
  // 8-byte signature + IHDR chunk: length(4) "IHDR"(4) width(4) height(4)
  // bitDepth(1) colorType(1) -> color type sits at offset 25.
  const colorType = data[25];
  if (data.length < 26 || colorType === undefined) return true;
  if (colorType === 4 || colorType === 6) return true;

  // Walk chunks looking for tRNS before IDAT. Chunk = len(4) type(4) data crc(4).
  let offset = 8;
  while (offset + 8 <= data.length) {
    const b0 = data[offset];
    const b1 = data[offset + 1];
    const b2 = data[offset + 2];
    const b3 = data[offset + 3];
    if (b0 === undefined || b1 === undefined || b2 === undefined || b3 === undefined) return true;
    const length = (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;
    if (length < 0) return true;
    const type = String.fromCharCode(
      data[offset + 4] ?? 0,
      data[offset + 5] ?? 0,
      data[offset + 6] ?? 0,
      data[offset + 7] ?? 0,
    );
    if (type === "tRNS") return true;
    if (type === "IDAT" || type === "IEND") return false;
    offset += 8 + length + 4;
  }
  return false;
}

/** True for paths inside word/media/, ppt/media/ or xl/media/ (never richData). */
export function isMediaPath(path: string): boolean {
  const lower = path.toLowerCase();
  return MEDIA_DIRS.some((dir) => lower.startsWith(dir));
}

/** Scans an unzipped package for re-encodable media images, in archive order. */
export function findMediaImages(files: Readonly<Record<string, Uint8Array>>): MediaImage[] {
  const images: MediaImage[] = [];
  for (const [path, data] of Object.entries(files)) {
    if (!isMediaPath(path)) continue;
    const format = sniffImageFormat(data);
    if (format === null) continue;
    images.push({
      path,
      format,
      hasAlpha: format === "png" ? pngHasTransparency(data) : false,
      bytes: data.length,
    });
  }
  return images;
}

/**
 * Resolves a Relationship Target against the part that owns the .rels file.
 * Per OPC, "word/_rels/document.xml.rels" belongs to "word/document.xml", so
 * relative targets resolve against "word/". Absolute targets ("/word/media/x")
 * drop the leading slash. External targets (mailto:, https:, ...) return null.
 */
export function resolveRelsTarget(relsPath: string, target: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return null;

  const segments: string[] = [];
  if (!target.startsWith("/")) {
    const slash = relsPath.lastIndexOf("/");
    const relsDir = slash === -1 ? "" : relsPath.slice(0, slash);
    // The owning part's folder is the parent of the "_rels" folder.
    const baseDir = relsDir.endsWith("_rels")
      ? relsDir.slice(0, Math.max(0, relsDir.length - "_rels".length - 1))
      : relsDir;
    if (baseDir !== "") segments.push(...baseDir.split("/"));
  }
  for (const segment of target.replace(/^\//, "").split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.join("/");
}

/** One media file whose extension changed (e.g. opaque png re-encoded as jpeg). */
export interface MediaRename {
  oldPath: string;
  newPath: string;
  /** New extension without the dot, e.g. "jpeg". */
  newExtension: string;
  /** MIME registered in [Content_Types].xml for the new extension. */
  newContentType: string;
}

function swapExtension(path: string, newExtension: string): string | null {
  const slash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");
  if (dot <= slash) return null;
  return `${path.slice(0, dot)}.${newExtension}`;
}

/** Computes the renamed part path, or null when the name has no extension. */
export function renamedMediaPath(oldPath: string, newExtension: string): string | null {
  return swapExtension(oldPath, newExtension);
}

/**
 * Rewrites Relationship Target attributes that resolve to a renamed media
 * part, preserving the original relative form (only the extension changes).
 * Returns null when nothing in this .rels references a renamed part.
 */
export function rewriteRels(
  relsXml: string,
  relsPath: string,
  renames: readonly MediaRename[],
): string | null {
  if (renames.length === 0) return null;
  const byOldPath = new Map(renames.map((r) => [r.oldPath, r]));
  const rewritten = relsXml.replace(/Target="([^"]*)"/g, (whole, target: string) => {
    const resolved = resolveRelsTarget(relsPath, target);
    if (resolved === null) return whole;
    const rename = byOldPath.get(resolved);
    if (rename === undefined) return whole;
    const newTarget = swapExtension(target, rename.newExtension);
    if (newTarget === null) return whole;
    return `Target="${newTarget}"`;
  });
  return rewritten === relsXml ? null : rewritten;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rewrites [Content_Types].xml for a set of renames: guarantees a <Default>
 * for each new extension (OPC compares extensions case-insensitively) and
 * updates any <Override> that named a renamed part explicitly. Old <Default>
 * entries stay -- other parts may still use that extension, and a spare
 * Default is harmless. Returns null when no rename applies.
 */
export function rewriteContentTypes(
  contentTypesXml: string,
  renames: readonly MediaRename[],
): string | null {
  if (renames.length === 0) return null;
  let xml = contentTypesXml;

  const neededDefaults = new Map<string, string>();
  for (const rename of renames) {
    neededDefaults.set(rename.newExtension.toLowerCase(), rename.newContentType);
  }
  for (const [extension, contentType] of neededDefaults) {
    const hasDefault = new RegExp(
      `<Default\\s[^>]*Extension="${escapeRegExp(extension)}"`,
      "i",
    ).test(xml);
    if (!hasDefault) {
      xml = xml.replace(
        /<\/Types>/,
        `<Default Extension="${extension}" ContentType="${contentType}"/></Types>`,
      );
    }
  }

  for (const rename of renames) {
    const overridePattern = new RegExp(
      `<Override\\s[^>]*PartName="/${escapeRegExp(rename.oldPath)}"[^>]*/>`,
      "gi",
    );
    xml = xml.replace(
      overridePattern,
      `<Override PartName="/${rename.newPath}" ContentType="${rename.newContentType}"/>`,
    );
  }

  return xml === contentTypesXml ? null : xml;
}
