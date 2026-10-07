import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import * as api from "@/lib/api";
import type { NoteVersionInfo } from "@/types/library";
import "./NoteHistoryPanel.css";

type Props = {
  notePath: string;
  open: boolean;
  onClose: () => void;
  onRestore: (content: string) => void;
};

export function NoteHistoryPanel({
  notePath,
  open,
  onClose,
  onRestore,
}: Props) {
  const [items, setItems] = useState<NoteVersionInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    void api
      .listNoteVersions(notePath)
      .then((list) => {
        if (cancelled) return;
        setItems(list);
        setSelectedId(list[0]?.id ?? null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
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
      setPreview("");
      return;
    }
    let cancelled = false;
    void api
      .readNoteVersion(notePath, selectedId)
      .then((body) => {
        if (!cancelled) setPreview(body);
      })
      .catch((e) => {
        if (!cancelled) {
          setPreview("");
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, notePath, selectedId]);

  if (!open) return null;

  return (
    <div className="mn-history" role="dialog" aria-label="历史版本">
      <aside className="mn-history__list">
        <header className="mn-history__head">
          <strong>历史版本</strong>
          <button type="button" title="关闭" onClick={onClose}>
            <Icon name="x-mark" size={12} />
          </button>
        </header>
        {busy ? <p className="mn-history__hint">加载中…</p> : null}
        {error ? <p className="mn-history__err">{error}</p> : null}
        {!busy && !items.length ? (
          <p className="mn-history__hint">暂无历史版本。编辑并保存后会自动生成。</p>
        ) : null}
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={selectedId === item.id ? "is-on" : ""}
                onClick={() => setSelectedId(item.id)}
              >
                <span className="mn-history__time">{item.createdAt}</span>
                <span className="mn-history__preview">{item.preview}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="mn-history__detail">
        <header className="mn-history__detail-head">
          <span>{selectedId ? "版本预览" : "选择一个版本"}</span>
          <button
            type="button"
            className="mn-history__restore"
            disabled={!selectedId || !preview}
            onClick={() => {
              if (!selectedId) return;
              void (async () => {
                try {
                  const body = await api.restoreNoteVersion(notePath, selectedId);
                  onRestore(body);
                  onClose();
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                }
              })();
            }}
          >
            恢复此版本
          </button>
        </header>
        <pre className="mn-history__body">{preview || "—"}</pre>
      </section>
    </div>
  );
}
