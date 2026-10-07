import type { LibraryNote } from "@/types/library";

export const NOTE_SORT_OPTIONS = [
  { value: "manual", label: "默认顺序" },
  { value: "modified-desc", label: "修改时间：最新在前" },
  { value: "modified-asc", label: "修改时间：最早在前" },
  { value: "created-desc", label: "创建时间：最新在前" },
  { value: "created-asc", label: "创建时间：最早在前" },
  { value: "name-asc", label: "名称：升序" },
  { value: "name-desc", label: "名称：降序" },
] as const;
export type NoteSort = typeof NOTE_SORT_OPTIONS[number]["value"];
export const NOTE_SORT_KEY = "meteornote-editor.noteSort";
export const NOTE_SORT_EVENT = "mne-note-sort-changed";

export function parseNoteSort(value: unknown): NoteSort {
  return NOTE_SORT_OPTIONS.some(option => option.value === value) ? value as NoteSort : "manual";
}
export function readNoteSort(): NoteSort {
  try { return parseNoteSort(localStorage.getItem(NOTE_SORT_KEY)); }
  catch { return "manual"; }
}
export function writeNoteSort(value: NoteSort) {
  try { localStorage.setItem(NOTE_SORT_KEY, value); }
  catch { /* Sorting remains available when preference storage is unavailable. */ }
}

const names = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
function timestamp(value?: string | null): number | null {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : null;
}

export function sortNotes(notes: readonly LibraryNote[], order: NoteSort): LibraryNote[] {
  const result = [...notes];
  if (order === "manual") return result;
  const direction = order.endsWith("-desc") ? -1 : 1;
  return result.sort((a, b) => {
    const byName = names.compare(a.title, b.title);
    const tie = byName || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    if (order.startsWith("name-")) return byName * direction || tie;
    const field = order.startsWith("created-") ? "createdAt" : "modifiedAt";
    const left = timestamp(a[field]), right = timestamp(b[field]);
    // Missing or invalid timestamps stay at the end in either direction.
    if (left === null) return right === null ? tie : 1;
    if (right === null) return -1;
    return (left - right) * direction || tie;
  });
}
