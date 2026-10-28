import { getLocale, t } from "@/lib/i18n";
import type { LibraryNote } from "@/types/library";

export const NOTE_SORT_OPTIONS = [
  // Keep the stored value compatible with existing default-sort preferences.
  { value: "manual", get label() { return t("默认：最新在前"); } },
  { value: "modified-desc", get label() { return t("修改时间：最新在前"); } },
  { value: "modified-asc", get label() { return t("修改时间：最早在前"); } },
  { value: "created-desc", get label() { return t("创建时间：最新在前"); } },
  { value: "created-asc", get label() { return t("创建时间：最早在前"); } },
  { value: "name-asc", get label() { return t("名称：升序"); } },
  { value: "name-desc", get label() { return t("名称：降序"); } },
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


function timestamp(value?: string | null): number | null {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : null;
}

export function sortNotes(notes: readonly LibraryNote[], order: NoteSort, favoriteKeys: ReadonlySet<string> = new Set()): LibraryNote[] {
  const names = new Intl.Collator(getLocale(), { numeric: true, sensitivity: "base" });
  const result = [...notes];
  const isDefault = order === "manual";
  const direction = isDefault || order.endsWith("-desc") ? -1 : 1;
  return result.sort((a, b) => {
    if (isDefault) {
      const byFavorite = Number(favoriteKeys.has(`note:${b.id}`)) - Number(favoriteKeys.has(`note:${a.id}`));
      if (byFavorite) return byFavorite;
    }
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
