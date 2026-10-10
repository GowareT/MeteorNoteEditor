import { getLocale, t } from "@/lib/i18n";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Upload, ChevronDown, Star } from "lucide-react";
import { ContextMenu } from "@/components/ContextMenu";
import { useLibraryTransfer } from "@/hooks/useLibraryTransfer";
import { LibraryIcon } from "@/components/LibraryIcon";
import { pageKey, useAppStore } from "@/store/appStore";
import type { LibraryNotebook } from "@/types/library";
import { NOTE_SORT_OPTIONS, NOTE_SORT_KEY, NOTE_SORT_EVENT, parseNoteSort, readNoteSort, writeNoteSort, sortNotes } from "@/lib/noteSort";
import "./NotebookView.css";

const noteTimeFormat = () => new Intl.DateTimeFormat(getLocale(), {
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function NoteTime({ value }: { value?: string | null }) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return <span>{t("未知")}</span>;
  return <time dateTime={date.toISOString()}>{noteTimeFormat().format(date)}</time>;
}

export function NotebookView({notebookPath}: {notebookPath?: string}) {
  const notebooks = useAppStore(s => s.notebooks);
  const favoriteKeys = useAppStore(s => s.favoriteKeys);
  const select = useAppStore(s => s.select);
  const createNote = useAppStore(s => s.createQuickNote);
  const createNoteIn = useAppStore(s => s.createNoteInNotebook);
  const [order, setOrder] = useState(readNoteSort);
  const transfer = useLibraryTransfer(undefined, notebookPath);
  const [importMenu, setImportMenu] = useState<{x: number; y: number} | null>(null);
  useEffect(() => {
    const sync = (event: Event) => setOrder(parseNoteSort((event as CustomEvent).detail));
    const syncStorage = (event: StorageEvent) => {
      if (event.key === NOTE_SORT_KEY || event.key === null) setOrder(readNoteSort());
    };
    window.addEventListener(NOTE_SORT_EVENT, sync);
    window.addEventListener("storage", syncStorage);
    return () => {
      window.removeEventListener(NOTE_SORT_EVENT, sync);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);
  const notes = useMemo(() => {
    const walk = (nodes: LibraryNotebook[]): LibraryNotebook["notes"] => nodes.flatMap(node => [
      ...(!notebookPath || node.id === notebookPath || node.id.startsWith(`${notebookPath}/`) ? node.notes : []),
      ...walk(node.children),
    ]);
    return sortNotes(walk(notebooks), order, favoriteKeys);
  }, [notebooks, notebookPath, order, favoriteKeys]);
  return <div className="mn-page mne-notebook-page">
    <header className="mn-panel-header mne-notes-header">
      <div><h2>{notebookPath?.split('/').pop() ?? t("笔记")}</h2><p>{t("{0} 篇笔记", notes.length)}</p></div>
      <div className="mne-notes-actions">
        <label className="mne-notes-sort">{t("排序")}<select aria-label={t("笔记排序")} value={order} onChange={event => {
            const next = parseNoteSort(event.target.value);
            setOrder(next);
            writeNoteSort(next);
            window.dispatchEvent(new CustomEvent(NOTE_SORT_EVENT, { detail: next }));
          }}>
            {NOTE_SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <button className="mn-toolbar-btn" onClick={() => void (notebookPath ? createNoteIn(notebookPath) : createNote())}><Icon name="plus" size={14} />{t("新建笔记")}</button>
      </div>
    </header>
    <ul className="mne-notes">
      {notes.map(note => <li key={note.id}><button onClick={() => void select({note: note.id})}>
        <LibraryIcon id={note.icon} size={20} fallback="document" />
        <span>
          <strong className="mne-note-title">{note.title}{favoriteKeys.has(pageKey({ note: note.id })) && <Star className="mne-note-star" size={14} fill="currentColor" role="img" aria-label={t("已收藏")} />}</strong>
          <small>{note.notebookPath}</small>
          <small className="mne-notes-dates">
            <span>{t("创建时间：")}<NoteTime value={note.createdAt} /></span>
            <span>{t("更新时间：")}<NoteTime value={note.modifiedAt} /></span>
          </small>
        </span>
        <Icon name="chevron-right" size={14} />
      </button></li>)}
    </ul>
    {!notes.length && <div className="mn-empty"><Icon name="document-text" size={36} /><h3>{t("暂无笔记")}</h3></div>}
    {notebookPath && <footer className="mne-notebook-footer">
      <div className="mne-notebook-import-status">
        {transfer.busy && <p role="status">{t("正在导入到「{0}」…", notebookPath)}</p>}
        {transfer.message && <p role="status">{transfer.message}</p>}
        {transfer.error && <p className="mn-error" role="alert">{transfer.error}</p>}
      </div>
      <button className="mn-toolbar-btn mne-notebook-import" disabled={transfer.busy}
        aria-haspopup="menu" aria-expanded={!!importMenu} title={t("导入 Markdown 到「{0}」", notebookPath)}
        onClick={event => {
          const rect = event.currentTarget.getBoundingClientRect();
          setImportMenu(importMenu ? null : {x: rect.left, y: rect.bottom + 4});
        }}><Upload size={15} />{transfer.busy ? t("导入中…") : t("导入")}<ChevronDown size={13} /></button>
    </footer>}
    {importMenu && notebookPath && <ContextMenu {...importMenu} onClose={() => setImportMenu(null)} items={[
      {id: "import-files", label: t("Markdown 文件…"), description: t("选择一个或多个文件，导入当前笔记本"), onSelect: () => void transfer.run("files")},
      {id: "import-folder", label: t("文件夹中的 Markdown…"), description: t("批量导入，并保留子文件夹层级"), onSelect: () => void transfer.run("folder")},
    ]} />}
  </div>;
}
