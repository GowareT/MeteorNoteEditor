import { t, errorMessage } from "@/lib/i18n";
import { create } from "zustand";
import type { LibraryNotebook, LibraryNote, SidebarPage } from "@/types/library";
import * as api from "@/lib/api";
import { reconcileNotebooks } from "@/lib/librarySnapshot";

export const SIDEBAR_WIDTH_DEFAULT = 240;
export const SIDEBAR_WIDTH_MIN = 200;
export const SIDEBAR_WIDTH_MAX = 360;

const SIDEBAR_WIDTH_KEY = "mn.sidebarWidth";
const FAVORITES_KEY = "mn.favoritePages";

function readFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function writeFavorites(set: Set<string>) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

function clampSidebarWidth(width: number) {
  return Math.min(
    SIDEBAR_WIDTH_MAX,
    Math.max(SIDEBAR_WIDTH_MIN, Math.round(width)),
  );
}

function readStoredSidebarWidth() {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (!raw) return SIDEBAR_WIDTH_DEFAULT;
    const n = Number(raw);
    if (!Number.isFinite(n)) return SIDEBAR_WIDTH_DEFAULT;
    return clampSidebarWidth(n);
  } catch {
    return SIDEBAR_WIDTH_DEFAULT;
  }
}

export interface BrowserTab {
  id: string;
  title: string;
  page: SidebarPage;
  isPinned?: boolean;
}

export type SplitOrientation = "horizontal" | "vertical";
export type SplitPane = "primary" | "secondary";

export interface TabSplitState {
  orientation: SplitOrientation;
  /** 0.2–0.8，primary 占比 */
  ratio: number;
  secondaryTabIds: string[];
  secondaryActiveId: string;
  focusedPane: SplitPane;
}

export function pageKey(page: SidebarPage): string {
  if (typeof page === "string") return page;
  if ("note" in page) return `note:${page.note}`;
  return `notebook:${page.notebook}`;
}

export function titleForPage(page: SidebarPage): string {
  if (page === "workspaceHome") return t("笔记");
  if (page === "trash") return t("回收站");
  if (page === "settings") return t("设置");
  if (typeof page === "object" && "note" in page) {
    return page.note.split("/").pop() ?? page.note;
  }
  if (typeof page === "object" && "notebook" in page) {
    return page.notebook.split("/").pop() ?? page.notebook;
  }
  return "MeteorNoteEditor";
}

function remapPagePath(
  page: SidebarPage,
  oldPath: string,
  newPath: string,
  kind: "note" | "notebook",
): SidebarPage {
  if (typeof page !== "object") return page;
  if (kind === "note" && "note" in page && page.note === oldPath) {
    return { note: newPath };
  }
  if (kind === "notebook") {
    if ("notebook" in page) {
      if (page.notebook === oldPath) return { notebook: newPath };
      if (page.notebook.startsWith(`${oldPath}/`)) {
        return { notebook: newPath + page.notebook.slice(oldPath.length) };
      }
    }
    if ("note" in page && page.note.startsWith(`${oldPath}/`)) {
      return { note: newPath + page.note.slice(oldPath.length) };
    }
  }
  return page;
}

type StoreGet = () => AppState;
type StoreSet = (
  partial:
    | Partial<AppState>
    | ((state: AppState) => Partial<AppState>),
) => void;

