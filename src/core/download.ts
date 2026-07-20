/**
 * Triggers a browser download for a named blob via a temporary object URL.
 * The URL is revoked right after the click: the browser already holds a
 * reference to the blob at that point, so the download is unaffected.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
