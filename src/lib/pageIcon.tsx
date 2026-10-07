import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { LibraryIcon } from "@/components/LibraryIcon";
import type { LibraryNote, LibraryNotebook, SidebarPage } from "@/types/library";

function findNotebook(
  nodes: LibraryNotebook[],
  path: string,
): LibraryNotebook | null {
  for (const n of nodes) {
    if (n.id === path) return n;
    const child = findNotebook(n.children, path);
    if (child) return child;
  }
  return null;
}

function findNote(
  nodes: LibraryNotebook[],
  path: string,
): LibraryNote | null {
  for (const n of nodes) {
    const note = n.notes.find((x) => x.id === path);
    if (note) return note;
    const nested = findNote(n.children, path);
    if (nested) return nested;
  }
  return null;
}

/** Resolve icon node for a sidebar/tab page */
export function iconForPage(
  page: SidebarPage,
  notebooks: LibraryNotebook[],
  size = 14,
): ReactNode {
  if (page === "workspaceHome") return <Icon name="home" size={size} />;
  if (page === "trash") return <Icon name="trash" size={size} />;
  if (page === "settings") return <Icon name="cog-6-tooth" size={size} />;
  if (typeof page === "object" && "note" in page) {
    const note = findNote(notebooks, page.note);
    return (
      <LibraryIcon
        id={note?.icon}
        size={size}
        fallback="document"
      />
    );
  }
  if (typeof page === "object" && "notebook" in page) {
    const nb = findNotebook(notebooks, page.notebook);
    return (
      <LibraryIcon
        id={nb?.icon}
        size={size}
        fallback="folder"
      />
    );
  }
  return <Icon name="document-text" size={size} />;
}
