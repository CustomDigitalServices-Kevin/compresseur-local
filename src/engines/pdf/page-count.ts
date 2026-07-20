// Output validation helper: reopen a rewritten PDF with pdfjs and report its
// page count. The legacy build is used because it runs both in browser workers
// and under plain Node (Vitest), where pdfjs falls back to its fake worker.
export async function countPdfPages(bytes: Uint8Array): Promise<number> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // pdfjs transfers the buffer to its worker; hand it a private copy.
  const task = pdfjs.getDocument({ data: bytes.slice() });
  const doc = await task.promise;
  try {
    return doc.numPages;
  } finally {
    // destroy() lives on the loading task, not the document proxy; it tears
    // down the worker and frees the transferred buffer.
    await task.destroy();
  }
}
