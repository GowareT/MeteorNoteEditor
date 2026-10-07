import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { LibraryIcon } from "@/components/LibraryIcon";
import { useAppStore } from "@/store/appStore";
import type { LibraryNotebook } from "@/types/library";
import { NOTE_SORT_OPTIONS, NOTE_SORT_KEY, NOTE_SORT_EVENT, parseNoteSort, readNoteSort, writeNoteSort, sortNotes } from "@/lib/noteSort";
import "./NotebookView.css";

const noteTimeFormat = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function NoteTime({ value }: { value?: string | null }) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return <span>未知</span>;
  return <time dateTime={date.toISOString()}>{noteTimeFormat.format(date)}</time>;
}

export function NotebookView({notebookPath}: {notebookPath?: string}) {
  const notebooks = useAppStore(s => s.notebooks);
  const select = useAppStore(s => s.select);
  const createNote = useAppStore(s => s.createQuickNote);
  const createNoteIn = useAppStore(s => s.createNoteInNotebook);
  const [order, setOrder] = useState(readNoteSort);
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
    return sortNotes(walk(notebooks), order);
  }, [notebooks, notebookPath, order]);
  return <div className="mn-page">
    <header className="mn-panel-header mne-notes-header">
      <div><h2>{notebookPath?.split('/').pop() ?? "笔记"}</h2><p>{notes.length} 篇笔记</p></div>
      <div className="mne-notes-actions">
        <label className="mne-notes-sort">排序
          <select aria-label="笔记排序" value={order} onChange={event => {
            const next = parseNoteSort(event.target.value);
            setOrder(next);
            writeNoteSort(next);
            window.dispatchEvent(new CustomEvent(NOTE_SORT_EVENT, { detail: next }));
          }}>
            {NOTE_SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <button className="mn-toolbar-btn" onClick={() => void (notebookPath ? createNoteIn(notebookPath) : createNote())}><Icon name="plus" size={14} />新建笔记</button>
      </div>
    </header>
    <ul className="mne-notes">
      {notes.map(note => <li key={note.id}><button onClick={() => void select({note: note.id})}>
        <LibraryIcon id={note.icon} size={20} fallback="document" />
        <span>
          <strong>{note.title}</strong>
          <small>{note.notebookPath}</small>
          <small className="mne-notes-dates">
            <span>创建时间：<NoteTime value={note.createdAt} /></span>
            <span>更新时间：<NoteTime value={note.modifiedAt} /></span>
          </small>
        </span>
        <Icon name="chevron-right" size={14} />
      </button></li>)}
    </ul>
    {!notes.length && <div className="mn-empty"><Icon name="document-text" size={36} /><h3>暂无笔记</h3></div>}
  </div>;
}
