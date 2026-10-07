import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { DocumentSessions, type DocumentSession, type PathChange } from "./documentSessions";
import type { LibraryNotebook, LibraryStats, LibraryTrashItem } from "@/types/library";
export type { PathChange } from "./documentSessions";
let cachedLibraryRootPath: string | null = null;
const recoveryKey = `meteornote-editor.drafts.${typeof window !== "undefined" && isTauri() ? getCurrentWindow().label : "main"}`;
export const documents = new DocumentSessions({
    read: path => invoke<string>("read_note", { path }),
    write: (path, content, expectedContent) => invoke("write_note", { path, content, expectedContent }),
}, drafts => { if (typeof localStorage !== "undefined") localStorage.setItem(recoveryKey, JSON.stringify(drafts)); });
try {
    const saved = typeof localStorage === "undefined" ? null : localStorage.getItem(recoveryKey);
    if (saved) documents.recover(JSON.parse(saved) as DocumentSession[]);
} catch { /* Invalid recovery data is kept for manual inspection. */ }
export const flushDrafts = () => documents.flush();
export const stageDraft = (path: string, content: string) => documents.stage(path, content);
export function getCachedLibraryRootPath() {
    return cachedLibraryRootPath;
}
export async function loadLibrary(): Promise<LibraryNotebook[]> {
    return invoke<LibraryNotebook[]>("list_notebooks");
}
export async function readNote(path: string): Promise<string> {
    return documents.open(path);
}
export async function writeNote(path: string, content: string): Promise<void> {
    await documents.open(path);
    documents.stage(path, content);
    await documents.save(path);
}
export async function listNoteVersions(path: string): Promise<import("@/types/library").NoteVersionInfo[]> {
    return invoke("list_note_versions", { path });
}
export async function readNoteVersion(path: string, versionId: string): Promise<string> {
    return invoke("read_note_version", { path, versionId });
}
export async function restoreNoteVersion(path: string, versionId: string): Promise<string> {
    const content = await readNoteVersion(path, versionId);
    await writeNote(path, content);
    return content;
}
export async function setNotebookIcon(path: string, icon: string): Promise<void> {
    await invoke("set_notebook_icon", { path, icon });
}
export async function setNotebookColor(path: string, colorHex: string | null): Promise<void> {
    await invoke("set_notebook_color", { path, colorHex });
}
export async function setNotebookAppearance(path: string, icon: string, colorHex: string | null): Promise<void> {
    await invoke("set_notebook_appearance", { path, icon, colorHex });
}
export async function setMenuBarIconEnabled(enabled: boolean): Promise<void> {
    await invoke("set_menu_bar_icon_enabled", { enabled });
}
export async function setNoteIcon(path: string, icon: string): Promise<void> {
    await invoke("set_note_icon", { path, icon });
}
export async function setNoteAppearance(path: string, icon: string, colorHex: string | null): Promise<void> {
    await invoke("set_note_appearance", { path, icon, colorHex });
}
export async function createNote(notebookPath: string, title?: string): Promise<string> {
    return invoke<string>("create_note", { notebookPath, title: title ?? null });
}
export async function createNotebook(preferredName = "新建笔记本", parentPath: string | null = null): Promise<string> {
    return invoke<string>("create_notebook", {
        preferredName,
        parentPath,
    });
}
export async function moveNoteToTrash(path: string): Promise<void> {
    await flushDrafts();
    await invoke("move_note_to_trash", { path });
    documents.forget(path);
}
export async function moveNotebookToTrash(path: string): Promise<void> {
    await flushDrafts();
    await invoke("move_notebook_to_trash", { path });
    documents.forget(path);
}
async function changePath(command: string, args: Record<string, unknown>): Promise<string> {
    await flushDrafts();
    const change = await invoke<PathChange>(command, args);
    await documents.relocate(change);
    return change.to;
}
export async function renameNote(path: string, newTitle: string): Promise<string> {
    return changePath("rename_note", { path, newTitle });
}
export async function renameNotebook(path: string, newName: string): Promise<string> {
    return changePath("rename_notebook", { path, newName });
}
export async function moveNote(path: string, toNotebookPath: string): Promise<string> {
    return changePath("move_note", { path, toNotebookPath });
}
export async function moveNotebook(path: string, toParentPath: string | null, beforeNotebookPath: string | null = null): Promise<string> {
    return changePath("move_notebook", { path, toParentPath, beforeNotebookPath });
}
export async function reorderNotebooks(parentPath: string | null, ordered: string[]): Promise<void> {
    await invoke("reorder_notebooks", {
        parentPath: parentPath ?? null,
        ordered,
    });
}
export async function reorderNotes(notebookPath: string, ordered: string[]): Promise<void> {
    await invoke("reorder_notes", { notebookPath, ordered });
}
export async function listTrash(): Promise<LibraryTrashItem[]> {
    return invoke<LibraryTrashItem[]>("list_trash");
}
export async function restoreTrashItem(id: string): Promise<void> {
    await invoke("restore_trash_item", { id });
}
export async function permanentlyDeleteTrashItem(id: string): Promise<void> {
    await invoke("permanently_delete_trash_item", { id });
}
export async function emptyTrash(): Promise<void> {
    await invoke("empty_trash");
}
export async function libraryStats(): Promise<LibraryStats> {
    return invoke<LibraryStats>("library_stats");
}
export async function libraryRootPath(): Promise<string> {
    cachedLibraryRootPath = await invoke<string>("library_root_path");
    return cachedLibraryRootPath;
}
export async function revealInFinder(path: string): Promise<void> {
    await invoke("reveal_in_finder", { path });
}
export async function storeNoteAsset(notePath: string, sourcePath: string): Promise<string> {
    return invoke<string>("store_note_asset", { notePath, sourcePath });
}

