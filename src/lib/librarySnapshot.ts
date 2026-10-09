import type { LibraryNotebook, LibraryNote } from "@/types/library";

function sameFields(a: object, b: object) {
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => left[key] === right[key]);
}

/** Reuse unchanged branches so periodic disk checks don't rerender every note. */
export function reconcileNotebooks(previous: LibraryNotebook[], next: LibraryNotebook[]): LibraryNotebook[] {
  const byId = new Map(previous.map(book => [book.id, book]));
  const result = next.map(book => {
    const old = byId.get(book.id);
    if (!old) return book;
    const children = reconcileNotebooks(old.children, book.children);
    const notesById = new Map(old.notes.map(note => [note.id, note]));
    let notes: LibraryNote[] = book.notes.map(note => {
      const before = notesById.get(note.id);
      return before && sameFields(before, note) ? before : note;
    });
    if (notes.length === old.notes.length && notes.every((note, i) => note === old.notes[i])) notes = old.notes;
    const shared = { ...book, children, notes };
    return sameFields(old, shared) ? old : shared;
  });
  return result.length === previous.length && result.every((book, i) => book === previous[i]) ? previous : result;
}
