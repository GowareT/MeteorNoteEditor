import { getLocale, t, errorMessage } from "@/lib/i18n";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, } from "react";
import { openImageInsertDialog } from "@/lib/editorImages";
import { ContextMenu, type ContextMenuItem } from "@/components/ContextMenu";
import { Icon } from "@/components/Icon";
import { NoteMarkdownEditor, type NoteMarkdownEditorHandle, } from "@/components/NoteMarkdownEditor";
import { NoteEditorToolbar, NoteEditorToolbarReveal, } from "@/components/NoteEditorToolbar";
import { NoteHistoryPanel } from "@/components/NoteHistoryPanel";
import * as api from "@/lib/api";
import { takeSearchResult } from "@/lib/searchLocation";
import { supportsNativePdf } from "@/lib/platform";
import { parseOutlineHeadings, type OutlineHeading } from "@/lib/outline";
import { useLibraryTransfer } from "@/hooks/useLibraryTransfer";
import { ensureLeadingTitle, extractLeadingTitle, isValidNoteTitle, syncLeadingTitle, } from "@/lib/noteTitle";
import { useAppStore } from "@/store/appStore";
import { editorThemeBackground, settingsPrefs, } from "@/lib/settingsPrefs";
import "@/styles/pages.css";
type EditorViewMode = "live" | "reading" | "source";
type SaveStatus = "saved" | "saving" | "dirty" | "error";
const PANEL_WIDTH_MIN = 180;
const PANEL_WIDTH_MAX = 720;
const OUTLINE_WIDTH_KEY = "mn.noteOutlineWidth";
const OUTLINE_WIDTH_MIN = 140;
const OUTLINE_WIDTH_MAX = 320;
const OUTLINE_WIDTH_DEFAULT = 180;
const TOOLBAR_OPEN_KEY = "mn.noteToolbarOpen";
function readToolbarOpen() {
    try {
        const v = localStorage.getItem(TOOLBAR_OPEN_KEY);
        if (v === null)
            return true;
        return v !== "0";
    }
    catch {
        return true;
    }
}
function readOutlineOpen() {
    return false;
}
function clampPanelWidth(width: number, min = PANEL_WIDTH_MIN, max = PANEL_WIDTH_MAX) {
    return Math.min(max, Math.max(min, Math.round(width)));
}
function readStoredWidth(key: string, fallback: number, min = PANEL_WIDTH_MIN, max = PANEL_WIDTH_MAX) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw)
            return fallback;
        const n = Number(raw);
        if (!Number.isFinite(n))
            return fallback;
        return clampPanelWidth(n, min, max);
    }
    catch {
        return fallback;
    }
}
function formatStatusTime(ts: number) {
    return new Date(ts).toLocaleTimeString(getLocale(), {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });
}
function formatDocumentPath(path: string) {
    return path
        .split("/")
        .filter(Boolean)
        .join(" / ");
}
function useResizablePanelWidth(storageKey: string, defaultWidth: number, options?: {
    min?: number;
    max?: number;
    /** left：分隔条在面板左侧（侧栏）；right：分隔条在面板右侧（大纲） */
    edge?: "left" | "right";
}) {
    const min = options?.min ?? PANEL_WIDTH_MIN;
    const max = options?.max ?? PANEL_WIDTH_MAX;
    const edge = options?.edge ?? "left";
    const [width, setWidth] = useState(() => readStoredWidth(storageKey, defaultWidth, min, max));
    const [resizing, setResizing] = useState(false);
    const dragRef = useRef<{
        startX: number;
        startWidth: number;
    } | null>(null);
    const widthRef = useRef(width);
    widthRef.current = width;
    const persist = useCallback((next: number) => {
        const clamped = clampPanelWidth(next, min, max);
        setWidth(clamped);
        try {
            localStorage.setItem(storageKey, String(clamped));
        }
        catch {
            /* ignore */
        }
    }, [storageKey, min, max]);
    const onResizePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0)
            return;
        event.preventDefault();
        event.stopPropagation();
        const target = event.currentTarget;
        target.setPointerCapture(event.pointerId);
        dragRef.current = {
            startX: event.clientX,
            startWidth: widthRef.current,
        };
        setResizing(true);
        const onMove = (ev: PointerEvent) => {
            const drag = dragRef.current;
            if (!drag)
                return;
            const delta = edge === "right"
                ? ev.clientX - drag.startX
                : drag.startX - ev.clientX;
            persist(drag.startWidth + delta);
        };
        const onUp = (ev: PointerEvent) => {
            if (dragRef.current == null)
                return;
            dragRef.current = null;
            setResizing(false);
            try {
                target.releasePointerCapture(ev.pointerId);
            }
            catch {
                /* ignore */
            }
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
    }, [edge, persist]);
    return { width, setWidth: persist, resizing, onResizePointerDown };
}
function useEditorChrome() {
    const [fontSize, setFontSize] = useState(settingsPrefs.getEditorFontSize);
    const [theme, setTheme] = useState(settingsPrefs.getEditorTheme);
    const [dark, setDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
    useEffect(() => {
        const sync = () => {
            setFontSize(settingsPrefs.getEditorFontSize());
            setTheme(settingsPrefs.getEditorTheme());
            const forced = document.documentElement.getAttribute("data-theme");
            if (forced === "dark")
                setDark(true);
            else if (forced === "light")
                setDark(false);
            else
                setDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
        };
        sync();
        window.addEventListener("mn-prefs-changed", sync);
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        mq.addEventListener("change", sync);
        return () => {
            window.removeEventListener("mn-prefs-changed", sync);
            mq.removeEventListener("change", sync);
        };
    }, []);
    return {
        fontSize,
        background: editorThemeBackground(theme, dark) ?? undefined,
    };
}
// Updating the clock must not rerender the editor and toolbar every second.
function StatusClock() {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, []);
    return <span>{t("当前：{0}", formatStatusTime(now))}</span>;
}

