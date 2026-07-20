import { useCallback, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { detectType } from "../core/detect";
import { downloadBlob } from "../core/download";
import { createInitialMatrix, estimateAll } from "../core/estimator";
import { createWorkerCompressionRunner } from "../core/runner";
import type { CompressionRunner } from "../core/runner";
import { createZip } from "../core/zip";
import type { ZipEntryFile } from "../core/zip";
import { COMPRESSION_LEVELS } from "../core/types";
import type { CompressionLevel, CompressionResult } from "../core/types";
import { useLocale } from "../i18n/locale-context";
import { AdvancedPanel } from "./AdvancedPanel";
import { Dropzone } from "./Dropzone";
import { FileCard } from "./FileCard";
import { formatBytes, outputFileName } from "./format";
import { buildProfile, DEFAULT_OVERRIDES, errorCodeOf, isDefaultOverrides } from "./queue-model";
import type { AdvancedOverrides, QueueItem } from "./queue-model";

let idSeq = 0;
function nextId(): string {
  idSeq += 1;
  return `job-${String(idSeq)}`;
}

interface CompressionQueueProps {
  /**
   * Injection point for the compression backend. Defaults to the real Web
   * Worker runner; tests pass a deterministic implementation (see
   * core/runner.ts) because happy-dom has no Worker.
   */
  runner?: CompressionRunner;
}

export function CompressionQueue({ runner }: CompressionQueueProps = {}): ReactElement {
  const { locale, t } = useLocale();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [globalLevel, setGlobalLevel] = useState<CompressionLevel>("balanced");
  const [overrides, setOverrides] = useState<AdvancedOverrides>(DEFAULT_OVERRIDES);
  const [zipping, setZipping] = useState(false);
  const runnerRef = useRef<CompressionRunner | null>(runner ?? null);
  // Overrides are read inside async estimate callbacks; a ref keeps them fresh
  // without making estimate() depend on (and re-create with) every keystroke.
  const overridesRef = useRef<AdvancedOverrides>(overrides);
  overridesRef.current = overrides;

  const getRunner = useCallback((): CompressionRunner => {
    runnerRef.current ??= createWorkerCompressionRunner();
    return runnerRef.current;
  }, []);

  const patchItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  // Runs the three-level estimate for one item, updating the matrix cell by
  // cell as each level lands (progressive UI). Uses a level-aware runner so
  // advanced overrides flow into every level's profile.
  const estimateItem = useCallback(
    (id: string, file: File) => {
      const activeRunner = getRunner();
      const activeOverrides = overridesRef.current;
      void estimateAll(file, {
        run: (input) =>
          activeRunner.run({ ...input, profile: buildProfile(input.level, activeOverrides) }),
        onLevelDone: (level, outcome) => {
          setItems((prev) =>
            prev.map((item) =>
              item.id === id ? { ...item, matrix: { ...item.matrix, [level]: outcome } } : item,
            ),
          );
        },
      })
        .then((matrix) => {
          const allFailed = COMPRESSION_LEVELS.every((level) => matrix[level] === "error");
          setItems((prev) =>
            prev.map((item) =>
              item.id === id
                ? allFailed
                  ? { ...item, status: "error", errorCode: "internal-error" }
                  : { ...item, status: "ready" }
                : item,
            ),
          );
        })
        .catch(() => {
          patchItem(id, { status: "error", errorCode: "internal-error" });
        });
    },
    [getRunner, patchItem],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      files.forEach((file) => {
        const id = nextId();
        void file
          .arrayBuffer()
          .then((buffer) => {
            const detected = detectType(file.name, buffer);
            const newItem: QueueItem = {
              id,
              file,
              detected,
              matrix: createInitialMatrix(),
              selectedLevel: globalLevel,
              status: detected === null ? "error" : "estimating",
              errorCode: detected === null ? "unsupported-family" : null,
            };
            setItems((prev) => [...prev, newItem]);
            if (detected !== null) estimateItem(id, file);
          })
          .catch(() => {
            setItems((prev) => [
              ...prev,
              {
                id,
                file,
                detected: null,
                matrix: createInitialMatrix(),
                selectedLevel: globalLevel,
                status: "error",
                errorCode: "corrupted-file",
              },
            ]);
          });
      });
    },
    [estimateItem, globalLevel],
  );

  const handleSelectLevel = useCallback((id: string, level: CompressionLevel) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selectedLevel: level } : item)),
    );
  }, []);

  const handleGlobalLevel = useCallback((level: CompressionLevel) => {
    setGlobalLevel(level);
    setItems((prev) => prev.map((item) => ({ ...item, selectedLevel: level })));
  }, []);

  // Re-run every estimate with the new overrides (or presets, when reset).
  const handleApplyOverrides = useCallback(
    (next: AdvancedOverrides) => {
      setOverrides(next);
      overridesRef.current = next;
      setItems((prev) =>
        prev.map((item) =>
          item.detected === null
            ? item
            : { ...item, status: "estimating", errorCode: null, matrix: createInitialMatrix() },
        ),
      );
      items.forEach((item) => {
        if (item.detected !== null) estimateItem(item.id, item.file);
      });
    },
    [estimateItem, items],
  );

  // Produces the FULL compressed output for the selected level. When the
  // estimate was exact (isEstimate false) its blob is already the whole file;
  // when it was sampled, a fresh non-sampling compression is run at download
  // time (allowSampling false forces the exact path).
  const fullResultFor = useCallback(
    async (item: QueueItem): Promise<CompressionResult | null> => {
      const outcome = item.matrix[item.selectedLevel];
      if (outcome === "pending" || outcome === "error") return null;
      if (!outcome.isEstimate) return outcome;
      return getRunner().run({
        file: item.file,
        level: item.selectedLevel,
        profile: buildProfile(item.selectedLevel, overridesRef.current),
        allowSampling: false,
      });
    },
    [getRunner],
  );

  const handleDownload = useCallback(
    (item: QueueItem) => {
      patchItem(item.id, { status: "compressing" });
      fullResultFor(item)
        .then((result) => {
          if (result === null) {
            patchItem(item.id, { status: "error", errorCode: "internal-error" });
            return;
          }
          const name = outputFileName(
            item.file.name,
            item.detected?.family ?? null,
            result.blob.type,
          );
          downloadBlob(result.blob, name);
          patchItem(item.id, { status: "done" });
        })
        .catch((error: unknown) => {
          patchItem(item.id, { status: "error", errorCode: errorCodeOf(error) });
        });
    },
    [fullResultFor, patchItem],
  );

  const handleRemove = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleClear = useCallback(() => {
    runnerRef.current?.cancelAll();
    setItems([]);
  }, []);

  const readyItems = useMemo(
    () => items.filter((item) => item.detected !== null && item.status !== "error"),
    [items],
  );

  const handleDownloadAllZip = useCallback(() => {
    if (readyItems.length === 0) return;
    setZipping(true);
    Promise.all(
      readyItems.map(async (item): Promise<ZipEntryFile | null> => {
        const result = await fullResultFor(item);
        if (result === null) return null;
        const name = outputFileName(
          item.file.name,
          item.detected?.family ?? null,
          result.blob.type,
        );
        const data = new Uint8Array(await result.blob.arrayBuffer());
        return { name, data };
      }),
    )
      .then((entries) => {
        const valid = entries.filter((entry): entry is ZipEntryFile => entry !== null);
        if (valid.length > 0) downloadBlob(createZip(valid), "compressed.zip");
        setItems((prev) =>
          prev.map((item) =>
            item.detected !== null && item.status === "ready" ? { ...item, status: "done" } : item,
          ),
        );
      })
      .catch(() => {
        // A single failing file must not blank the page; leave items as they are.
      })
      .finally(() => {
        setZipping(false);
      });
  }, [fullResultFor, readyItems]);

  const totalBefore = useMemo(() => items.reduce((sum, item) => sum + item.file.size, 0), [items]);
  const hasCustom = !isDefaultOverrides(overrides);

  return (
    <div>
      <Dropzone onFilesAdded={addFiles} />

      {items.length === 0 ? (
        <p className="q-empty">{t("queue.empty")}</p>
      ) : (
        <div className="queue">
          <div className="q-head">
            <h2 className="q-title">
              {t("queue.title")}
              {hasCustom && <span className="badge-custom">{t("queue.customBadge")}</span>}
            </h2>
            <div className="q-actions">
              <div className="seg" role="group" aria-label={t("queue.globalLevelLabel")}>
                {COMPRESSION_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    className={globalLevel === level ? "seg-btn seg-btn-active" : "seg-btn"}
                    aria-pressed={globalLevel === level}
                    onClick={() => {
                      handleGlobalLevel(level);
                    }}
                  >
                    {t(`level.${level}`)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={readyItems.length === 0 || zipping}
                onClick={handleDownloadAllZip}
              >
                {zipping ? t("queue.zipWorking") : t("queue.downloadAllZip")}
              </button>
              <button type="button" className="btn btn-ghost" onClick={handleClear}>
                {t("queue.clear")}
              </button>
            </div>
          </div>

          <p className="q-empty" data-testid="queue-total">
            {formatBytes(totalBefore, locale)}
          </p>

          <ul className="file-list" aria-label={t("queue.title")}>
            {items.map((item) => (
              <FileCard
                key={item.id}
                item={item}
                onSelectLevel={handleSelectLevel}
                onDownload={handleDownload}
                onRemove={handleRemove}
              />
            ))}
          </ul>

          <AdvancedPanel onApply={handleApplyOverrides} />
        </div>
      )}
    </div>
  );
}
