import { useEffect } from "react";
import "./Dialog.css";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "确定",
  cancelLabel = "取消",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onConfirm]);

  return (
    <div className="mn-dialog-backdrop" onMouseDown={onCancel}>
      <div
        className="mn-dialog"
        data-no-window-drag
        role="alertdialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="mn-dialog__title">{title}</h3>
        <p className="mn-dialog__message">{message}</p>
        <div className="mn-dialog__actions">
          <button type="button" className="mn-dialog__btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`mn-dialog__btn is-primary${danger ? " is-danger" : ""}`}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