export function NoteEditorView({ path, detached = false, }: {
    path: string;
    /** 分屏等场景：本地读写，避免两屏共用一份 draft */
    detached?: boolean;
}) {
    const transfer = useLibraryTransfer(path);
    const renameNote = useAppStore((s) => s.renameNote);
    const storeNotePath = useAppStore((s) => s.notePath);
    const storeDraft = useAppStore((s) => s.noteDraft);
    const setStoreDraft = useAppStore((s) => s.setDraft);
    const saveStoreDraft = useAppStore((s) => s.saveDraft);
    const chrome = useEditorChrome();
    const bodyFontSize = Math.max(15, chrome.fontSize);
    const title = path.split("/").pop() ?? path;
    const timer = useRef<number | null>(null);
    const renameTimer = useRef<number | null>(null);
    const renamingRef = useRef(false);
    const editorRef = useRef<NoteMarkdownEditorHandle>(null);
    const [localDraft, setLocalDraft] = useState("");
    const [localReady, setLocalReady] = useState(!detached);
    const [viewMode, setViewMode] = useState<EditorViewMode>("live");
    const [moreMenu, setMoreMenu] = useState<{
        x: number;
        y: number;
    } | null>(null);
    const [outlineMenu, setOutlineMenu] = useState<{
        x: number;
        y: number;
    } | null>(null);
    const [editorMenu, setEditorMenu] = useState<{
        x: number;
        y: number;
        selection: string;
    } | null>(null);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [toolbarOpen, setToolbarOpen] = useState(readToolbarOpen);
    const [outlineOpen, setOutlineOpen] = useState(readOutlineOpen);
    const [outlineCollapsed, setOutlineCollapsed] = useState<Set<string>>(() => new Set());
    const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
    const [lastSavedAt, setLastSavedAt] = useState<number>(() => Date.now());
    const [libraryRootPath, setLibraryRootPath] = useState<string | null>(null);
    useEffect(() => {
        let cancelled = false;
        void api.libraryRootPath().then((root) => {
            if (!cancelled)
                setLibraryRootPath(root);
        });
        return () => {
            cancelled = true;
        };
    }, []);
    const outlinePanel = useResizablePanelWidth(OUTLINE_WIDTH_KEY, OUTLINE_WIDTH_DEFAULT, {
        min: OUTLINE_WIDTH_MIN,
        max: OUTLINE_WIDTH_MAX,
        edge: "right",
    });
    const noteContentReady = detached ? localReady : storeNotePath === path;
    const draft = detached ? localDraft : noteContentReady ? storeDraft : "";
    const setDraftRaw = detached ? setLocalDraft : setStoreDraft;
    const setDraft = useCallback((next: string) => {
        if (!detached && !noteContentReady)
            return;
        const content = ensureLeadingTitle(next, title);
        api.stageDraft(path, content);
        setDraftRaw(content);
    }, [detached, noteContentReady, path, setDraftRaw, title]);
    const outlineHeadings = useMemo(() => parseOutlineHeadings(draft), [draft]);
    useEffect(() => {
        if (!noteContentReady) return;
        const reveal = () => {
            const target = takeSearchResult(path);
            if (!target) return;
            const lines = draft.split("\n");
            const offset = lines.slice(0, Math.max(0, target.line - 1)).reduce((total, line) => total + line.length + 1, 0);
            requestAnimationFrame(() => editorRef.current?.gotoOffset(offset));
        };
        reveal();
        window.addEventListener("mne-reveal-search", reveal);
        return () => window.removeEventListener("mne-reveal-search", reveal);
    }, [noteContentReady, path, draft]);
    const visibleOutlineHeadings = useMemo(() => {
        const visible: OutlineHeading[] = [];
        let hideBelow: number | null = null;
        for (const h of outlineHeadings) {
            if (hideBelow != null && h.level > hideBelow)
                continue;
            hideBelow = null;
            visible.push(h);
            if (outlineCollapsed.has(h.id))
                hideBelow = h.level;
        }
        return visible;
    }, [outlineHeadings, outlineCollapsed]);
    const outlineHasChildren = useMemo(() => {
        const map = new Map<string, boolean>();
        for (let i = 0; i < outlineHeadings.length; i++) {
            const cur = outlineHeadings[i]!;
            const next = outlineHeadings[i + 1];
            map.set(cur.id, !!next && next.level > cur.level);
        }
        return map;
    }, [outlineHeadings]);
    const toggleOutlineOpen = useCallback(() => {
        setOutlineOpen((prev) => !prev);
    }, []);
    const toggleOutlineBranch = useCallback((id: string) => {
        setOutlineCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(id))
                next.delete(id);
            else
                next.add(id);
            return next;
        });
    }, []);
    const jumpToOutlineHeading = useCallback((heading: OutlineHeading) => {
        editorRef.current?.gotoOffset(heading.offset);
    }, [viewMode]);
    useEffect(() => {
        if (!detached) {
            setLocalReady(true);
            return;
        }
        let cancelled = false;
        setLocalReady(false);
        void api.readNote(path).then((body) => {
            if (!cancelled) {
                const noteTitle = path.split("/").pop() ?? path;
                setLocalDraft(ensureLeadingTitle(body, noteTitle));
                setLocalReady(true);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [detached, path]);
    useEffect(() => {
        const sync = () => {
            const session = api.documents.documents.get(path);
            if (!session) return;
            if (detached) setLocalDraft(session.draft);
            else if (useAppStore.getState().notePath === path) useAppStore.setState({ noteDraft: session.draft });
            setSaveStatus(session.error ? "error" : session.saving ? "saving" : session.base !== session.draft ? "dirty" : "saved");
            if (!session.error && !session.saving && session.base === session.draft) setLastSavedAt(Date.now());
        };
        sync();
        return api.documents.subscribe(sync);
    }, [path, detached]);
    useEffect(() => {
        if (!noteContentReady) return;
        const session = api.documents.documents.get(path);
        if (!session || session.draft === session.base || session.error?.includes("CONFLICT:")) return;
        timer.current = window.setTimeout(() => {
            void api.documents.save(path).catch(() => setSaveStatus("error"));
        }, 600);
        return () => { if (timer.current) window.clearTimeout(timer.current); };
    }, [draft, noteContentReady, path]);
    useEffect(() => {
        setViewMode("live");
        setMoreMenu(null);
        setOutlineMenu(null);
        setEditorMenu(null);
        setHistoryOpen(false);
        setSaveStatus("saved");
        setLastSavedAt(Date.now());
    }, [path]);
    // 打开 / 重命名笔记时，让正文首行标题跟随当前文件名
    useEffect(() => {
        if (!noteContentReady)
            return;
        const ensured = syncLeadingTitle(draft, title);
        if (ensured !== draft) {
            api.stageDraft(path, ensured);
            setDraftRaw(ensured);
        }
        // 仅在路径切换 / 初次就绪时校正
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [path, noteContentReady]);
    // 正文首行 H1 变更 → 重命名笔记文件
    useEffect(() => {
        if (!noteContentReady)
            return;
        if (renamingRef.current)
            return;
        const heading = extractLeadingTitle(draft);
        if (!heading || heading === title || !isValidNoteTitle(heading))
            return;
        if (renameTimer.current)
            window.clearTimeout(renameTimer.current);
        renameTimer.current = window.setTimeout(() => {
            void (async () => {
                if (renamingRef.current)
                    return;
                renamingRef.current = true;
                try {
                    if (detached)
                        await api.writeNote(path, draft);
                    else
                        await saveStoreDraft();
                    await renameNote(path, heading);
                }
                catch (error) {
                    useAppStore.setState({ error: errorMessage(error) });
                }
                finally {
                    renamingRef.current = false;
                }
            })();
        }, 900);
        return () => {
            if (renameTimer.current)
                window.clearTimeout(renameTimer.current);
        };
    }, [
        draft,
        title,
        path,
        detached,
        noteContentReady,
        renameNote,
        saveStoreDraft,
    ]);
    const runEditorCommand = async (command: "copy" | "cut" | "paste" | "selectAll") => {
        const ed = editorRef.current;
        if (!ed)
            return;
        if (command === "selectAll") {
            ed.selectAll();
            return;
        }
        await ed.runClipboard(command);
    };
    const runInsertCommand = useCallback((kind: "link" | "image" | "image-url" | "image-local" | "callout" | "code" | "table" | "quote" | "hr" | "math") => {
        const ed = editorRef.current;
        if (!ed)
            return;
        if (kind === "image" || kind === "image-local" || kind === "image-url") {
            openImageInsertDialog(async (src) => { await ed.insertImage(src, path); });
            return;
        }
        if (kind === "callout") {
            ed.insertCallout();
            return;
        }
        ed.applyFormat({
            type: "insert",
            kind,
        });
    }, [path]);
    const onEditorContextMenu = (info: {
        x: number;
        y: number;
        selection: string;
    }) => {
        setMoreMenu(null);
        setEditorMenu(info);
    };
    const insertMenuItems = useMemo((): ContextMenuItem[] => [
        {
            id: "ins-link",
            label: t("链接"),
            onSelect: () => runInsertCommand("link"),
        },
        {
            id: "ins-image",
            label: t("图片…"),
            onSelect: () => runInsertCommand("image"),
        },
        {
            id: "ins-callout",
            label: t("高亮块"),
            onSelect: () => runInsertCommand("callout"),
        },
        {
            id: "ins-code",
            label: t("代码块"),
            onSelect: () => runInsertCommand("code"),
        },
        {
            id: "ins-table",
            label: t("表格"),
            onSelect: () => runInsertCommand("table"),
        },
        {
            id: "ins-quote",
            label: t("引用"),
            onSelect: () => runInsertCommand("quote"),
        },
        {
            id: "ins-hr",
            label: t("分割线"),
            onSelect: () => runInsertCommand("hr"),
        },
        {
            id: "ins-math",
            label: t("行内公式"),
            onSelect: () => runInsertCommand("math"),
        },
    ], [runInsertCommand]);
    const editorMenuItems = useMemo((): ContextMenuItem[] => {
        if (!editorMenu)
            return [];
        const hasSelection = editorMenu.selection.trim().length > 0;
        const items: ContextMenuItem[] = [];
        items.push({ id: "sep-insert", label: "", separator: true }, {
            id: "insert",
            label: t("插入"),
            submenu: insertMenuItems,
        }, { id: "sep-note", label: "", separator: true }, {
            id: "outline",
            label: t("标题大纲"),
            checked: outlineOpen,
            onSelect: () => toggleOutlineOpen(),
        }, {
            id: "reading",
            label: t("阅读模式"),
            checked: viewMode === "reading",
            onSelect: () => setViewMode((m) => (m === "reading" ? "live" : "reading")),
        }, {
            id: "source",
            label: t("源码模式"),
            checked: viewMode === "source",
            onSelect: () => setViewMode((m) => (m === "source" ? "live" : "source")),
        }, { id: "sep-hist-2", label: "", separator: true }, {
            id: "history",
            label: t("历史版本"),
            checked: historyOpen,
            onSelect: () => setHistoryOpen((open) => !open),
        });
        items.push({
            id: "cut",
            label: t("剪切"),
            disabled: !hasSelection,
            onSelect: () => void runEditorCommand("cut"),
        }, {
            id: "copy",
            label: t("复制"),
            disabled: !hasSelection,
            onSelect: () => void runEditorCommand("copy"),
        }, {
            id: "paste",
            label: t("粘贴"),
            onSelect: () => void runEditorCommand("paste"),
        });
        return items;
    }, [
        editorMenu,
        draft,
        title,
        outlineOpen,
        toggleOutlineOpen,
        historyOpen,
        viewMode,
        insertMenuItems,
    ]);
    const moreItems = useMemo((): ContextMenuItem[] => {
        return [
            {
                id: "export",
                label: t("导出"),
                disabled: transfer.busy,
                submenu: [
                    { id: "export-note", label: t("当前笔记（Markdown）…"), description: t("保存正文和图片到文件夹，可继续编辑"), onSelect: () => void transfer.run("export-note") },
                    { id: "export-pdf", label: t("当前笔记（PDF）…"), description: supportsNativePdf() ? t("保存排版后的文档，适合分享和打印") : t("保存排版后的文档，仅 macOS 和 Windows 支持"), disabled: !supportsNativePdf(), onSelect: () => void transfer.run("pdf") },
                ],
            },
            { id: "sep-transfer", label: "", separator: true },
            {
                id: "outline",
                label: t("标题大纲"),
                checked: outlineOpen,
                onSelect: () => toggleOutlineOpen(),
            },
            { id: "sep-outline", label: "", separator: true },
            {
                id: "reading",
                label: t("阅读模式"),
                checked: viewMode === "reading",
                onSelect: () => setViewMode((m) => (m === "reading" ? "live" : "reading")),
            },
            {
                id: "source",
                label: t("源码模式"),
                checked: viewMode === "source",
                onSelect: () => setViewMode((m) => (m === "source" ? "live" : "source")),
            },
            { id: "sep-hist", label: "", separator: true },
            {
                id: "history",
                label: t("历史版本"),
                checked: historyOpen,
                onSelect: () => setHistoryOpen((open) => !open),
            },
        ];
    }, [
        viewMode,
        draft,
        title,
        outlineOpen,
        toggleOutlineOpen,
        historyOpen,
        transfer.busy,
        transfer.run,
    ]);
    const outlineMenuItems = useMemo((): ContextMenuItem[] => [
        {
            id: "close-outline",
            label: t("关闭标题大纲"),
            onSelect: () => setOutlineOpen(false),
        },
    ], []);
    const showReading = viewMode === "reading";
    const moreActive = viewMode !== "live";
    const titleMeta = useMemo(() => ({
        timeLabel: t("最近修改 {0}", formatStatusTime(lastSavedAt)),
    }), [lastSavedAt]);
    const saveLabel = saveStatus === "saving"
        ? t("保存中")
        : saveStatus === "dirty"
            ? t("有未保存更改")
            : saveStatus === "error"
                ? t("保存失败")
                : t("本地已保存");
    const chromeActions = (<>
      
      <button type="button" className={`mn-title-toggle ${outlineOpen ? "is-active" : ""}`} title={outlineOpen ? t("收起标题大纲") : t("标题大纲")} onClick={toggleOutlineOpen}>
        <Icon name="queue-list" size={14}/>
      </button>
      
      
      <button type="button" className={`mn-title-toggle ${moreActive ? "is-active" : ""}`} title={t("更多")} onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setEditorMenu(null);
            setMoreMenu({ x: rect.right - 8, y: rect.bottom + 4 });
        }}>
        <Icon name="ellipsis-horizontal" size={13}/>
      </button>
    </>);
    return (<div className="mn-note-shell">
      <div className="mn-note-shell__row">
        <section className="mn-note" style={{ background: chrome.background }}>
          {showReading ? (<div className="mn-md-tb mn-md-tb--reveal" role="toolbar">
              <div className="mn-md-tb__tools"/>
              <div className="mn-md-tb__trail">{chromeActions}</div>
            </div>) : toolbarOpen ? (<NoteEditorToolbar getEditor={() => editorRef.current} notePath={path} historyOpen={historyOpen} onOpenHistory={() => setHistoryOpen((open) => !open)} trailing={chromeActions} onHide={() => {
                setToolbarOpen(false);
                try {
                    localStorage.setItem(TOOLBAR_OPEN_KEY, "0");
                }
                catch {
                    /* ignore */
                }
            }}/>) : (<NoteEditorToolbarReveal trailing={chromeActions} onShow={() => {
                setToolbarOpen(true);
                try {
                    localStorage.setItem(TOOLBAR_OPEN_KEY, "1");
                }
                catch {
                    /* ignore */
                }
            }}/>)}
          {transfer.busy || transfer.message || transfer.error ? (
            <div className="mn-note-transfer" role={transfer.error ? "alert" : "status"}>
              {transfer.error || (transfer.busy ? t("处理中…") : transfer.message)}
            </div>
          ) : null}
          <div className="mn-note__body">
            {outlineOpen ? (<aside className={`mn-note__outline${outlinePanel.resizing ? " is-resizing" : ""}`} style={{ width: outlinePanel.width }} aria-label={t("标题大纲")} onContextMenu={(e) => {
                e.preventDefault();
                setEditorMenu(null);
                setMoreMenu(null);
                setOutlineMenu({ x: e.clientX, y: e.clientY });
            }}>
                <div className="mn-note__outline-head">
                  <span>{t("标题")}</span>
                  <div className="mn-note__outline-actions">
                    <span className="mn-note__outline-count">
                      {outlineHeadings.length}
                    </span>
                    <button type="button" className="mn-note__outline-close" title={t("关闭标题大纲")} aria-label={t("关闭标题大纲")} onClick={() => setOutlineOpen(false)}>
                      <Icon name="x-mark" size={12}/>
                    </button>
                  </div>
                </div>
                {outlineHeadings.length === 0 ? (<p className="mn-note__outline-empty">
                    {t("正文中还没有 Markdown 标题（# / ## …）")}</p>) : (<ul className="mn-note__outline-list">
                    {visibleOutlineHeadings.map((h) => {
                    const hasKids = outlineHasChildren.get(h.id) === true;
                    const collapsed = outlineCollapsed.has(h.id);
                    return (<li key={h.id} className={`mn-note__outline-item is-h${h.level}`} style={{ paddingLeft: 8 + (h.level - 1) * 12 }}>
                          {hasKids ? (<button type="button" className={`mn-note__outline-caret${collapsed ? "" : " is-open"}`} title={collapsed ? t("展开") : t("折叠")} aria-label={collapsed ? t("展开") : t("折叠")} onClick={() => toggleOutlineBranch(h.id)}>
                              <Icon name="chevron-right" size={12}/>
                            </button>) : (<span className="mn-note__outline-caret-spacer"/>)}
                          <button type="button" className="mn-note__outline-link" title={h.text} onClick={() => jumpToOutlineHeading(h)}>
                            {h.text || t("（空标题）")}
                          </button>
                        </li>);
                })}
                  </ul>)}
                <div className="mn-note__outline-resizer" role="separator" aria-orientation="vertical" aria-valuemin={OUTLINE_WIDTH_MIN} aria-valuemax={OUTLINE_WIDTH_MAX} aria-valuenow={outlinePanel.width} aria-label={t("调整标题大纲宽度")} onPointerDown={outlinePanel.onResizePointerDown}/>
              </aside>) : null}
            <div className="mn-note__content">
              {<NoteMarkdownEditor key={showReading ? "reading" : "editing"} readOnly={showReading} ref={editorRef} value={draft} onChange={setDraft} fontSize={bodyFontSize} sourceMode={viewMode === "source"} notePath={path} libraryRootPath={libraryRootPath} titleMeta={titleMeta} placeholder={t("输入 / 插入内容")} onContextMenu={onEditorContextMenu} onSlashAction={(action) => {
                if (action === "image") {
                    window.setTimeout(() => runInsertCommand("image"), 0);
                }
            }}/>}
            </div>
            {historyOpen ? (<NoteHistoryPanel notePath={path} libraryRootPath={libraryRootPath} fontSize={bodyFontSize} open={historyOpen} onClose={() => setHistoryOpen(false)} onRestore={(content) => {
                setDraft(content);
                void api.documents.save(path).catch(error => useAppStore.setState({ error: errorMessage(error) }));
            }}/>) : null}
          </div>
        </section>

        

        
      </div>

      <footer className="mn-note-statusbar" aria-label={t("文档信息")}>
        <div className="mn-note-statusbar__path" title={path}>
          <span>{t("位置")}</span>
          <strong>{formatDocumentPath(path)}</strong>
        </div>
        <div className="mn-note-statusbar__meta">
          <StatusClock />
          <span>{t("最近保存：{0}", formatStatusTime(lastSavedAt))}</span>
        </div>
        <div className="mn-note-statusbar__sync">
          <span className={`mn-note-statusbar__dot is-${saveStatus}`}/>
          <span>{saveLabel}</span>
          
          
        </div>
      </footer>

      {moreMenu ? (<ContextMenu x={moreMenu.x} y={moreMenu.y} items={moreItems} onClose={() => setMoreMenu(null)}/>) : null}

      {outlineMenu ? (<ContextMenu x={outlineMenu.x} y={outlineMenu.y} items={outlineMenuItems} onClose={() => setOutlineMenu(null)}/>) : null}

      {editorMenu ? (<ContextMenu x={editorMenu.x} y={editorMenu.y} items={editorMenuItems} onClose={() => setEditorMenu(null)}/>) : null}

      

    </div>);
}
