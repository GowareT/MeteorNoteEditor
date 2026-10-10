import { t } from "@/lib/i18n";
import { revealFolderLabel } from "@/lib/platform";
import { useCallback, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, } from "react";
import clsx from "clsx";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ContextMenu, type ContextMenuItem } from "@/components/ContextMenu";
import { Icon } from "@/components/Icon";
import { IconPickerDialog } from "@/components/IconPickerDialog";
import { LibraryIcon } from "@/components/LibraryIcon";
import { MoveTargetDialog } from "@/components/MoveTargetDialog";
import { SidebarRow, SidebarSection } from "@/components/SidebarRow";
import { TextPromptDialog } from "@/components/TextPromptDialog";
import { WindowTrafficLights } from "@/components/WindowTrafficLights";
import * as api from "@/lib/api";
import { useBrand } from "@/hooks/useBrand";
import { useLibraryTransfer } from "@/hooks/useLibraryTransfer";
import { handleWindowDragMouseDown } from "@/lib/windowDrag";
import { SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_MIN, pageKey, useAppStore, } from "@/store/appStore";
import type { LibraryNotebook, LibraryNote, SidebarPage } from "@/types/library";
import "./Sidebar.css";
function isSamePage(a: SidebarPage, b: SidebarPage) {
    if (typeof a === "string" && typeof b === "string")
        return a === b;
    if (typeof a === "object" && typeof b === "object") {
        if ("note" in a && "note" in b)
            return a.note === b.note;
        if ("notebook" in a && "notebook" in b)
            return a.notebook === b.notebook;
    }
    return false;
}
function matchesSearch(text: string, q: string) {
    if (!q.trim())
        return true;
    return text.toLowerCase().includes(q.trim().toLowerCase());
}
/** 笔记本内笔记总数（含子笔记本） */
function countNotesInNotebook(nb: LibraryNotebook): number {
    return (nb.notes.length +
        nb.children.reduce((sum, child) => sum + countNotesInNotebook(child), 0));
}
type CtxTarget = {
    kind: "note";
    note: LibraryNote;
} | {
    kind: "notebook";
    notebook: LibraryNotebook;
};
type PromptState = {
    kind: "rename-note";
    path: string;
    value: string;
} | {
    kind: "rename-notebook";
    path: string;
    value: string;
};
type DragState = {
    kind: "note";
    path: string;
    title: string;
    notebookPath: string;
} | {
    kind: "notebook";
    path: string;
    title: string;
    parentPath: string | null;
    hasChildren: boolean;
};
type DropPosition = "before" | "after" | "into";
type DropTarget = {
    kind: "note";
    path: string;
    title: string;
    notebookPath: string;
} | {
    kind: "notebook";
    path: string;
    title: string;
    parentPath: string | null;
};
type ConfirmState = {
    kind: "delete-note";
    path: string;
    title: string;
} | {
    kind: "delete-notebook";
    path: string;
    title: string;
};
type TreeDragSession = {
    item: DragState;
    startX: number;
    startY: number;
    active: boolean;
};
function findNotebookContainer(nodes: LibraryNotebook[], path: string): {
    siblings: LibraryNotebook[];
    parentPath: string | null;
} | null {
    for (const nb of nodes) {
        if (nb.id === path) {
            return { siblings: nodes, parentPath: nb.parentPath };
        }
        const hit = findNotebookContainer(nb.children, path);
        if (hit)
            return hit;
    }
    return null;
}
function findNoteContainer(nodes: LibraryNotebook[], path: string): {
    notebook: LibraryNotebook;
    note: LibraryNote;
    index: number;
} | null {
    for (const nb of nodes) {
        const index = nb.notes.findIndex((note) => note.id === path);
        if (index >= 0) {
            return { notebook: nb, note: nb.notes[index], index };
        }
        const hit = findNoteContainer(nb.children, path);
        if (hit)
            return hit;
    }
    return null;
}
function getDropPositionForElement(element: HTMLElement, clientY: number): DropPosition {
    const rect = element.getBoundingClientRect();
    const offset = clientY - rect.top;
    if (offset < rect.height * 0.16)
        return "before";
    if (offset > rect.height * 0.84)
        return "after";
    return "into";
}
function getNotebookDropPosition(element: HTMLElement, clientY: number, clientX: number, dragState: DragState | null): DropPosition {
    const position = getDropPositionForElement(element, clientY);
    if (dragState?.kind === "notebook") {
        const rect = element.getBoundingClientRect();
        const offset = clientY - rect.top;
        const isEdge = offset < rect.height * 0.16 || offset > rect.height * 0.84;
        if (!isEdge && clientX > rect.left + 24)
            return "into";
    }
    if (position !== "into")
        return position;
    if (dragState?.kind !== "notebook")
        return position;
    return "into";
}
function treeTargetFromElement(element: Element | null): {
    element: HTMLElement;
    target: DropTarget;
} | null {
    const row = element?.closest("[data-mn-tree-target]") as HTMLElement | null;
    if (!row)
        return null;
    const kind = row.dataset.treeKind;
    const path = row.dataset.treePath;
    const title = row.dataset.treeTitle;
    if (!path || !title)
        return null;
    if (kind === "note") {
        const notebookPath = row.dataset.treeNotebookPath;
        if (!notebookPath)
            return null;
        return {
            element: row,
            target: { kind: "note", path, title, notebookPath },
        };
    }
    if (kind === "notebook") {
        return {
            element: row,
            target: {
                kind: "notebook",
                path,
                title,
                parentPath: row.dataset.treeParentPath ?? null,
            },
        };
    }
    return null;
}
function canDropTreeTarget(dragState: DragState, target: DropTarget, position: DropPosition) {
    if (dragState.path === target.path)
        return false;
    if (dragState.kind === "notebook") {
        if (target.kind !== "notebook")
            return false;
        if (target.path.startsWith(`${dragState.path}/`))
            return false;
        if (target.parentPath === dragState.path ||
            target.parentPath?.startsWith(`${dragState.path}/`)) {
            return false;
        }
        if (position === "into") {
            return dragState.parentPath !== target.path;
        }
        return true;
    }
    return target.kind === "notebook" || target.kind === "note";
}
function dropPositionForTarget(element: HTMLElement, target: DropTarget, dragState: DragState, clientY: number, clientX: number) {
    if (target.kind === "notebook") {
        return getNotebookDropPosition(element, clientY, clientX, dragState);
    }
    return getDropPositionForElement(element, clientY);
}
function NotebookTree({ nodes, depth, query, dragState, dropState, onNotebookContext, onNoteContext, onRenameNotebook, onRenameNote, onPointerStartItem, onTreeClick, }: {
    nodes: LibraryNotebook[];
    depth: number;
    query: string;
    dragState: DragState | null;
    dropState: {
        path: string;
        position: DropPosition;
    } | null;
    onNotebookContext: (e: ReactMouseEvent, notebook: LibraryNotebook) => void;
    onNoteContext: (e: ReactMouseEvent, note: LibraryNote) => void;
    onRenameNotebook: (notebook: LibraryNotebook) => void;
    onRenameNote: (note: LibraryNote) => void;
    onPointerStartItem: (e: ReactPointerEvent<HTMLButtonElement>, item: DragState) => void;
    onTreeClick: (action: () => void) => void;
}) {
    const selected = useAppStore((s) => s.selected);
    const expanded = useAppStore((s) => s.expandedNotebooks);
    const toggleNotebook = useAppStore((s) => s.toggleNotebook);
    const select = useAppStore((s) => s.select);
    return (<>
      {nodes.map((nb) => {
            const notes = nb.notes.filter((n) => matchesSearch(n.title, query));
            const childrenVisible = nb.children.length > 0;
            const selfMatch = matchesSearch(nb.name, query);
            const hasVisibleChild = notes.length > 0 ||
                nb.children.some((c) => matchesSearch(c.name, query) ||
                    c.notes.some((n) => matchesSearch(n.title, query)));
            if (query.trim() && !selfMatch && !hasVisibleChild)
                return null;
            const open = expanded.has(nb.id) || !!query.trim();
            const notebookDrop = dropState?.path === nb.id ? dropState.position : null;
            return (<div key={nb.id}>
            <SidebarRow title={nb.name} indent={depth * 16} compact badge={countNotesInNotebook(nb)} selected={isSamePage(selected, { notebook: nb.id })} treeDndTarget={{
                    kind: "notebook",
                    path: nb.id,
                    title: nb.name,
                    parentPath: nb.parentPath,
                }} className={clsx(notebookDrop === "before" && "is-drop-before", notebookDrop === "after" && "is-drop-after", notebookDrop === "into" && "is-drop-into")} icon={<span className="mn-tree-folder">
                  {childrenVisible || nb.notes.length > 0 ? (<span className="mn-tree-chevron" role="button" aria-label={open ? t("收起") : t("展开")} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => {
                            e.stopPropagation();
                            toggleNotebook(nb.id);
                        }}>
                      {open ? (<Icon name="chevron-down" size={10}/>) : (<Icon name="chevron-right" size={10}/>)}
                    </span>) : (<span className="mn-tree-chevron-spacer"/>)}
                  <LibraryIcon id={nb.icon} size={15} fallback="folder"/>
                </span>} onClick={() => onTreeClick(() => {
                    toggleNotebook(nb.id);
                    void select({ notebook: nb.id });
                })} onDoubleClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void select({ notebook: nb.id });
                    onRenameNotebook(nb);
                }} onContextMenu={(e) => onNotebookContext(e, nb)} onPointerDown={(e) => onPointerStartItem(e, {
                    kind: "notebook",
                    path: nb.id,
                    title: nb.name,
                    parentPath: nb.parentPath,
                    hasChildren: nb.children.length > 0,
                })}/>
            {open ? (<>
                {notes.map((note) => {
                        const noteDrop = dropState?.path === note.id ? dropState.position : null;
                        return (<SidebarRow key={note.id} title={note.title} indent={(depth + 1) * 16} compact selected={isSamePage(selected, { note: note.id })} treeDndTarget={{
                                kind: "note",
                                path: note.id,
                                title: note.title,
                                notebookPath: nb.id,
                            }} className={clsx(noteDrop === "before" && "is-drop-before", noteDrop === "after" && "is-drop-after")} icon={<LibraryIcon id={note.icon} size={15} fallback="document"/>} onClick={() => onTreeClick(() => {
                                void select({ note: note.id });
                            })} onDoubleClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void select({ note: note.id });
                                onRenameNote(note);
                            }} onContextMenu={(e) => onNoteContext(e, note)} onPointerDown={(e) => onPointerStartItem(e, {
                                kind: "note",
                                path: note.id,
                                title: note.title,
                                notebookPath: nb.id,
                            })}/>);
                    })}
                <NotebookTree nodes={nb.children} depth={depth + 1} query={query} dragState={dragState} dropState={dropState} onNotebookContext={onNotebookContext} onNoteContext={onNoteContext} onRenameNotebook={onRenameNotebook} onRenameNote={onRenameNote} onPointerStartItem={onPointerStartItem} onTreeClick={onTreeClick}/>
              </>) : null}
          </div>);
        })}
    </>);
}
export function Sidebar() {
    const transfer = useLibraryTransfer();
    const brand = useBrand();
    const notebooks = useAppStore((s) => s.notebooks);
    const selected = useAppStore((s) => s.selected);
    const collapsed = useAppStore((s) => s.sidebarCollapsed);
    const sidebarWidth = useAppStore((s) => s.sidebarWidth);
    const searchText = useAppStore((s) => s.searchText);
    const trashCount = useAppStore((s) => s.trashCount);
    const select = useAppStore((s) => s.select);
    const createQuickNote = useAppStore((s) => s.createQuickNote);
    const createRootNotebook = useAppStore((s) => s.createRootNotebook);
    const createNoteInNotebook = useAppStore((s) => s.createNoteInNotebook);
    const createChildNotebook = useAppStore((s) => s.createChildNotebook);
    const renameNote = useAppStore((s) => s.renameNote);
    const renameNotebook = useAppStore((s) => s.renameNotebook);
    const setNoteAppearance = useAppStore((s) => s.setNoteAppearance);
    const setNotebookAppearance = useAppStore((s) => s.setNotebookAppearance);
    const moveNote = useAppStore((s) => s.moveNote);
    const moveNotebookToParent = useAppStore((s) => s.moveNotebookToParent);
    const deleteNote = useAppStore((s) => s.deleteNote);
    const deleteNotebook = useAppStore((s) => s.deleteNotebook);
    const revealPath = useAppStore((s) => s.revealPath);
    const toggleSidebar = useAppStore((s) => s.toggleSidebar);
    const setSidebarWidth = useAppStore((s) => s.setSidebarWidth);
    const refresh = useAppStore((s) => s.refresh);
    const favoriteKeys = useAppStore((s) => s.favoriteKeys);
    const toggleFavorite = useAppStore((s) => s.toggleFavorite);
    const [resizing, setResizing] = useState(false);
    const dragRef = useRef<{
        startX: number;
        startWidth: number;
    } | null>(null);
    const [menu, setMenu] = useState<{
        x: number;
        y: number;
        target: CtxTarget;
    } | null>(null);
    const [prompt, setPrompt] = useState<PromptState | null>(null);
    const [confirm, setConfirm] = useState<ConfirmState | null>(null);
    const [moveNotePath, setMoveNotePath] = useState<string | null>(null);
    const [iconPicker, setIconPicker] = useState<{
        kind: "note";
        path: string;
        current?: string;
    } | {
        kind: "notebook";
        path: string;
        current?: string;
    } | null>(null);
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [dropState, setDropState] = useState<{
        path: string;
        position: DropPosition;
    } | null>(null);
    const dragStateRef = useRef<DragState | null>(null);
    const treeDragSessionRef = useRef<TreeDragSession | null>(null);
    const suppressTreeClickRef = useRef(false);
    const promptRenameNote = useCallback((path: string, value: string) => {
        setPrompt({ kind: "rename-note", path, value });
    }, []);
    const promptRenameNotebook = useCallback((path: string, value: string) => {
        setPrompt({ kind: "rename-notebook", path, value });
    }, []);
    const createAndPromptNote = useCallback(async (create: () => Promise<string>, fallback = t("未命名笔记")) => {
        const path = await create();
        promptRenameNote(path, path.split("/").pop() ?? fallback);
    }, [promptRenameNote]);
    const createAndPromptNotebook = useCallback(async (create: () => Promise<string>, fallback = t("新建笔记本")) => {
        const path = await create();
        promptRenameNotebook(path, path.split("/").pop() ?? fallback);
    }, [promptRenameNotebook]);
    const clearDragState = useCallback(() => {
        dragStateRef.current = null;
        treeDragSessionRef.current = null;
        document.body.classList.remove("mn-tree-dragging");
        setDragState(null);
        setDropState(null);
    }, []);
    const suppressNextTreeClick = useCallback(() => {
        suppressTreeClickRef.current = true;
        window.setTimeout(() => {
            suppressTreeClickRef.current = false;
        }, 0);
    }, []);
    const runTreeClick = useCallback((action: () => void) => {
        if (suppressTreeClickRef.current)
            return;
        action();
    }, []);
    const dropItem = useCallback(async (target: DropTarget, position: DropPosition) => {
        const currentDrag = dragStateRef.current ?? dragState;
        if (!currentDrag)
            return;
        try {
            if (currentDrag.kind === "notebook") {
                if (target.kind !== "notebook")
                    return;
                if (position === "into") {
                    await moveNotebookToParent(currentDrag.path, target.path, null);
                    return;
                }
                const container = findNotebookContainer(notebooks, target.path);
                if (!container)
                    return;
                const targetIndex = container.siblings.findIndex((nb) => nb.id === target.path);
                if (targetIndex < 0)
                    return;
                const beforePath = position === "before"
                    ? target.path
                    : container.siblings[targetIndex + 1]?.id ?? null;
                await moveNotebookToParent(currentDrag.path, container.parentPath, beforePath);
                return;
            }
            if (target.kind === "notebook") {
                await useAppStore.getState().moveNoteToNotebook(currentDrag.path, target.path, null);
                return;
            }
            const targetContainer = findNoteContainer(notebooks, target.path);
            if (!targetContainer)
                return;
            const beforePath = position === "before"
                ? target.path
                : targetContainer.index + 1 < targetContainer.notebook.notes.length
                    ? targetContainer.notebook.notes[targetContainer.index + 1].id
                    : null;
            await useAppStore.getState().moveNoteToNotebook(currentDrag.path, target.notebookPath, beforePath);
        }
        finally {
            clearDragState();
        }
    }, [clearDragState, dragState, moveNotebookToParent, notebooks]);
    const findTreeDropAtPoint = useCallback((clientX: number, clientY: number, currentDrag: DragState) => {
        const hit = treeTargetFromElement(document.elementFromPoint(clientX, clientY));
        if (!hit)
            return null;
        const position = dropPositionForTarget(hit.element, hit.target, currentDrag, clientY, clientX);
        if (!canDropTreeTarget(currentDrag, hit.target, position))
            return null;
        return { target: hit.target, position };
    }, []);
    const beginTreePointerDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>, item: DragState) => {
        if (event.button !== 0)
            return;
        treeDragSessionRef.current = {
            item,
            startX: event.clientX,
            startY: event.clientY,
            active: false,
        };
        const onMove = (ev: PointerEvent) => {
            const session = treeDragSessionRef.current;
            if (!session)
                return;
            const dx = ev.clientX - session.startX;
            const dy = ev.clientY - session.startY;
            if (!session.active) {
                if (Math.hypot(dx, dy) < 5)
                    return;
                session.active = true;
                dragStateRef.current = session.item;
                document.body.classList.add("mn-tree-dragging");
                setDragState(session.item);
            }
            ev.preventDefault();
            suppressNextTreeClick();
            const hit = findTreeDropAtPoint(ev.clientX, ev.clientY, session.item);
            setDropState(hit ? { path: hit.target.path, position: hit.position } : null);
        };
        const onUp = (ev: PointerEvent) => {
            const session = treeDragSessionRef.current;
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
            treeDragSessionRef.current = null;
            if (!session?.active) {
                clearDragState();
                return;
            }
            ev.preventDefault();
            const hit = findTreeDropAtPoint(ev.clientX, ev.clientY, session.item);
            if (!hit) {
                clearDragState();
                return;
            }
            void dropItem(hit.target, hit.position);
        };
        window.addEventListener("pointermove", onMove, { passive: false });
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
    }, [clearDragState, dropItem, findTreeDropAtPoint, suppressNextTreeClick]);
    const moveNotebook = useCallback(async (path: string, direction: -1 | 1) => {
        const container = findNotebookContainer(notebooks, path);
        if (!container)
            return;
        const index = container.siblings.findIndex((nb) => nb.id === path);
        if (index < 0)
            return;
        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= container.siblings.length)
            return;
        const ordered = container.siblings.map((nb) => nb.name);
        const [moved] = ordered.splice(index, 1);
        ordered.splice(nextIndex, 0, moved);
        await api.reorderNotebooks(container.parentPath, ordered);
        await refresh();
    }, [notebooks, refresh]);
    const openNotebookMenu = useCallback((e: ReactMouseEvent, notebook: LibraryNotebook) => {
        e.preventDefault();
        e.stopPropagation();
        // Right-click should open the menu only — do not change the current selection.
        setMenu({ x: e.clientX, y: e.clientY, target: { kind: "notebook", notebook } });
    }, []);
    const openNoteMenu = useCallback((e: ReactMouseEvent, note: LibraryNote) => {
        e.preventDefault();
        e.stopPropagation();
        // Right-click should open the menu only — do not change the current selection.
        setMenu({ x: e.clientX, y: e.clientY, target: { kind: "note", note } });
    }, []);
    const beginRenameNotebook = useCallback((notebook: LibraryNotebook) => {
        setMenu(null);
        setPrompt({
            kind: "rename-notebook",
            path: notebook.id,
            value: notebook.name,
        });
    }, []);
    const beginRenameNote = useCallback((note: LibraryNote) => {
        setMenu(null);
        setPrompt({
            kind: "rename-note",
            path: note.id,
            value: note.title,
        });
    }, []);
    const menuItems = (target: CtxTarget): ContextMenuItem[] => {
        if (target.kind === "note") {
            const note = target.note;
            return [
                {
                    id: "favorite",
                    label: favoriteKeys.has(pageKey({ note: note.id })) ? t("取消收藏") : t("收藏"),
                    onSelect: () => toggleFavorite({ note: note.id }),
                },
                {
                    id: "rename",
                    label: t("重命名"),
                    onSelect: () => beginRenameNote(note),
                },
                {
                    id: "icon",
                    label: t("更改图标…"),
                    onSelect: () => setIconPicker({
                        kind: "note",
                        path: note.id,
                        current: note.icon,
                    }),
                },
                {
                    id: "move",
                    label: t("移动笔记…"),
                    onSelect: () => setMoveNotePath(note.id),
                },
                {
                    id: "finder",
                    label: revealFolderLabel(),
                    onSelect: () => void revealPath(note.id),
                },
                { id: "sep", label: "", separator: true },
                {
                    id: "delete",
                    label: t("删除笔记"),
                    danger: true,
                    onSelect: () => setConfirm({
                        kind: "delete-note",
                        path: note.id,
                        title: note.title,
                    }),
                },
            ];
        }
        const nb = target.notebook;
        const items: ContextMenuItem[] = [
            {
                id: "create-note",
                label: t("新建笔记"),
                onSelect: () => void createAndPromptNote(() => createNoteInNotebook(nb.id)),
            },
            {
                id: "import",
                label: t("导入"),
                disabled: transfer.busy,
                submenu: [
                    { id: "import-files", label: t("Markdown 文件…"),
                        onSelect: () => void transfer.run("files", nb.id) },
                    { id: "import-folder", label: t("文件夹中的 Markdown…"),
                        onSelect: () => void transfer.run("folder", nb.id) },
                ],
            },
        ];
        if (nb.parentPath == null) {
            items.push({
                id: "create-child",
                label: t("新建文件夹"),
                onSelect: () => void createAndPromptNotebook(() => createChildNotebook(nb.id)),
            });
        }
        const container = findNotebookContainer(notebooks, nb.id);
        const currentIndex = container
            ? container.siblings.findIndex((item) => item.id === nb.id)
            : -1;
        const canMoveUp = currentIndex > 0;
        const canMoveDown = currentIndex >= 0 &&
            currentIndex < (container?.siblings.length ?? 0) - 1;
        items.push({ id: "sep-1", label: "", separator: true }, {
            id: "rename",
            label: t("重命名"),
            onSelect: () => beginRenameNotebook(nb),
        }, {
            id: "move-up",
            label: t("上移"),
            disabled: !canMoveUp,
            onSelect: () => void moveNotebook(nb.id, -1),
        }, {
            id: "move-down",
            label: t("下移"),
            disabled: !canMoveDown,
            onSelect: () => void moveNotebook(nb.id, 1),
        }, {
            id: "icon",
            label: t("更改图标…"),
            onSelect: () => setIconPicker({
                kind: "notebook",
                path: nb.id,
                current: nb.icon,
            }),
        }, {
            id: "finder",
            label: revealFolderLabel(),
            onSelect: () => void revealPath(nb.id),
        }, { id: "sep-2", label: "", separator: true }, {
            id: "delete",
            label: t("删除笔记本"),
            danger: true,
            onSelect: () => setConfirm({
                kind: "delete-notebook",
                path: nb.id,
                title: nb.name,
            }),
        });
        return items;
    };
    const onResizePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (collapsed)
            return;
        event.preventDefault();
        const target = event.currentTarget;
        target.setPointerCapture(event.pointerId);
        dragRef.current = {
            startX: event.clientX,
            startWidth: sidebarWidth,
        };
        setResizing(true);
        const onMove = (ev: PointerEvent) => {
            const drag = dragRef.current;
            if (!drag)
                return;
            setSidebarWidth(drag.startWidth + (ev.clientX - drag.startX));
        };
        const onUp = (ev: PointerEvent) => {
            dragRef.current = null;
            setResizing(false);
            try {
                target.releasePointerCapture(ev.pointerId);
            }
            catch {
                /* already released */
            }
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
    }, [collapsed, setSidebarWidth, sidebarWidth]);
    return (<aside className={`mn-sidebar${collapsed ? " is-collapsed" : ""}${resizing ? " is-resizing" : ""}`} style={collapsed
            ? undefined
            : {
                width: sidebarWidth,
                minWidth: SIDEBAR_WIDTH_MIN,
                maxWidth: SIDEBAR_WIDTH_MAX,
            }}>
      <div className="mn-sidebar__traffic" data-tauri-drag-region onMouseDown={handleWindowDragMouseDown}>
        <WindowTrafficLights className="mn-sidebar__traffic-lights"/>
        <button type="button" className="mn-icon-btn mn-sidebar__traffic-btn" onClick={toggleSidebar} title={collapsed ? t("展开侧边栏") : t("收起侧边栏")}>
          <Icon name={collapsed ? "sidebar-right" : "sidebar-left"} size={17}/>
        </button>
      </div>
      <hr className="mn-sidebar__traffic-rule"/>
      <div className="mn-sidebar__titlebar">
        {collapsed ? (<button type="button" className="mn-icon-btn mn-sidebar__rail-btn" onClick={() => void createAndPromptNote(() => createQuickNote())} title={t("新建笔记")}>
            <Icon name="pencil-square" size={16}/>
          </button>) : (<div className="mn-sidebar__brand-col">
            <button type="button" className="mn-sidebar__logo" onClick={() => void select("workspaceHome")} title={t("回到工作台")}>
              <img className="mn-sidebar__mark" src={brand.logo} alt=""/>
              <span title={brand.name}>{brand.name}</span>
            </button>
            <button type="button" className="mn-new-note" onClick={() => void createAndPromptNote(() => createQuickNote())}>
              <Icon name="pencil-square" size={12}/>
              {t("新建笔记")}</button>
          </div>)}
      </div>

      <div className="mn-sidebar__scroll">
        {!collapsed ? <SidebarSection title={t("笔记")}/> : null}
        <div className={collapsed ? "mn-sidebar__icon-stack" : undefined}>
          <SidebarRow title={collapsed ? "" : t("笔记")} icon={<Icon name="home" size={13}/>} selected={selected === "workspaceHome"} onClick={() => void select("workspaceHome")}/>
          
          
        </div>

        {!collapsed ? (<>
            <div className="mn-sidebar-section-row">
              <span>{t("文档结构")}</span>
              <button type="button" className="mn-icon-btn" title={t("新建笔记本")} onClick={() => void createAndPromptNotebook(() => createRootNotebook())}>
                <Icon name="plus" size={11}/>
              </button>
            </div>
            <NotebookTree nodes={notebooks} depth={0} query={searchText} dragState={dragState} dropState={dropState} onNotebookContext={openNotebookMenu} onNoteContext={openNoteMenu} onRenameNotebook={beginRenameNotebook} onRenameNote={beginRenameNote} onPointerStartItem={beginTreePointerDrag} onTreeClick={runTreeClick}/>
          </>) : null}
      </div>

      <div className={`mn-sidebar__footer ${collapsed ? "is-collapsed" : ""}`}>
        {!collapsed && (transfer.busy || transfer.message || transfer.error) &&
          <p className={`mn-sidebar__transfer${transfer.error ? " mn-error" : ""}`}
            role={transfer.error ? "alert" : "status"}>
            {transfer.error || (transfer.busy ? t("导入中…") : transfer.message)}
          </p>}
        <SidebarRow title={collapsed ? "" : t("回收站")} icon={<Icon name="trash" size={13}/>} selected={selected === "trash"} badge={collapsed ? null : trashCount} onClick={() => void select("trash")}/>
        <SidebarRow title={collapsed ? "" : t("设置")} icon={<Icon name="cog-6-tooth" size={13}/>} selected={selected === "settings"} onClick={() => void select("settings")}/>
      </div>

      {!collapsed ? (<div className="mn-sidebar__resizer" role="separator" aria-orientation="vertical" aria-valuemin={SIDEBAR_WIDTH_MIN} aria-valuemax={SIDEBAR_WIDTH_MAX} aria-valuenow={sidebarWidth} aria-label={t("调整侧栏宽度")} onPointerDown={onResizePointerDown}/>) : null}

      {menu ? (<ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.target)} onClose={() => setMenu(null)}/>) : null}

      {prompt ? (<TextPromptDialog title={prompt.kind === "rename-note" ? t("重命名笔记") : t("重命名笔记本")} label={prompt.kind === "rename-note" ? t("标题") : t("名称")} initialValue={prompt.value} onCancel={() => setPrompt(null)} onConfirm={(value) => {
                const next = prompt;
                setPrompt(null);
                if (next.kind === "rename-note")
                    void renameNote(next.path, value);
                else
                    void renameNotebook(next.path, value);
            }}/>) : null}

      {confirm ? (<ConfirmDialog title={confirm.kind === "delete-note" ? t("删除笔记") : t("删除笔记本")} message={confirm.kind === "delete-note"
                ? t("确定将「{0}」移到回收站？", confirm.title)
                : t("确定将笔记本「{0}」及其全部内容移到回收站？", confirm.title)} confirmLabel={t("移到回收站")} danger onCancel={() => setConfirm(null)} onConfirm={() => {
                const next = confirm;
                setConfirm(null);
                if (next.kind === "delete-note")
                    void deleteNote(next.path);
                else
                    void deleteNotebook(next.path);
            }}/>) : null}

      {moveNotePath ? (<MoveTargetDialog title={t("移动笔记")} notebooks={notebooks} onCancel={() => setMoveNotePath(null)} onConfirm={(target) => {
                const path = moveNotePath;
                setMoveNotePath(null);
                void moveNote(path, target);
            }}/>) : null}

      {iconPicker ? (<IconPickerDialog kind={iconPicker.kind} title={iconPicker.kind === "note" ? t("更改笔记图标") : t("更改笔记本图标")} current={iconPicker.current} onCancel={() => setIconPicker(null)} onPick={({ icon }) => {
                const next = iconPicker;
                setIconPicker(null);
                if (next.kind === "note") {
                    void setNoteAppearance(next.path, icon, null);
                    return;
                }
                void setNotebookAppearance(next.path, icon, null);
            }}/>) : null}
    </aside>);
}
