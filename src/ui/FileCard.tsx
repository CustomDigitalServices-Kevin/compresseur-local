import type { ReactElement } from "react";
import { COMPRESSION_LEVELS } from "../core/types";
import type {
  CompressionErrorCode,
  CompressionFamily,
  CompressionLevel,
  CompressionResult,
} from "../core/types";
import { useLocale } from "../i18n/locale-context";
import type { MessageKey } from "../i18n/messages";
import { formatBytes, formatGain } from "./format";
import { CheckIcon, TrashIcon } from "./icons";
import type { QueueItem } from "./queue-model";

interface FileCardProps {
  item: QueueItem;
  onSelectLevel: (id: string, level: CompressionLevel) => void;
  onDownload: (item: QueueItem) => void;
  onRemove: (id: string) => void;
}

const FAMILY_ICON_TEXT: Record<CompressionFamily, string> = {
  image: "IMG",
  pdf: "PDF",
  office: "DOC",
};

const FAMILY_ICON_CLASS: Record<CompressionFamily, string> = {
  image: "f-ico f-image",
  pdf: "f-ico f-pdf",
  office: "f-ico f-office",
};

function errorMessageKey(code: CompressionErrorCode): MessageKey {
  return `error.${code}`;
}

function familyMessageKey(family: CompressionFamily): MessageKey {
  return `family.${family}`;
}

function levelMessageKey(level: CompressionLevel): MessageKey {
  return `level.${level}`;
}

function levelDescMessageKey(level: CompressionLevel): MessageKey {
  return `level.${level}.desc`;
}

interface LevelCellProps {
  outcome: CompressionResult | "pending" | "error";
}

function LevelCell({ outcome }: LevelCellProps): ReactElement {
  const { locale, t } = useLocale();
  if (outcome === "pending") {
    // Indeterminate native <progress>: no value attribute, styled exclusively
    // from the stylesheet (gotcha D9: style-src-attr is not supported in
    // Safari, so inline styles are banned).
    return <progress className="progress" aria-label={t("estimate.pendingLabel")} />;
  }
  if (outcome === "error") {
    return <span className="level-error">{t("estimate.errorCell")}</span>;
  }
  const gainClass = outcome.gainPercent > 0 ? "level-gain" : "level-gain level-gain-none";
  return (
    <span className="level-size">
      {formatBytes(outcome.bytesAfter, locale)}
      <span className={gainClass}>{formatGain(outcome.gainPercent, locale)}</span>
      {outcome.isEstimate && <span className="badge-estimate">{t("estimate.badge")}</span>}
    </span>
  );
}

/**
 * One queued file: family badge, name and size, the three-level estimate
 * matrix (a radio group, filled progressively as each level's real
 * compression lands), and the download action.
 */
export function FileCard({
  item,
  onSelectLevel,
  onDownload,
  onRemove,
}: FileCardProps): ReactElement {
  const { locale, t } = useLocale();
  const { detected } = item;
  const selectedOutcome = item.matrix[item.selectedLevel];
  const canDownload =
    (item.status === "ready" || item.status === "done") && typeof selectedOutcome !== "string";

  const statusText =
    item.status === "estimating"
      ? t("status.estimating")
      : item.status === "ready"
        ? t("status.ready")
        : item.status === "compressing"
          ? t("status.compressing")
          : item.status === "done"
            ? t("status.done")
            : t("status.error");

  return (
    <li className="file-card">
      <div className="fc-top">
        <span
          className={detected === null ? "f-ico f-unknown" : FAMILY_ICON_CLASS[detected.family]}
        >
          {detected === null ? "?" : FAMILY_ICON_TEXT[detected.family]}
        </span>
        <div className="f-meta">
          <div className="f-name">{item.file.name}</div>
          <div className="f-sub">
            {formatBytes(item.file.size, locale)}
            {detected !== null && (
              <span>
                {t(familyMessageKey(detected.family))} · {detected.format.toUpperCase()}
              </span>
            )}
          </div>
        </div>
        <div className="fc-actions">
          <button
            type="button"
            className="btn-download"
            disabled={!canDownload}
            onClick={() => {
              onDownload(item);
            }}
          >
            {t("card.download")}
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={`${t("card.remove")} ${item.file.name}`}
            onClick={() => {
              onRemove(item.id);
            }}
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {detected !== null && item.status !== "error" && (
        <fieldset className="levels">
          <legend className="sr-only">{`${t("card.levelLegend")} ${item.file.name}`}</legend>
          {COMPRESSION_LEVELS.map((level) => (
            <label
              key={level}
              className={
                item.selectedLevel === level ? "level-tile level-tile-selected" : "level-tile"
              }
            >
              <input
                type="radio"
                className="sr-only"
                name={`level-${item.id}`}
                checked={item.selectedLevel === level}
                onChange={() => {
                  onSelectLevel(item.id, level);
                }}
              />
              <span className="level-name">{t(levelMessageKey(level))}</span>
              <span className="level-desc">{t(levelDescMessageKey(level))}</span>
              <LevelCell outcome={item.matrix[level]} />
            </label>
          ))}
        </fieldset>
      )}

      {item.status === "error" && item.errorCode !== null && (
        <p className="card-error">{t(errorMessageKey(item.errorCode))}</p>
      )}

      <p
        className={`status-line${item.status === "done" ? " status-done" : ""}${item.status === "error" ? " status-error" : ""}`}
        aria-live="polite"
      >
        {item.status === "done" && <CheckIcon />}
        {statusText}
      </p>
    </li>
  );
}
