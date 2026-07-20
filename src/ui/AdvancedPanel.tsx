import { useCallback, useId, useState } from "react";
import type { ChangeEvent, ReactElement } from "react";
import type { ConvertFormat } from "../core/types";
import { useLocale } from "../i18n/locale-context";
import { DEFAULT_OVERRIDES } from "./queue-model";
import type { AdvancedOverrides } from "./queue-model";

interface AdvancedPanelProps {
  /** Called with the parsed overrides when the user applies (or resets) them. */
  onApply: (overrides: AdvancedOverrides) => void;
}

const CONVERT_FORMATS: readonly ConvertFormat[] = ["webp", "avif", "jpeg"];

function isConvertFormat(value: string): value is ConvertFormat {
  return (CONVERT_FORMATS as readonly string[]).includes(value);
}

function parseBoundedInt(raw: string, min: number, max: number): number | null {
  if (raw.trim() === "") return null;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return null;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * Collapsible advanced settings. Values are drafted locally and only reach the
 * queue on "Apply and re-estimate": re-estimating every file on each keystroke
 * would hammer the compression worker for nothing.
 */
export function AdvancedPanel({ onApply }: AdvancedPanelProps): ReactElement {
  const { t } = useLocale();
  const [quality, setQuality] = useState("");
  const [maxDimension, setMaxDimension] = useState("");
  const [convertFormat, setConvertFormat] = useState("");
  const qualityId = useId();
  const dimensionId = useId();
  const formatId = useId();

  const handleApply = useCallback(() => {
    onApply({
      imageQuality: parseBoundedInt(quality, 1, 100),
      maxDimension: parseBoundedInt(maxDimension, 16, 100_000),
      convertFormat: isConvertFormat(convertFormat) ? convertFormat : null,
    });
  }, [convertFormat, maxDimension, onApply, quality]);

  const handleReset = useCallback(() => {
    setQuality("");
    setMaxDimension("");
    setConvertFormat("");
    onApply(DEFAULT_OVERRIDES);
  }, [onApply]);

  const handleFormatChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    setConvertFormat(event.target.value);
  }, []);

  return (
    <details className="advanced">
      <summary>{t("advanced.title")}</summary>
      <div className="adv-body">
        <p className="adv-note">{t("advanced.note")}</p>
        <div className="adv-grid">
          <div className="field">
            <label htmlFor={qualityId}>{t("advanced.quality")}</label>
            <input
              id={qualityId}
              type="number"
              min={1}
              max={100}
              value={quality}
              onChange={(event) => {
                setQuality(event.target.value);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor={dimensionId}>{t("advanced.maxDimension")}</label>
            <input
              id={dimensionId}
              type="number"
              min={16}
              value={maxDimension}
              onChange={(event) => {
                setMaxDimension(event.target.value);
              }}
            />
          </div>
          <div className="field">
            <label htmlFor={formatId}>{t("advanced.format")}</label>
            <select id={formatId} value={convertFormat} onChange={handleFormatChange}>
              <option value="">{t("advanced.formatKeep")}</option>
              {CONVERT_FORMATS.map((format) => (
                <option key={format} value={format}>
                  {format.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="adv-actions">
          <button type="button" className="btn btn-primary" onClick={handleApply}>
            {t("advanced.apply")}
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleReset}>
            {t("advanced.reset")}
          </button>
        </div>
      </div>
    </details>
  );
}
