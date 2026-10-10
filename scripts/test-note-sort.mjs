import assert from "node:assert/strict";
import { build } from "esbuild";

const result = await build({ entryPoints: ["src/lib/noteSort.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { sortNotes, readNoteSort, writeNoteSort, parseNoteSort, NOTE_SORT_KEY } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
const note = (id, title, createdAt, modifiedAt) => ({ id, title, notebookPath: "Book", createdAt, modifiedAt });
const notes = [
  note("Book/C", "笔记10", "2025-01-03T00:00:00Z", "2025-01-01T00:00:00Z"),
  note("Book/A", "笔记2", "2025-01-01T08:00:00+08:00", "2025-01-03T00:00:00Z"),
  note("Book/B", "笔记3", "2025-01-02T00:00:00Z", "2025-01-02T00:00:00Z"),
];
const ids = order => sortNotes(notes, order).map(note => note.id);
assert.deepEqual(ids("manual"), ["Book/C", "Book/A", "Book/B"]);
for (const order of ["created-asc", "modified-desc", "name-asc"]) assert.deepEqual(ids(order), ["Book/A", "Book/B", "Book/C"]);
for (const order of ["created-desc", "modified-asc", "name-desc"]) assert.deepEqual(ids(order), ["Book/C", "Book/B", "Book/A"]);
assert.deepEqual(notes.map(note => note.id), ["Book/C", "Book/A", "Book/B"], "Sorting must not mutate manual/sidebar order");
const missing = note("Book/D", "笔记1", null, "invalid");
for (const order of ["created-asc", "created-desc", "modified-asc", "modified-desc"]) {
  assert.equal(sortNotes([missing, ...notes], order).at(-1).id, "Book/D");
}
const ties = [note("Book/Z", "Same", "2025-01-01T08:00:00+08:00"), note("Book/Y", "Same", "2025-01-01T00:00:00Z")];
assert.deepEqual(sortNotes(ties, "created-asc").map(note => note.id), ["Book/Y", "Book/Z"]);
assert.deepEqual(sortNotes([...ties].reverse(), "created-desc").map(note => note.id), ["Book/Y", "Book/Z"]);
assert.deepEqual(sortNotes([], "name-desc"), []);
assert.equal(parseNoteSort("corrupt"), "manual");
const cache = new Map();
globalThis.localStorage = { getItem: key => cache.get(key), setItem: (key, value) => cache.set(key, value) };
assert.equal(readNoteSort(), "manual");
writeNoteSort("modified-desc"); assert.equal(readNoteSort(), "modified-desc");
cache.set(NOTE_SORT_KEY, "corrupt"); assert.equal(readNoteSort(), "manual");
globalThis.localStorage = { getItem() { throw Error("unavailable"); }, setItem() { throw Error("unavailable"); } };
assert.equal(readNoteSort(), "manual"); assert.doesNotThrow(() => writeNoteSort("name-asc"));
console.log("Passed: creation/modification/name sorting, natural numbers, time zones, deterministic ties, missing dates, manual order and preference persistence.");

const favorites = new Set(["note:Book/B", "note:Book/C", "notebook:Book", "note:Deleted"]);
assert.deepEqual(sortNotes(notes, "manual", favorites).map(note => note.id), ["Book/C", "Book/B", "Book/A"]);
assert.deepEqual(sortNotes(notes, "manual", new Set(["note:Book/B"])).map(note => note.id), ["Book/B", "Book/C", "Book/A"]);
assert.deepEqual(sortNotes(notes, "manual", new Set()).map(note => note.id), ["Book/C", "Book/A", "Book/B"]);
assert.deepEqual(sortNotes(notes, "name-asc", favorites).map(note => note.id), ["Book/A", "Book/B", "Book/C"]);
assert.deepEqual(notes.map(note => note.id), ["Book/C", "Book/A", "Book/B"]);
console.log("Passed: favorites first in default order, stable order within groups, removing favorites and explicit sort preservation.");
