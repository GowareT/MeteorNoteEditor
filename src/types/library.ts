export type SidebarPage = "workspaceHome" | "trash" | "settings" | {
    note: string;
} | {
    notebook: string;
};
export interface LibraryNote {
    id: string;
    title: string;
    notebookPath: string;
    icon?: string;
    colorHex?: string | null;
    createdAt?: string | null;
    modifiedAt?: string | null;
}
export interface LibraryNotebook {
    id: string;
    name: string;
    parentPath: string | null;
    icon: string;
    colorHex: string | null;
    notes: LibraryNote[];
    children: LibraryNotebook[];
}
export interface LibraryTrashItem {
    id: string;
    kind: "note" | "notebook";
    originalPath: string;
    title: string;
    trashedAt: string;
    createdAt?: string | null;
}
export interface LibraryStats {
    notebookCount: number;
    noteCount: number;
    trashCount: number;
}
export interface NoteVersionInfo {
    id: string;
    createdAt: string;
    size: number;
    preview: string;
}
