import assert from "node:assert/strict";
import { build } from "esbuild";
const built = await build({ entryPoints: ["src/lib/documentSessions.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { DocumentSessions } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
const disk = new Map([["Book/A", "original"], ["Book/B", "second"]]);
const writes = [];
let failed = false;
let saved = [];
let pause;
const transport = {
  read: async path => { if (!disk.has(path)) throw Error("missing"); return disk.get(path); },
  write: async (path, text, expected) => {
    if (pause) { const wait = pause; pause = undefined; await wait; }
    if (failed) throw Error("disk full");
    if (disk.get(path) !== expected && disk.get(path) !== text) throw Error("CONFLICT: external edit");
    writes.push([path, text]); disk.set(path, text);
  },
};
const sessions = new DocumentSessions(transport, entries => { saved = structuredClone(entries); });
await sessions.open("Book/A");
sessions.stage("Book/A", "first");
assert.equal(saved[0].draft, "first");
let resume;
pause = new Promise(resolve => { resume = resolve; });
const saving = sessions.save("Book/A");
sessions.stage("Book/A", "latest");
resume(); await saving;
assert.equal(disk.get("Book/A"), "latest");
assert.deepEqual(writes, [["Book/A", "first"], ["Book/A", "latest"]]);
assert.equal(saved.length, 0);

await sessions.open("Book/B"); sessions.stage("Book/B", "unsaved B");
failed = true;
await assert.rejects(sessions.flush(), /disk full/);
assert.equal(sessions.documents.get("Book/B").draft, "unsaved B");
assert.equal(saved[0].draft, "unsaved B");
failed = false; await sessions.flush();
assert.equal(disk.get("Book/B"), "unsaved B");

disk.set("Book/A", "outside"); await sessions.checkExternal("Book/A");
assert.equal(sessions.documents.get("Book/A").draft, "outside");
sessions.stage("Book/A", "my editing"); disk.set("Book/A", "another window");
await sessions.checkExternal("Book/A");
assert.equal(sessions.documents.get("Book/A").draft, "my editing");
assert.match(sessions.documents.get("Book/A").error, /CONFLICT/);
await assert.rejects(sessions.save("Book/A"), /CONFLICT/);
assert.equal(disk.get("Book/A"), "another window");

const recovered = new DocumentSessions(transport);
recovered.recover(saved);
assert.equal(await recovered.open("Book/A"), "my editing");
await assert.rejects(recovered.flush(), /CONFLICT/);
await sessions.useDisk("Book/A");
assert.equal(sessions.documents.get("Book/A").draft, "another window");
assert.equal(saved.length, 0);
sessions.remap("Book", "Renamed");
assert.ok(sessions.documents.has("Renamed/A"));
sessions.forget("Renamed");
assert.equal(sessions.documents.size, 0);
console.log("Passed: serialized latest-draft saving, flush failure, durable draft cache, recovery, external refresh, conflicts, remap and deletion.");

// A rename in another window must preserve the current draft and its save baseline.
const renameDisk = new Map([["Book/Old", "# Old\nbody"]]);
let holdRead, holdWrite;
const renamed = new DocumentSessions({
  read: async path => {
    if (holdRead) { const wait = holdRead; holdRead = null; await wait; }
    if (!renameDisk.has(path)) throw Error("missing");
    return renameDisk.get(path);
  },
  write: async (path, content, expected) => {
    if (holdWrite) { const wait = holdWrite; holdWrite = null; await wait; }
    if (!renameDisk.has(path)) throw Error("missing");
    if (renameDisk.get(path) !== expected) throw Error("CONFLICT: external edit");
    renameDisk.set(path, content);
  },
});
await renamed.open("Book/Old");
renamed.stage("Book/Old", "# Old\nunsaved B");
let releaseWrite;
holdWrite = new Promise(resolve => { releaseWrite = resolve; });
const oldSave = renamed.save("Book/Old").catch(() => {});
renameDisk.delete("Book/Old"); renameDisk.set("Book/New", "# New\nbody");
const relocation = renamed.relocate({ from: "Book/Old", to: "Book/New", kind: "note", before: "# Old\nbody", after: "# New\nbody" });
renamed.stage("Book/Old", "# Old\nlatest B");
releaseWrite(); await oldSave; await relocation;
assert.equal(renamed.documents.has("Book/Old"), false);
assert.equal(renamed.documents.get("Book/New").draft, "# New\nlatest B");
await renamed.flush();
assert.equal(renameDisk.get("Book/New"), "# New\nlatest B");

// An old polling request must not poison the session after its path moves.
let releaseRead;
holdRead = new Promise(resolve => { releaseRead = resolve; });
const polling = renamed.checkExternal("Book/New");
renameDisk.delete("Book/New"); renameDisk.set("Moved/New", "# New\nlatest B");
await renamed.relocate({ from: "Book", to: "Moved", kind: "notebook" });
releaseRead(); await polling;
assert.equal(renamed.documents.get("Moved/New").error, undefined);

// Renaming must not turn an actual divergent edit into permission to overwrite it.
renamed.stage("Moved/New", "# New\nmy divergent draft");
renameDisk.delete("Moved/New"); renameDisk.set("Moved/Final", "# Final\nexternal change");
await renamed.relocate({ from: "Moved/New", to: "Moved/Final", kind: "note", before: "# New\nexternal change", after: "# Final\nexternal change" });
await renamed.checkExternal("Moved/Final");
assert.match(renamed.documents.get("Moved/Final").error, /CONFLICT/);
await assert.rejects(renamed.flush(), /CONFLICT/);
assert.equal(renameDisk.get("Moved/Final"), "# Final\nexternal change");
console.log("Passed: cross-window note/notebook relocation, pending writes and reads, latest draft preservation and genuine conflicts.");
