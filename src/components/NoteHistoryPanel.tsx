import { t, errorMessage } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { NoteMarkdownEditor } from "./NoteMarkdownEditor";
import { extractLeadingTitle } from "@/lib/noteTitle";
import * as api from "@/lib/api";
import type { NoteVersionInfo } from "@/types/library";
import "./NoteHistoryPanel.css";

type Props = {
  notePath: string;
  open: boolean;
  onClose: () => void;
  onRestore: (content: string) => void;
  libraryRootPath?: string | null;
  fontSize?: number;
};

export function NoteHistoryPanel({
  notePath,
  open,
  onClose,
  onRestore,
  libraryRootPath,
  fontSize,
}: Props) {
  const [items, setItems] = useState<NoteVersionInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{id: string; body: string} | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBusy(true);
    setItems([]);
    setSelectedId(null);
    setPreview(null);
    setError(null);
    void api
      .listNoteVersions(notePath)
      .then((list) => {
        if (cancelled) return;
        setItems(list);
        setSelectedId(list[0]?.id ?? null);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, notePath]);

  useEffect(() => {
    if (!open || !selectedId) {
      setPreview(null);
      setPreviewBusy(false);
      return;
    }
    let cancelled = false;
    setPreview(null);
    setError(null);
    setPreviewBusy(true);
    void api
      .readNoteVersion(notePath, selectedId)
      .then((body) => {
        if (!cancelled) setPreview({id: selectedId, body});
      })
      .catch((e) => {
        if (!cancelled) {
          setPreview(null);
          setError(errorMessage(e));
        }
      }).finally(() => { if (!cancelled) setPreviewBusy(false); });
    return () => {
      cancelled = true;
    };
  }, [open, notePath, selectedId]);

  if (!open) return null;

  return (
    <div className="mn-history" role="dialog" aria-label={t("历史版本")}>
      <aside className="mn-history__list">
        <header className="mn-history__head">
          <strong>{t("历史版本")}</strong>
          <button type="button" title={t("关闭")} onClick={onClose}>
            <Icon name="x-mark" size={12} />
          </button>
        </header>
        {busy ? <p className="mn-history__hint">{t("加载中…")}</p> : null}
        {error ? <p className="mn-history__err">{error}</p> : null}
        {!busy && !items.length ? (
          <p className="mn-history__hint">{t("暂无历史版本。编辑并保存后会自动生成。")}</p>
        ) : null}
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={restoring}
                className={selectedId === item.id ? "is-on" : ""}
                onClick={() => setSelectedId(item.id)}
              >
                <span className="mn-history__time">{item.createdAt}</span>
                <span className="mn-history__preview">{extractLeadingTitle(item.preview) ?? (item.preview === "(空)" ? t("(空)") : item.preview)}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="mn-history__detail">
        <header className="mn-history__detail-head">
          <span>{selectedId ? t("版本预览") : t("选择一个版本")}</span>
          <button
            type="button"
            className="mn-history__restore"
            disabled={!selectedId || preview?.id !== selectedId || previewBusy || restoring}
            onClick={() => {
              if (!selectedId || restoring || preview?.id !== selectedId) return;
              setRestoring(true);
              void (async () => {
                try {
                  const body = await api.restoreNoteVersion(notePath, selectedId);
                  onRestore(body);
                  onClose();
                } catch (e) {
                  setError(errorMessage(e));
                } finally { setRestoring(false); }
              })();
            }}
          >
            {t("恢复此版本")}</button>
        </header>
        <div className="mn-history__body" aria-label={t("历史版本内容")} aria-busy={previewBusy}>
          {previewBusy ? <p className="mn-history__hint" role="status">{t("加载中…")}</p>
            : preview?.id === selectedId && preview ? <NoteMarkdownEditor key={preview.id}
              value={preview.body} onChange={() => {}} readOnly notePath={notePath}
              libraryRootPath={libraryRootPath} fontSize={fontSize} placeholder="" /> : null}
        </div>
      </section>
    </div>
  );
}
