// Hand-written types for @jspawn/qpdf-wasm 0.0.2 (ships no .d.ts). The package
// exposes the qpdf CLI compiled with Emscripten: a default-export factory that
// resolves to a module with callMain + MEMFS. Only the surface used by
// structural.ts is typed.
declare module "@jspawn/qpdf-wasm" {
  export interface QpdfFileSystem {
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
  }

  export interface QpdfModule {
    callMain(args: string[]): number;
    FS: QpdfFileSystem;
  }

  export interface QpdfInitOptions {
    /**
     * Emscripten hook that fully bypasses the glue's own wasm fetching. This is
     * the only reliable loading path here: the glue predates Node's global
     * fetch and tries fetch() on a filesystem path under Node >= 18 (spike
     * 2026-07-20), and it ignores the modern `wasmBinary` option.
     */
    instantiateWasm?(
      imports: WebAssembly.Imports,
      successCallback: (instance: WebAssembly.Instance) => void,
    ): Record<string, never>;
    noInitialRun?: boolean;
    print?(line: string): void;
    printErr?(line: string): void;
    locateFile?(path: string): string;
  }

  export default function initQpdf(options?: QpdfInitOptions): Promise<QpdfModule>;
}