function remapPaths(
  get: StoreGet,
  set: StoreSet,
  oldPath: string,
  newPath: string,
  kind: "note" | "notebook",
) {
  if (oldPath === newPath) return;
  const state = get();
  const tabs = state.tabs.map((t) => {
    const page = remapPagePath(t.page, oldPath, newPath, kind);
    return {
      ...t,
      page,
      title: titleForPage(page),
    };
  });
  const selected = remapPagePath(state.selected, oldPath, newPath, kind);
  const notePath =
    state.notePath === oldPath
      ? newPath
      : kind === "notebook" && state.notePath?.startsWith(`${oldPath}/`)
        ? newPath + state.notePath.slice(oldPath.length)
        : state.notePath;
  const expandedNotebooks = new Set(
    [...state.expandedNotebooks].map((id) => {
      if (id === oldPath) return newPath;
      if (kind === "notebook" && id.startsWith(`${oldPath}/`)) {
        return newPath + id.slice(oldPath.length);
      }
      return id;
    }),
  );
  const favoriteKeys = new Set(
    [...state.favoriteKeys].map((key) => {
      if (kind === "note" && key === `note:${oldPath}`) return `note:${newPath}`;
      if (kind === "notebook") {
        if (key === `notebook:${oldPath}`) return `notebook:${newPath}`;
        if (key.startsWith(`notebook:${oldPath}/`)) {
          return `notebook:${newPath}${key.slice(`notebook:${oldPath}`.length)}`;
        }
        if (key.startsWith(`note:${oldPath}/`)) {
          return `note:${newPath}${key.slice(`note:${oldPath}`.length)}`;
        }
      }
      return key;
    }),
  );
  writeFavorites(favoriteKeys);
  set({ tabs, selected, notePath, expandedNotebooks, favoriteKeys });
}

function findNotebookByPath(
  nodes: LibraryNotebook[],
  path: string,
): LibraryNotebook | null {
  for (const node of nodes) {
    if (node.id === path) return node;
    const hit = findNotebookByPath(node.children, path);
    if (hit) return hit;
  }
  return null;
}

function findNoteLocation(
  nodes: LibraryNotebook[],
  path: string,
): { notebook: LibraryNotebook; note: LibraryNote } | null {
  for (const node of nodes) {
    const note = node.notes.find((x) => x.id === path);
    if (note) return { notebook: node, note };
    const hit = findNoteLocation(node.children, path);
    if (hit) return hit;
  }
  return null;
}

interface AppState {
  notebooks: LibraryNotebook[];
  selected: SidebarPage;
  tabs: BrowserTab[];
  activeTabId: string | null;
  split: TabSplitState | null;
  noteDraft: string;
  notePath: string | null;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  expandedNotebooks: Set<string>;
  searchText: string;
  trashCount: number;
  favoriteKeys: Set<string>;
  loading: boolean;
  error: string | null;

  bootstrap: () => Promise<void>;
  applyPathChange: (change: api.PathChange) => Promise<void>;
  select: (page: SidebarPage) => Promise<void>;
  activateTab: (id: string, pane?: SplitPane) => Promise<void>;
  closeTab: (id: string) => Promise<void>;
  closeOtherTabs: (id: string) => Promise<void>;
  closeAllTabs: () => Promise<void>;
  reorderTabs: (fromId: string, toIndex: number, pane?: SplitPane) => void;
  beginTabSplit: (tabId: string, orientation: SplitOrientation) => void;
  endTabSplit: () => void;
  setSplitRatio: (ratio: number) => void;
  focusSplitPane: (pane: SplitPane) => void;
  toggleTabPin: (id: string) => void;
  reloadTab: (id: string) => Promise<void>;
  toggleFavorite: (page: SidebarPage) => void;
  deleteNote: (path: string) => Promise<void>;
  deleteNotebook: (path: string) => Promise<void>;
  renameNote: (path: string, title: string) => Promise<string>;
  renameNotebook: (path: string, name: string) => Promise<void>;
  setNotebookIcon: (path: string, icon: string) => Promise<void>;
  setNotebookColor: (path: string, colorHex: string | null) => Promise<void>;
  setNotebookAppearance: (
    path: string,
    icon: string,
    colorHex: string | null,
  ) => Promise<void>;
  setNoteIcon: (path: string, icon: string) => Promise<void>;
  setNoteAppearance: (
    path: string,
    icon: string,
    colorHex: string | null,
  ) => Promise<void>;
  moveNote: (path: string, toNotebookPath: string) => Promise<void>;
  moveNoteToNotebook: (
    path: string,
    toNotebookPath: string,
    beforeNotePath?: string | null,
  ) => Promise<string>;
  moveNotebookToParent: (
    path: string,
    toParentPath: string | null,
    beforeNotebookPath?: string | null,
  ) => Promise<string>;
  createNoteInNotebook: (notebookPath: string) => Promise<string>;
  createChildNotebook: (parentPath: string) => Promise<string>;
  revealPath: (path: string) => Promise<void>;
  setDraft: (text: string) => void;
  saveDraft: () => Promise<void>;
  createQuickNote: () => Promise<string>;
  createRootNotebook: () => Promise<string>;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  toggleNotebook: (path: string) => void;
  setSearchText: (text: string) => void;
  refresh: () => Promise<void>;
  clearError: () => void;
}

