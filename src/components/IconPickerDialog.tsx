import { useRef } from "react";
import { LIBRARY_ICONS } from "@/lib/libraryIcons";
import { LibraryIcon } from "@/components/LibraryIcon";
import "./IconPickerDialog.css";

const ICON_IDS = LIBRARY_ICONS;

export type IconPickerResult = {
  icon: string;
};

export function IconPickerDialog({
  kind: _kind,
  title,
  current,
  onCancel,
  onPick,
}: {
  kind: "notebook" | "note";
  title: string;
  current?: string | null;
  onCancel: () => void;
  onPick: (result: IconPickerResult) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const upload = () => {
    inputRef.current?.click();
  };

  const readFile = async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    onPick({ icon: dataUrl });
  };

  return (
    <div className="mn-modal" role="presentation" onMouseDown={onCancel}>
      <div
        className="mn-modal__card mn-icon-picker"
        role="dialog"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="mn-icon-picker__head">
          <div>
            <h3>{title}</h3>
            <p className="mn-icon-picker__sub">
              选择一个内置图标，或上传自定义图片作为图标。
            </p>
          </div>
          <button type="button" className="mn-toolbar-btn" onClick={onCancel}>
            取消
          </button>
        </header>

        <section className="mn-icon-picker__section">
          <div className="mn-icon-picker__section-head">
            <h4>图标</h4>
            <button type="button" className="mn-toolbar-btn" onClick={upload}>
              上传图标
            </button>
          </div>
          <input
            ref={inputRef}
            className="mn-icon-picker__file"
            type="file"
            accept="image/png,image/svg+xml,image/jpeg,image/webp,image/x-icon,.ico"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = "";
              if (!file) return;
              await readFile(file);
            }}
          />
          <div className="mn-icon-picker__preview-row">
            <div className="mn-icon-picker__preview">
                <LibraryIcon
                  id={current ?? "document"}
                  size={28}
                  fallback="document"
                />
            </div>
            <p className="mn-muted">上传图片会替换当前图标。</p>
          </div>
          <div className="mn-icon-picker__grid mn-icon-picker__grid--wide">
            {ICON_IDS.map((icon) => {
              const on = current === icon.id;
              return (
                <button
                  key={icon.id}
                  type="button"
                  className={`mn-icon-picker__cell${on ? " is-on" : ""}`}
                  title={icon.label}
                  onClick={() => onPick({ icon: icon.id })}
                >
                  <LibraryIcon id={icon.id} size={28} />
                  <span>{icon.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <p className="mn-icon-picker__license">
          图标为 MeteorNote 原创彩色 SVG，MIT 协议，可商用。详见{" "}
          <code>src/assets/library-icons/LICENSE.md</code>
        </p>
      </div>
    </div>
  );
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("无法读取图标文件"));
    reader.readAsDataURL(file);
  });
}
