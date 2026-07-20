import { unzipSync, zipSync } from "fflate";
import type { Zippable } from "fflate";
import type { CompressionEngine } from "../../core/engine";
import type { CompressionProfile, CompressionResult } from "../../core/types";
import { CompressionError } from "../../core/types";
import type { EncodePlan, RasterCodec, SourceDimensions } from "../image/raster-codec";
import { computeGain, computeTargetDimensions, qualityToUnit } from "../image/plan";
import type { MediaImage, MediaRename } from "./ooxml";
import { findMediaImages, renamedMediaPath, rewriteContentTypes, rewriteRels } from "./ooxml";

// Office (docx/pptx/xlsx) engine: unzip the OOXML package with fflate,
// re-encode the raster images under word/media/, ppt/media/ and xl/media/
// through the same RasterCodec seam as the image engine, then re-zip at
// maximum deflate. Content XML (document.xml, slides, sheets) is NEVER
// touched; [Content_Types].xml and *.rels are rewritten ONLY when a media
// file changes extension (opaque png re-encoded as jpeg). Everything the
// engine cannot safely improve -- emf/wmf, gif, video, audio, fonts, ole,
// xl/richData, PNGs with transparency (no lossless optimizer bundled yet;
// lossy would risk the alpha channel) -- is copied through byte-for-byte.

/** estimate(): number of largest images actually recompressed before extrapolating. */
export const OFFICE_SAMPLE_COUNT = 5;

export interface OfficeEngineDeps {
  codec: RasterCodec;
  /**
   * Optional lossless PNG optimizer (oxipng-style: same pixels, smaller file).
   * When absent, PNGs with transparency are copied through intact -- alpha is
   * never run through a lossy encoder. T2's @jsquash/oxipng plugs in here.
   */
  losslessPng?: (data: Uint8Array) => Promise<Uint8Array>;
  /** Overridable so tests can exercise the sampling path with tiny fixtures. */
  sampleCount?: number;
}

// Profile.convertFormat is deliberately ignored inside Office packages: the
// advanced "convert to webp/avif" option targets standalone images. Forcing
// every embedded picture to webp/avif would break the document in Office
// versions without that decoder, so embedded media only ever keep their format
// or fall back from opaque png to the universally supported jpeg.
const OUTPUT_BY_FORMAT: Record<MediaImage["format"], { mime: string; extension: string }> = {
  jpeg: { mime: "image/jpeg", extension: "jpeg" },
  webp: { mime: "image/webp", extension: "webp" },
  png: { mime: "image/jpeg", extension: "jpeg" },
};

function unzipPackage(input: Uint8Array): Record<string, Uint8Array> {
  try {
    return unzipSync(input);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const code = detail.toLowerCase().includes("encrypt") ? "password-protected" : "corrupted-file";
    throw new CompressionError(code, `OOXML unzip failed: ${detail}`);
  }
}

/** True for the media the profile may re-encode; the rest is copied intact. */
function isReencodable(image: MediaImage): boolean {
  return image.format !== "png" || !image.hasAlpha;
}

interface ReencodedMedia {
  data: Uint8Array;
  /** True when the accepted output is a different format than the source. */
  converted: boolean;
}

async function reencodeOne(
  codec: RasterCodec,
  image: MediaImage,
  source: Uint8Array,
  profile: CompressionProfile,
): Promise<ReencodedMedia> {
  const output = OUTPUT_BY_FORMAT[image.format];
  const planFor = (dims: SourceDimensions): EncodePlan => {
    const target = computeTargetDimensions(dims, profile.maxDimension);
    return {
      targetWidth: target.width,
      targetHeight: target.height,
      mimeType: output.mime,
      quality: qualityToUnit(profile.imageQuality),
    };
  };
  // ArrayBuffer copy: the zip entry is a view into the archive buffer, and the
  // codec expects a standalone ArrayBuffer.
  const buffer = new Uint8Array(source).buffer;
  try {
    const blob = await codec.reencode(buffer, `image/${image.format}`, planFor);
    const encoded = new Uint8Array(await blob.arrayBuffer());
    // Keep the smaller of the two: a re-encode that grows the file (tiny
    // icons, already-optimized photos) is discarded, never shipped.
    if (encoded.length < source.length) {
      return { data: encoded, converted: image.format === "png" };
    }
    return { data: source, converted: false };
  } catch {
    // One undecodable picture must not corrupt the whole document: keep the
    // original bytes and move on.
    return { data: source, converted: false };
  }
}