export type SearchHit = { path: string; title: string; excerpt: string; line: number };
export type TransferResult = { path: string; noteCount: number };
export async function searchNotes(query: string): Promise<SearchHit[]> {
    const hits = await invoke<SearchHit[]>("search_notes", { query });
    const results = new Map(hits.map(hit => [hit.path, hit]));
    const needle = query.trim().toLocaleLowerCase();
    for (const doc of documents.documents.values()) if (doc.base !== doc.draft) {
        results.delete(doc.path);
        const lines = doc.draft.split("\n");
        const line = lines.findIndex(line => line.toLocaleLowerCase().includes(needle));
        if (line >= 0 || doc.path.toLocaleLowerCase().includes(needle)) {
            results.set(doc.path, { path: doc.path, title: doc.path.split("/").pop()!, line: Math.max(0, line) + 1, excerpt: (lines[Math.max(0, line)] ?? "").slice(0, 150) });
        }
    }
    return [...results.values()].slice(0, 500);
}
export async function transferLibrary(operation: "import" | "export" | "export-note" | "backup" | "restore", paths: string[]): Promise<TransferResult> {
    await flushDrafts();
    return invoke("transfer_library", { operation, paths });
}
export async function saveConflictCopy(path: string): Promise<string> {
    const session = documents.documents.get(path);
    if (!session) throw new Error("草稿不存在");
    const content = session.draft;
    const copy = await invoke<string>("copy_note_draft", { path, title: `${path.split("/").pop()} 冲突副本`, content });
    await documents.open(copy);
    await documents.useDisk(path).catch(() => documents.forget(path));
    return copy;
}

export type RecoveredWindowDraft = DocumentSession & { storageKey: string };
export async function recoveredWindowDrafts(): Promise<RecoveredWindowDraft[]> {
    if (typeof localStorage === "undefined") return [];
    const windows = isTauri() ? await (await import("@tauri-apps/api/webviewWindow")).getAllWebviewWindows() : [];
    const active = new Set(windows.map(window => `meteornote-editor.drafts.${window.label}`));
    active.add(recoveryKey);
    const recovered: RecoveredWindowDraft[] = [];
    for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index)!;
        if (!key.startsWith("meteornote-editor.drafts.") || active.has(key)) continue;
        try {
            const entries: DocumentSession[] = JSON.parse(localStorage.getItem(key)!);
            for (const entry of entries) if (typeof entry.path === "string" && typeof entry.draft === "string" && entry.draft !== entry.base) recovered.push({ ...entry, storageKey: key });
        } catch { /* Keep malformed recovery records untouched. */ }
    }
    return recovered;
}
export async function restoreWindowDraft(entry: RecoveredWindowDraft) {
    const path = await invoke<string>("copy_note_draft", {
        path: entry.path, title: `${entry.path.split("/").pop()} 恢复草稿`, content: entry.draft,
    });
    await documents.open(path);
    const current: DocumentSession[] = JSON.parse(localStorage.getItem(entry.storageKey) ?? "[]");
    localStorage.setItem(entry.storageKey, JSON.stringify(current.filter(item => item.path !== entry.path || item.draft !== entry.draft)));
    return path;
}
