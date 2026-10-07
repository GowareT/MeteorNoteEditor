import type { SidebarPage } from "@/types/library";
import { NoteEditorView } from "@/views/NoteEditorView";
import { NotebookView } from "@/views/NotebookView";
import { SettingsView } from "@/views/SettingsView";
import { TrashView } from "@/views/TrashView";

export function PageContent({page, detachedNote = false}: {page: SidebarPage; detachedNote?: boolean}) {
  if (page === "trash") return <TrashView />;
  if (page === "settings") return <SettingsView />;
  if (typeof page === "object" && "note" in page) return <NoteEditorView key={page.note} path={page.note} detached={detachedNote} />;
  return <NotebookView notebookPath={typeof page === "object" ? page.notebook : undefined} />;
}