async function optimizeAlphaPng(
  losslessPng: ((data: Uint8Array) => Promise<Uint8Array>) | undefined,
  source: Uint8Array,
): Promise<Uint8Array> {
  if (losslessPng === undefined) return source;
  try {
    const optimized = await losslessPng(source);
    return optimized.length < source.length ? optimized : source;
  } catch {
    return source;
  }
}

function findContentTypesKey(files: Record<string, Uint8Array>): string | null {
  for (const key of Object.keys(files)) {
    if (key.toLowerCase() === "[content_types].xml") return key;
  }
  return null;
}

/**
 * xlsx "images in cells" (rich data) reference media through parts under
 * xl/richData/ that the PRD forbids touching. Renaming a media file without
 * updating those parts would break the workbook, so renames are suppressed
 * for the whole package when rich data is present; same-format re-encoding
 * stays safe (paths unchanged).
 */
function hasRichData(files: Record<string, Uint8Array>): boolean {
  return Object.keys(files).some((key) => key.toLowerCase().startsWith("xl/richdata"));
}

interface MediaPlanOutcome {
  /** Final bytes per original media path (re-encoded or original). */
  replacements: Map<string, Uint8Array>;
  /** Extension renames (opaque png accepted as jpeg). */
  renames: MediaRename[];
}

async function reencodeAllMedia(
  deps: OfficeEngineDeps,
  files: Record<string, Uint8Array>,
  images: readonly MediaImage[],
  profile: CompressionProfile,
  canRename: boolean,
): Promise<MediaPlanOutcome> {
  const replacements = new Map<string, Uint8Array>();
  const renames: MediaRename[] = [];
  const takenPaths = new Set(Object.keys(files));
  for (const image of images) {
    const source = files[image.path];
    if (source === undefined) continue;
    if (!isReencodable(image)) {
      const optimized = await optimizeAlphaPng(deps.losslessPng, source);
      if (optimized !== source) replacements.set(image.path, optimized);
      continue;
    }
    const result = await reencodeOne(deps.codec, image, source, profile);
    if (!result.converted) {
      if (result.data !== source) replacements.set(image.path, result.data);
      continue;
    }
    // png -> jpeg: only rename when the package can be kept consistent
    // ([Content_Types].xml present, extension present, no name collision).
    const output = OUTPUT_BY_FORMAT[image.format];
    const newPath = renamedMediaPath(image.path, output.extension);
    if (!canRename || newPath === null || takenPaths.has(newPath)) {
      // Cannot rename safely: keep the original png untouched (jpeg bytes
      // under a .png part name would contradict the declared content type).
      continue;
    }
    takenPaths.add(newPath);
    replacements.set(image.path, result.data);
    renames.push({
      oldPath: image.path,
      newPath,
      newExtension: output.extension,
      newContentType: output.mime,
    });
  }
  return { replacements, renames };
}

function rebuildPackage(
  files: Record<string, Uint8Array>,
  outcome: MediaPlanOutcome,
  contentTypesKey: string | null,
): Uint8Array {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const renameByOldPath = new Map(outcome.renames.map((r) => [r.oldPath, r]));
  const zippable: Zippable = {};
  for (const [path, original] of Object.entries(files)) {
    // Skip explicit directory entries; zip folders are implicit in the paths.
    if (path.endsWith("/") && original.length === 0) continue;
    let outPath = path;
    let outData = outcome.replacements.get(path) ?? original;
    const rename = renameByOldPath.get(path);
    if (rename !== undefined) {
      outPath = rename.newPath;
    } else if (outcome.renames.length > 0) {
      if (path === contentTypesKey) {
        const rewritten = rewriteContentTypes(decoder.decode(original), outcome.renames);
        if (rewritten !== null) outData = encoder.encode(rewritten);
      } else if (path.toLowerCase().endsWith(".rels")) {
        const rewritten = rewriteRels(decoder.decode(original), path, outcome.renames);
        if (rewritten !== null) outData = encoder.encode(rewritten);
      }
    }
    zippable[outPath] = outData;
  }
  return zipSync(zippable, { level: 9 });
}

