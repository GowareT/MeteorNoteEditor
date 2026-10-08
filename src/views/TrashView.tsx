import { getLocale, t, errorMessage } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import * as api from "@/lib/api";
import { useAppStore } from "@/store/appStore";
import type { LibraryTrashItem } from "@/types/library";
import "@/styles/pages.css";

const trashTimeFormat = () => new Intl.DateTimeFormat(getLocale(), {
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function TrashTime({ value }: { value?: string | null }) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return <span>{t("未知")}</span>;
  return <time dateTime={date.toISOString()}>{trashTimeFormat().format(date)}</time>;
}

export function TrashItemDates({ item }: { item: Pick<LibraryTrashItem, "createdAt" | "trashedAt"> }) {
  return (
    <div className="mn-trash-list__dates">
      <span>{t("创建时间：")}<TrashTime value={item.createdAt} /></span>
      <span>{t("删除时间：")}<TrashTime value={item.trashedAt} /></span>
    </div>
  );
}

export function TrashView() {
  const [items, setItems] = useState<LibraryTrashItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      setItems(await api.listTrash());
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const mutate = async (action: () => Promise<void>) => {
    try {
      await action();
      await useAppStore.getState().refresh();
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  return (
    <div className="mn-page">
      <header className="mn-panel-header">
        <div>
          <h2>{t("回收站")}</h2>
          <p>
            {items.length === 0
              ? t("暂无已删除内容")
              : t("{0} 项 · 可恢复或彻底删除", items.length)}
          </p>
        </div>
        <div className="mn-graph__tools">
          {items.length > 0 ? (
            <button
              type="button"
              className="mn-toolbar-btn is-danger"
              onClick={async () => {
                if (!confirm(t("清空回收站？此操作不可恢复。"))) return;
                await mutate(api.emptyTrash);
              }}
            >
              {t("清空")}</button>
          ) : null}
        </div>
      </header>

      {error ? <p className="mn-error">{error}</p> : null}

      {items.length === 0 ? (
        <div className="mn-empty">
          <Icon name="trash" size={36} />
          <h3>{t("回收站是空的")}</h3>
          <p>{t("删除的笔记与笔记本会出现在这里。")}</p>
        </div>
      ) : (
        <ul className="mn-trash-list">
          {items.map((item) => (
            <li key={item.id}>
              <span className="mn-trash-list__icon">
                {item.kind === "note" ? <Icon name="document-text" size={16} /> : <Icon name="folder" size={16} />}
              </span>
              <div className="mn-trash-list__meta">
                <strong>{item.title}</strong>
                <small>{item.originalPath}</small>
                <TrashItemDates item={item} />
              </div>
              <button
                type="button"
                className="mn-toolbar-btn"
                onClick={async () => {
                  await mutate(() => api.restoreTrashItem(item.id));
                }}
              >
                <Icon name="arrow-path" size={14} /> {t("恢复")}</button>
              <button
                type="button"
                className="mn-toolbar-btn is-danger"
                onClick={async () => {
                  if (!confirm(t("彻底删除？"))) return;
                  await mutate(() => api.permanentlyDeleteTrashItem(item.id));
                }}
              >
                <Icon name="trash" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
