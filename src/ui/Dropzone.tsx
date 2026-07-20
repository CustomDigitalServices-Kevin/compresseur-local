import { useCallback, useEffect, useId, useState } from "react";
import type { ChangeEvent, DragEvent, ReactElement } from "react";
import { useLocale } from "../i18n/locale-context";
import { UploadIcon } from "./icons";

interface DropzoneProps {
  onFilesAdded: (files: File[]) => void;
}

// Every format the compressor accepts, shown as pills under the dropzone.
const ACCEPTED_FORMATS = ["png", "jpg", "webp", "avif", "pdf", "docx", "xlsx", "pptx"] as const;

/**
 * Multi-file input surface: drag and drop, click-to-browse, and clipboard
 * paste (a document-level listener, so pasting works anywhere on the page).
 */
export function Dropzone({ onFilesAdded }: DropzoneProps): ReactElement {
  const { t } = useLocale();
  const [isActive, setIsActive] = useState(false);
  const inputId = useId();

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsActive(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsActive(false);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsActive(false);
      const files = Array.from(event.dataTransfer.files);
      if (files.length > 0) onFilesAdded(files);
    },
    [onFilesAdded],
  );

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length > 0) onFilesAdded(files);
      event.target.value = "";
    },
    [onFilesAdded],
  );

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent): void => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length > 0) onFilesAdded(files);
    };
    document.addEventListener("paste", handlePaste);
    return () => {
      document.removeEventListener("paste", handlePaste);
    };
  }, [onFilesAdded]);

  return (
    <div
      className={isActive ? "dropzone dropzone-active" : "dropzone"}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-testid="dropzone"
    >
      <label htmlFor={inputId} className="dz-inner">
        <span className="dz-ico">
          <UploadIcon />
        </span>
        <span className="dz-title">
          {isActive ? t("dropzone.hintActive") : t("dropzone.title")}
        </span>
        <span className="dz-hint">{t("dropzone.hint")}</span>
        <span className="dz-formats">
          {ACCEPTED_FORMATS.map((format) => (
            <span key={format} className="fmt">
              {format}
            </span>
          ))}
        </span>
        <input
          id={inputId}
          type="file"
          multiple
          className="sr-only"
          aria-label={t("dropzone.browseLabel")}
          onChange={handleChange}
        />
      </label>
    </div>
  );
}