function toResult(file: File, output: Uint8Array, input: Uint8Array): CompressionResult {
  // Whole-file guard: if the rebuilt package is not smaller (e.g. the source
  // zip was already better compressed), ship the original bytes -- always a
  // valid file, reported as 0% gain.
  const finalBytes = output.length < input.length ? output : input;
  const mimeType = file.type === "" ? "application/octet-stream" : file.type;
  const blob = new Blob([finalBytes.slice().buffer], { type: mimeType });
  return {
    bytesBefore: file.size,
    bytesAfter: blob.size,
    gainPercent: computeGain(file.size, blob.size),
    blob,
    isEstimate: false,
    sampled: false,
  };
}

async function compressOffice(
  deps: OfficeEngineDeps,
  file: File,
  profile: CompressionProfile,
): Promise<CompressionResult> {
  const input = new Uint8Array(await file.arrayBuffer());
  const files = unzipPackage(input);
  const contentTypesKey = findContentTypesKey(files);
  const images = findMediaImages(files);
  const canRename = contentTypesKey !== null && !hasRichData(files);
  const outcome = await reencodeAllMedia(deps, files, images, profile, canRename);
  const output = rebuildPackage(files, outcome, contentTypesKey);
  return toResult(file, output, input);
}

async function estimateOffice(
  deps: OfficeEngineDeps,
  file: File,
  profile: CompressionProfile,
): Promise<CompressionResult> {
  const sampleCount = deps.sampleCount ?? OFFICE_SAMPLE_COUNT;
  const input = new Uint8Array(await file.arrayBuffer());
  const files = unzipPackage(input);
  const candidates = findMediaImages(files).filter(isReencodable);
  if (candidates.length <= sampleCount) {
    // Few enough images to just do the real thing: exact result, no estimate.
    return compressOffice(deps, file, profile);
  }

  // Recompress only the N largest images and extrapolate their measured ratio
  // over the total bytes of ALL re-encodable media (PRD T4 sampling rule).
  const sample = [...candidates].sort((a, b) => b.bytes - a.bytes).slice(0, sampleCount);
  const sampleParts: Uint8Array[] = [];
  let sampleBefore = 0;
  let sampleAfter = 0;
  for (const image of sample) {
    const source = files[image.path];
    if (source === undefined) continue;
    const result = await reencodeOne(deps.codec, image, source, profile);
    sampleBefore += source.length;
    sampleAfter += result.data.length;
    sampleParts.push(result.data);
  }
  const totalCandidateBytes = candidates.reduce((sum, image) => sum + image.bytes, 0);
  const ratio = sampleBefore > 0 ? sampleAfter / sampleBefore : 1;
  const estimatedMediaAfter = Math.round(totalCandidateBytes * ratio);
  const bytesAfter = Math.max(
    1,
    Math.min(file.size, file.size - totalCandidateBytes + estimatedMediaAfter),
  );
  // The blob is the recompressed sample (types.ts contract for sampled
  // estimates): a representative preview, NOT the final package -- the real
  // file is produced by compress() at download time.
  const blob = new Blob(
    sampleParts.map((part) => part.slice().buffer),
    { type: "application/octet-stream" },
  );
  return {
    bytesBefore: file.size,
    bytesAfter,
    gainPercent: computeGain(file.size, bytesAfter),
    blob,
    isEstimate: true,
    sampled: true,
  };
}

export function createOfficeEngine(deps: OfficeEngineDeps): CompressionEngine {
  return {
    compress: (file, profile) => compressOffice(deps, file, profile),
    estimate: (file, profile) => estimateOffice(deps, file, profile),
  };
}
