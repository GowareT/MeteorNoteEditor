import { t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import type { LibraryNotebook } from "@/types/library";
import "./Dialog.css";

interface MoveTargetDialogProps {
  title: string;
  notebooks: LibraryNotebook[];
  excludePaths?: string[];
  onConfirm: (notebookPath: string) => void;
  onCancel: () => void;
}

function flattenNotebooks(
  nodes: LibraryNotebook[],
  depth = 0,
): { id: string; name: string; depth: number }[] {
  const out: { id: string; name: string; depth: number }[] = [];
  for (const n of nodes) {
    out.push({ id: n.id, name: n.name, depth });
    out.push(...flattenNotebooks(n.children, depth + 1));
  }
  return out;
}

export function MoveTargetDialog({
  title,
  notebooks,
  excludePaths = [],
  onConfirm,
  onCancel,
}: MoveTargetDialogProps) {
  const options = flattenNotebooks(notebooks).filter(
    (n) => !excludePaths.some((ex) => n.id === ex || n.id.startsWith(`${ex}/`)),
  );
  const [selected, setSelected] = useState(options[0]?.id ?? "");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="mn-dialog-backdrop" onMouseDown={onCancel}>
      <div
        className="mn-dialog"
        data-no-window-drag
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="mn-dialog__title">{title}</h3>
        <div className="mn-dialog__list">
          {options.length === 0 ? (
            <p className="mn-dialog__empty">{t("没有可用的目标笔记本")}</p>
          ) : (
            options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`mn-dialog__list-item${
                  selected === opt.id ? " is-selected" : ""
                }`}
                style={{ paddingLeft: 10 + opt.depth * 14 }}
                onClick={() => setSelected(opt.id)}
                onDoubleClick={() => onConfirm(opt.id)}
              >
                {opt.name}
              </button>
            ))
          )}
        </div>
        <div className="mn-dialog__actions">
          <button type="button" className="mn-dialog__btn" onClick={onCancel}>
            {t("取消")}</button>
          <button
            type="button"
            className="mn-dialog__btn is-primary"
            disabled={!selected}
            onClick={() => selected && onConfirm(selected)}
          >
            {t("移动")}</button>
        </div>
      </div>
    </div>
  );
}
