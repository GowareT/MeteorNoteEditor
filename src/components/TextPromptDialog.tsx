import { t } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import "./Dialog.css";

interface TextPromptDialogProps {
  title: string;
  label?: string;
  initialValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function TextPromptDialog({
  title,
  label,
  initialValue = "",
  confirmLabel = t("保存"),
  onConfirm,
  onCancel,
}: TextPromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="mn-dialog-backdrop" onMouseDown={onCancel}>
      <form
        className="mn-dialog"
        data-no-window-drag
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          const next = value.trim();
          if (!next) return;
          onConfirm(next);
        }}
      >
        <h3 className="mn-dialog__title">{title}</h3>
        {label ? <label className="mn-dialog__label">{label}</label> : null}
        <input
          ref={inputRef}
          className="mn-dialog__input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="mn-dialog__actions">
          <button type="button" className="mn-dialog__btn" onClick={onCancel}>
            {t("取消")}</button>
          <button
            type="submit"
            className="mn-dialog__btn is-primary"
            disabled={!value.trim()}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