function firstNotebook(notebooks: LibraryNotebook[]): string | null {
  return notebooks[0]?.id ?? null;
}

const homeTab: BrowserTab = {
  id: "tab-home",
  title: t("笔记"),
  page: "workspaceHome",
};

async function flushBeforeNavigation(set: StoreSet): Promise<boolean> {
  try { await api.flushDrafts(); return true; }
  catch (error) {
    set({ error: t("保存失败，已保留当前编辑：{0}", errorMessage(error)) });
    return false;
  }
}

async function removeDeletedPages(
  get: StoreGet,
  set: StoreSet,
  path: string,
  kind: "note" | "notebook",
) {
  const matchesPath = (candidate: string) =>
    candidate === path || (kind === "notebook" && candidate.startsWith(`${path}/`));
  const matchesPage = (page: SidebarPage) =>
    typeof page === "object" &&
    ("note" in page
      ? matchesPath(page.note)
      : kind === "notebook" && matchesPath(page.notebook));
  const state = get();
  let tabs = state.tabs.filter((tab) => !matchesPage(tab.page));
  if (!tabs.length) {
    tabs = [{ ...homeTab, id: `tab-home-${crypto.randomUUID().slice(0, 6)}` }];
  }
  let split = state.split;
  if (split) {
    const secondaryTabIds = split.secondaryTabIds.filter((id) => tabs.some((t) => t.id === id));
    const hasPrimary = tabs.some((t) => !secondaryTabIds.includes(t.id));
    split = secondaryTabIds.length && hasPrimary
      ? {
          ...split,
          secondaryTabIds,
          secondaryActiveId: secondaryTabIds.includes(split.secondaryActiveId)
            ? split.secondaryActiveId
            : secondaryTabIds[0],
        }
      : null;
  }
  const primary = tabs.find((t) => t.id === state.activeTabId && !split?.secondaryTabIds.includes(t.id))
    ?? tabs.find((t) => !split?.secondaryTabIds.includes(t.id))!;
  const focused = split?.focusedPane === "secondary"
    ? tabs.find((t) => t.id === split.secondaryActiveId)!
    : primary;
  const favoriteKeys = new Set([...state.favoriteKeys].filter((key) =>
    !(key.startsWith("note:") && matchesPath(key.slice(5))) &&
    !(kind === "notebook" && key.startsWith("notebook:") && matchesPath(key.slice(9))),
  ));
  writeFavorites(favoriteKeys);
  const removedDraft = state.notePath !== null && matchesPath(state.notePath);
  // Clear the old draft before select() can try to save it back to its deleted path.
  set({
    tabs,
    activeTabId: primary.id,
    split,
    selected: focused.page,
    favoriteKeys,
    expandedNotebooks: new Set([...state.expandedNotebooks].filter((id) =>
      kind !== "notebook" || !matchesPath(id),
    )),
    ...(removedDraft ? { notePath: null, noteDraft: "", loading: false } : {}),
  });
  if (removedDraft || primary.id !== state.activeTabId || (state.split && !split)) {
    await get().activateTab(primary.id, "primary");
    if (split?.focusedPane === "secondary") {
      await get().activateTab(split.secondaryActiveId, "secondary");
    }
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  notebooks: [],
  selected: "workspaceHome",
  tabs: [homeTab],
  activeTabId: homeTab.id,
  split: null,
  noteDraft: "",
  notePath: null,
  sidebarCollapsed: false,
  sidebarWidth: readStoredSidebarWidth(),
  expandedNotebooks: new Set(),
  searchText: "",
  trashCount: 0,
  favoriteKeys: readFavorites(),
  loading: false,
  error: null,

  applyPathChange: async (change) => {
    await api.documents.relocate(change);
    remapPaths(get, set, change.from, change.to, change.kind);
    const path = get().notePath;
    const session = path ? api.documents.documents.get(path) : undefined;
    if (session) set({ noteDraft: session.draft });
    for (const path of api.documents.documents.keys()) await api.documents.checkExternal(path);
    await get().refresh();
  },

  bootstrap: async () => {
    set({ loading: true, error: null });
    try {
      const notebooks = await api.loadLibrary();
      const trash = await api.listTrash();
      set({
        notebooks,
        trashCount: trash.length,
        expandedNotebooks: new Set(notebooks.map((n) => n.id)),
        loading: false,
      });
    } catch (e) {
      set({
        loading: false,
        error: errorMessage(e),
      });
    }
  },

  select: async (page) => {
    if (!await flushBeforeNavigation(set)) return;
    const prev = get();

    const key = pageKey(page);
    let tabs = [...prev.tabs];
    let existing = tabs.find((t) => pageKey(t.page) === key);
    if (!existing) {
      existing = {
        id: `tab-${key}-${crypto.randomUUID().slice(0, 8)}`,
        title: titleForPage(page),
        page,
      };
      tabs = [...tabs, existing];
    }

    let split = prev.split;
    let activeTabId = existing.id;
    if (split) {
      const prefer = split.focusedPane;
      const inSecondary = split.secondaryTabIds.includes(existing.id);
      if (prefer === "secondary") {
        const secondaryTabIds = inSecondary
          ? split.secondaryTabIds
          : [...split.secondaryTabIds, existing.id];
        split = {
          ...split,
          secondaryTabIds,
          secondaryActiveId: existing.id,
          focusedPane: "secondary",
        };
        activeTabId = prev.activeTabId ?? activeTabId;
      } else if (inSecondary) {
        split = {
          ...split,
          secondaryActiveId: existing.id,
          focusedPane: "secondary",
        };
        activeTabId = prev.activeTabId ?? activeTabId;
      } else {
        split = { ...split, focusedPane: "primary" };
      }
    }

    if (typeof page === "object" && "note" in page) {
      const useStoreEditor = !split || split.focusedPane === "primary";
      set({
        selected: page,
        tabs,
        activeTabId,
        split,
        loading: useStoreEditor,
      });
      if (!useStoreEditor) return;
      try {
        const body = await api.readNote(page.note);
        if (pageKey(get().selected) !== pageKey(page)) return;
        set({ notePath: page.note, noteDraft: body, loading: false });
      } catch (e) {
        set({
          loading: false,
          error: errorMessage(e),
        });
      }
      return;
    }

    set({
      selected: page,
      tabs,
      activeTabId,
      split,
      notePath: null,
      noteDraft: "",
    });
  },

  activateTab: async (id, pane) => {
    if (!await flushBeforeNavigation(set)) return;
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    const split = get().split;
    if (split) {
      const targetPane =
        pane ??
        (split.secondaryTabIds.includes(id) ? "secondary" : "primary");
      if (targetPane === "secondary") {
        set({
          split: {
            ...split,
            secondaryActiveId: id,
            focusedPane: "secondary",
          },
          selected: tab.page,
        });
        return;
      }
      set({
        activeTabId: id,
        split: { ...split, focusedPane: "primary" },
      });
    }
    await get().select(tab.page);
  },

  closeTab: async (id) => {
    if (!await flushBeforeNavigation(set)) return;
    const { tabs, activeTabId, split } = get();
    const tab = tabs.find((t) => t.id === id);
    if (!tab || tab.isPinned) return;
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const nextTabs = tabs.filter((t) => t.id !== id);

    if (split?.secondaryTabIds.includes(id)) {
      const secondaryTabIds = split.secondaryTabIds.filter((x) => x !== id);
      if (secondaryTabIds.length === 0) {
        set({ tabs: nextTabs, split: null });
        if (activeTabId === id || !nextTabs.some((t) => t.id === activeTabId)) {
          const fallback = nextTabs[Math.max(0, idx - 1)] ?? nextTabs[0];
          await get().select(fallback.page);
        }
        return;
      }
      const secondaryActiveId =
        split.secondaryActiveId === id
          ? (secondaryTabIds[secondaryTabIds.length - 1] ?? secondaryTabIds[0])
          : split.secondaryActiveId;
      set({
        tabs: nextTabs,
        split: { ...split, secondaryTabIds, secondaryActiveId },
      });
      if (split.secondaryActiveId === id) {
        const next = nextTabs.find((t) => t.id === secondaryActiveId);
        if (next) set({ selected: next.page });
      }
      return;
    }

    const primaryLeft = nextTabs.filter(
      (t) => !split?.secondaryTabIds.includes(t.id),
    );
    if (split && primaryLeft.length === 0) {
      const secondaryActive =
        nextTabs.find((t) => t.id === split.secondaryActiveId) ?? nextTabs[0];
      set({
        tabs: nextTabs,
        split: null,
        activeTabId: secondaryActive?.id ?? null,
      });
      if (secondaryActive) await get().select(secondaryActive.page);
      return;
    }

    const wasActive = activeTabId === id;
    set({ tabs: nextTabs });
    if (wasActive) {
      const primary = nextTabs.filter(
        (t) => !split?.secondaryTabIds.includes(t.id),
      );
      const fallback =
        primary[Math.max(0, primary.length - 1)] ?? nextTabs[0];
      await get().activateTab(fallback.id, "primary");
    }
  },

  closeOtherTabs: async (id) => {
    if (!await flushBeforeNavigation(set)) return;
    const { tabs, activeTabId, split } = get();
    const nextTabs = tabs.filter((t) => t.id === id || t.isPinned);
    if (nextTabs.length === tabs.length) return;
    set({ tabs: nextTabs, split: null });
    if (!nextTabs.some((t) => t.id === activeTabId)) {
      const keep = nextTabs.find((t) => t.id === id) ?? nextTabs[0];
      if (keep) await get().select(keep.page);
    } else if (split) {
      const keep = nextTabs.find((t) => t.id === id);
      if (keep) await get().select(keep.page);
    }
  },

  closeAllTabs: async () => {
    if (!await flushBeforeNavigation(set)) return;
    const { tabs } = get();
    const pinned = tabs.filter((t) => t.isPinned);
    if (pinned.length === 0) {
      const home = tabs.find((t) => pageKey(t.page) === "workspaceHome") ?? {
        ...homeTab,
        id: `tab-home-${crypto.randomUUID().slice(0, 6)}`,
      };
      set({ tabs: [home], activeTabId: home.id, split: null });
      await get().select("workspaceHome");
      return;
    }
    set({ tabs: pinned, split: null });
    await get().select(pinned[0].page);
  },

  reorderTabs: (fromId, toIndex, pane) => {
    set((s) => {
      if (s.split && pane === "secondary") {
        const ids = [...s.split.secondaryTabIds];
        const from = ids.indexOf(fromId);
        if (from < 0) return s;
        const to = Math.max(0, Math.min(Math.floor(toIndex), ids.length - 1));
        if (from === to) return s;
        const [moved] = ids.splice(from, 1);
        ids.splice(to, 0, moved);
        return { split: { ...s.split, secondaryTabIds: ids } };
      }

      if (s.split && pane === "primary") {
        const primary = s.tabs.filter(
          (t) => !s.split!.secondaryTabIds.includes(t.id),
        );
        const fromLocal = primary.findIndex((t) => t.id === fromId);
        if (fromLocal < 0) return s;
        const toLocal = Math.max(
          0,
          Math.min(Math.floor(toIndex), primary.length - 1),
        );
        if (fromLocal === toLocal) return s;
        const nextPrimary = [...primary];
        const [moved] = nextPrimary.splice(fromLocal, 1);
        nextPrimary.splice(toLocal, 0, moved);
        const secondary = s.tabs.filter((t) =>
          s.split!.secondaryTabIds.includes(t.id),
        );
        return { tabs: [...nextPrimary, ...secondary] };
      }

      const tabs = [...s.tabs];
      const from = tabs.findIndex((t) => t.id === fromId);
      if (from < 0) return s;
      const to = Math.max(0, Math.min(Math.floor(toIndex), tabs.length - 1));
      if (from === to) return s;
      const [moved] = tabs.splice(from, 1);
      tabs.splice(to, 0, moved);
      return { tabs };
    });
  },

  beginTabSplit: async (tabId, orientation) => {
    if (!await flushBeforeNavigation(set)) return;
    const { tabs, activeTabId, split } = get();
    if (split) return;
    if (tabs.length < 2) return;
    if (!tabs.some((t) => t.id === tabId)) return;
    const primaryTabs = tabs.filter((t) => t.id !== tabId);
    if (primaryTabs.length === 0) return;
    const primaryActive =
      activeTabId && activeTabId !== tabId
        ? activeTabId
        : (primaryTabs[primaryTabs.length - 1]?.id ?? primaryTabs[0].id);
    set({
      activeTabId: primaryActive,
      split: {
        orientation,
        ratio: 0.5,
        secondaryTabIds: [tabId],
        secondaryActiveId: tabId,
        focusedPane: "secondary",
      },
    });
    const secondary = tabs.find((t) => t.id === tabId);
    if (secondary) set({ selected: secondary.page });
  },

  endTabSplit: async () => {
    if (!await flushBeforeNavigation(set)) return;
    const { split, activeTabId, tabs } = get();
    if (!split) return;
    const focusId =
      split.focusedPane === "secondary"
        ? split.secondaryActiveId
        : activeTabId;
    set({ split: null });
    const tab = tabs.find((t) => t.id === focusId) ?? tabs[0];
    if (tab) void get().select(tab.page);
  },

  setSplitRatio: (ratio) => {
    set((s) => {
      if (!s.split) return s;
      const next = Math.min(0.8, Math.max(0.2, ratio));
      return { split: { ...s.split, ratio: next } };
    });
  },

  focusSplitPane: (pane) => {
    set((s) => {
      if (!s.split) return s;
      return { split: { ...s.split, focusedPane: pane } };
    });
  },

  toggleTabPin: (id) => {
    set((s) => {
      const tabs = s.tabs.map((t) =>
        t.id === id ? { ...t, isPinned: !t.isPinned } : t,
      );
      // 固定标签靠前
      tabs.sort((a, b) => Number(!!b.isPinned) - Number(!!a.isPinned));
      return { tabs };
    });
  },

  reloadTab: async (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    if (typeof tab.page === "object" && "note" in tab.page) {
      try {
        const body = await api.readNote(tab.page.note);
        if (get().activeTabId === id) {
          set({ notePath: tab.page.note, noteDraft: body });
        }
      } catch (e) {
        set({ error: errorMessage(e) });
      }
      return;
    }
    await get().select(tab.page);
  },

  toggleFavorite: (page) => {
    const key = pageKey(page);
    set((s) => {
      const next = new Set(s.favoriteKeys);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeFavorites(next);
      return { favoriteKeys: next };
    });
  },

  deleteNote: async (path) => {
    try {
      if (get().notePath === path) await get().saveDraft();
      await api.moveNoteToTrash(path);
      await removeDeletedPages(get, set, path, "note");
      await get().refresh();
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  deleteNotebook: async (path) => {
    try {
      if (get().notePath?.startsWith(`${path}/`)) await get().saveDraft();
      await api.moveNotebookToTrash(path);
      await removeDeletedPages(get, set, path, "notebook");
      await get().refresh();
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  renameNote: async (path, title) => {
    try {
      const newPath = await api.renameNote(path, title);
      remapPaths(get, set, path, newPath, "note");
      await get().refresh();
      const selected = get().selected;
      if (typeof selected === "object" && "note" in selected && selected.note === newPath) {
        const activeTabId = get().activeTabId;
        if (activeTabId) {
          await get().reloadTab(activeTabId);
        } else {
          const body = await api.readNote(newPath);
          set({ notePath: newPath, noteDraft: body });
        }
      }
      return newPath;
    } catch (e) {
      set({ error: errorMessage(e) });
      throw e;
    }
  },

  renameNotebook: async (path, name) => {
    try {
      const newPath = await api.renameNotebook(path, name);
      remapPaths(get, set, path, newPath, "notebook");
      await get().refresh();
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  setNotebookIcon: async (path, icon) => {
    try {
      await api.setNotebookIcon(path, icon);
      await get().refresh();
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  setNotebookColor: async (path, colorHex) => {
    try {
      await api.setNotebookColor(path, colorHex);
      await get().refresh();
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  setNotebookAppearance: async (path, icon, colorHex) => {
    try {
      await api.setNotebookAppearance(path, icon, colorHex);
      await get().refresh();
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  setNoteIcon: async (path, icon) => {
    try {
      await api.setNoteIcon(path, icon);
      await get().refresh();
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  setNoteAppearance: async (path, icon, colorHex) => {
    try {
      await api.setNoteAppearance(path, icon, colorHex);
      await get().refresh();
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  moveNote: async (path, toNotebookPath) => {
    try {
      const newPath = await api.moveNote(path, toNotebookPath);
      remapPaths(get, set, path, newPath, "note");
      await get().refresh();
      set((s) => {
        const next = new Set(s.expandedNotebooks);
        next.add(toNotebookPath);
        return { expandedNotebooks: next };
      });
      const selected = get().selected;
      if (
        typeof selected === "object" &&
        "note" in selected &&
        (selected.note === path || selected.note === newPath)
      ) {
        await get().select({ note: newPath });
      }
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  moveNoteToNotebook: async (path, toNotebookPath, beforeNotePath = null) => {
    try {
      const state = get();
      const source = findNoteLocation(state.notebooks, path);
      if (!source) throw new Error(t("笔记不存在"));

      const targetNotebook = findNotebookByPath(state.notebooks, toNotebookPath);
      if (!targetNotebook) throw new Error(t("目标笔记本不存在"));

      const sourceNotebookPath = source.notebook.id;
      let newPath = path;

      const resolveBeforeTitle = () => {
        if (!beforeNotePath) return null;
        return (
          findNoteLocation(state.notebooks, beforeNotePath)?.note.title ?? null
        );
      };

      const insertBefore = (ordered: string[], title: string, beforeTitle: string | null) => {
        const next = ordered.filter((item) => item !== title);
        if (!beforeTitle) {
          next.push(title);
          return next;
        }
        const index = next.indexOf(beforeTitle);
        if (index < 0) {
          next.push(title);
          return next;
        }
        next.splice(index, 0, title);
        return next;
      };

      if (sourceNotebookPath === toNotebookPath) {
        const ordered = source.notebook.notes.map((item) => item.title);
        const next = insertBefore(ordered, source.note.title, resolveBeforeTitle());
        await api.reorderNotes(toNotebookPath, next);
      } else {
        newPath = await api.moveNote(path, toNotebookPath);
        const newTitle = newPath.split("/").pop() ?? source.note.title;
        remapPaths(get, set, path, newPath, "note");
        const ordered = targetNotebook.notes.map((item) => item.title);
        const next = insertBefore(ordered, newTitle, resolveBeforeTitle());
        await api.reorderNotes(toNotebookPath, next);
      }

      await get().refresh();
      const selected = get().selected;
      if (
        typeof selected === "object" &&
        "note" in selected &&
        (selected.note === path || selected.note === newPath)
      ) {
        await get().select({ note: newPath });
      }
      return newPath;
    } catch (e) {
      set({ error: errorMessage(e) });
      throw e;
    }
  },

  moveNotebookToParent: async (
    path,
    toParentPath,
    beforeNotebookPath = null,
  ) => {
    try {
      const newPath = await api.moveNotebook(path, toParentPath, beforeNotebookPath);
      remapPaths(get, set, path, newPath, "notebook");
      await get().refresh();
      if (toParentPath) {
        set((s) => {
          const next = new Set(s.expandedNotebooks);
          next.add(toParentPath);
          return { expandedNotebooks: next };
        });
      }
      return newPath;
    } catch (e) {
      set({ error: errorMessage(e) });
      throw e;
    }
  },

  createNoteInNotebook: async (notebookPath) => {
    try {
      const path = await api.createNote(notebookPath);
      await get().refresh();
      set((s) => {
        const next = new Set(s.expandedNotebooks);
        next.add(notebookPath);
        return { expandedNotebooks: next };
      });
      await get().select({ note: path });
      return path;
    } catch (e) {
      set({ error: errorMessage(e) });
      throw e;
    }
  },

  createChildNotebook: async (parentPath) => {
    try {
      const id = await api.createNotebook(t("新建笔记本"), parentPath);
      await get().refresh();
      set((s) => {
        const next = new Set(s.expandedNotebooks);
        next.add(parentPath);
        return { expandedNotebooks: next };
      });
      await get().select({ notebook: id });
      return id;
    } catch (e) {
      set({ error: errorMessage(e) });
      throw e;
    }
  },

  revealPath: async (path) => {
    try {
      await api.revealInFinder(path);
    } catch (e) {
      set({ error: errorMessage(e) });
    }
  },

  setDraft: (text) => {
    const path = get().notePath;
    if (path) api.stageDraft(path, text);
    set({ noteDraft: text });
  },

  saveDraft: async () => {
    const { notePath, noteDraft } = get();
    if (!notePath) return;
    await api.writeNote(notePath, noteDraft);
  },

  createQuickNote: async () => {
    const { notebooks } = get();
    let nb = firstNotebook(notebooks);
    try {
      if (!nb) {
        nb = await api.createNotebook(t("新建笔记本"));
        await get().refresh();
      }
      const path = await api.createNote(nb);
      await get().refresh();
      await get().select({ note: path });
      return path;
    } catch (e) {
      set({ error: errorMessage(e) });
      throw e;
    }
  },

  createRootNotebook: async () => {
    try {
      const id = await api.createNotebook(t("新建笔记本"));
      await get().refresh();
      await get().select({ notebook: id });
      return id;
    } catch (e) {
      set({ error: errorMessage(e) });
      throw e;
    }
  },

  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  setSidebarWidth: (width) => {
    const sidebarWidth = clampSidebarWidth(width);
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
    } catch {
      /* ignore quota */
    }
    set({ sidebarWidth });
  },

  toggleNotebook: (path) =>
    set((s) => {
      const next = new Set(s.expandedNotebooks);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return { expandedNotebooks: next };
    }),



  setSearchText: (text) => set({ searchText: text }),

  refresh: async () => {
    const notebooks = await api.loadLibrary();
    const trash = await api.listTrash();
    const state = get();
    const shared = reconcileNotebooks(state.notebooks, notebooks);
    if (shared !== state.notebooks || trash.length !== state.trashCount)
      set({ notebooks: shared, trashCount: trash.length });
  },

  clearError: () => set({ error: null }),
}));
