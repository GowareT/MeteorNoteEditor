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

// Closing many notes must release clean text while keeping live editors and recovery data.
let reads = 0;
const bounded = new DocumentSessions({
  read: async path => { reads++; return `${path}\n${'正文'.repeat(16000)}`; },
  write: async () => {},
});
for (let i = 0; i < 200; i++) await bounded.open(`Book/${i}`);
bounded.stage('Book/199', 'unsaved text');
assert.equal(bounded.pruneClosed(new Set(['Book/0', 'Book/1'])), 197);
assert.deepEqual([...bounded.documents.keys()], ['Book/0', 'Book/1', 'Book/199']);
assert.equal(bounded.documents.get('Book/199').draft, 'unsaved text');
await bounded.open('Book/2');
assert.equal(reads, 201, 'Evicted notes reload from disk');
bounded.documents.get('Book/2').error = 'disk error';
assert.equal(bounded.pruneClosed(new Set()), 2);
assert.ok(bounded.documents.has('Book/2'), 'Errors remain visible and recoverable');

let finishSave;
const pendingSave = new DocumentSessions({read: async () => 'old', write: () => new Promise(resolve => {finishSave = resolve;})});
await pendingSave.open('A'); pendingSave.stage('A', 'new');
const inFlight = pendingSave.save('A');
assert.equal(pendingSave.pruneClosed(new Set()), 0);
finishSave(); await inFlight;
assert.equal(pendingSave.pruneClosed(new Set()), 1);

let finishRead;
let pausePoll = false;
const stalePoll = new DocumentSessions({read: () => pausePoll ? new Promise(resolve => {finishRead = resolve;}) : Promise.resolve('old'),write:async()=>{}});
await stalePoll.open('A'); pausePoll = true;
const oldPoll = stalePoll.checkExternal('A');
stalePoll.pruneClosed(new Set()); pausePoll = false;
await stalePoll.open('A');
finishRead('outdated'); await oldPoll;
assert.equal(stalePoll.documents.get('A').draft, 'old', 'A stale poll cannot overwrite a reopened session');
console.log('Passed: 200 cached documents reduce to 3 protected/dirty documents; eviction preserves queued writes, errors, recovery and stale-read safety.');

const snapshotBuild = await build({entryPoints:['src/lib/librarySnapshot.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {reconcileNotebooks} = await import(`data:text/javascript;base64,${Buffer.from(snapshotBuild.outputFiles[0].text).toString('base64')}`);
const library = [{id:'B',name:'B',parentPath:null,icon:'folder',colorHex:null,children:[],notes:[{id:'B/N',title:'N',notebookPath:'B',modifiedAt:'before'}]}];
assert.equal(reconcileNotebooks(library, structuredClone(library)), library);
const updated = structuredClone(library); updated[0].notes[0].modifiedAt = 'after';
const merged = reconcileNotebooks(library, updated);
assert.notEqual(merged, library);
assert.equal(merged[0].children, library[0].children);
assert.equal(merged[0].notes[0].modifiedAt, 'after');
assert.deepEqual(reconcileNotebooks(library, []), []);
console.log('Passed: unchanged library polls preserve object identity; changed metadata and deletions remain visible.');
