import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import {
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { resolveCodeLanguage } from "@/lib/codeHighlight";
import { searchKeymap } from "@codemirror/search";
import {
  Compartment,
  Annotation,
  EditorSelection,
  EditorState,
  StateField,
  type Extension,
  type Text,
} from "@codemirror/state";
import {
  Decoration,
  dropCursor,
  EditorView,
  keymap,
  type DecorationSet,
  WidgetType,
} from "@codemirror/view";
import {
  applyFormat as applyCodeMirrorFormat,
  detectFormatMarksAtSelection,
  insertCalloutSnippet,
  insertImageSnippet,
  type FormatCommand,
} from "@/lib/cm6/mdFormat";
import {
  slashCommandExtension,
  type SlashActionId,
} from "@/lib/cm6/slashCommands";
import { alignmentMarkdown } from "@/lib/cm6/alignment";
import { livePreviewExtension } from "@/lib/cm6/livePreview";
import { markdownEditingKeymap } from "@/lib/cm6/markdownEditingKeys";
import { mathPreviewExtension } from "@/lib/cm6/mathPreview";
import {
  meteorNoteEditorTheme,
  meteorNoteHighlight,
} from "@/lib/cm6/theme";
import {
  getActiveEditorToolbarTarget,
  emitEditorFormatChanged,
  setActiveEditorToolbarTarget,
  type EditorToolbarTarget,
} from "@/lib/editorToolbarTarget";
import "./NoteMarkdownEditor.css";
import "katex/dist/katex.min.css";

function clickShouldCreateTrailingLine(event: MouseEvent, view: EditorView) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) {
    return false;
  }
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (
    target.closest(
      "button, input, textarea, select, a, .cm-lp-table-wrap, .cm-lp-image-wrap",
    )
  ) {
    return false;
  }
  const scrollerRect = view.scrollDOM.getBoundingClientRect();
  if (
    event.clientX < scrollerRect.left ||
    event.clientX > scrollerRect.right ||
    event.clientY < scrollerRect.top ||
    event.clientY > scrollerRect.bottom
  ) {
    return false;
  }
  const endCoords = view.coordsAtPos(view.state.doc.length, 1);
  if (!endCoords) return false;
  return event.clientY > endCoords.bottom + 12;
}

/**
 * Heading lines use large vertical padding for visual spacing. Clicks on that
 * padding often resolve to the previous/next line in CodeMirror, so the short
 * heading text feels hard to hit. Snap the caret back onto the heading line.
 */
function snapClickToHeadingLine(event: MouseEvent, view: EditorView): boolean {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) {
    return false;
  }
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (
    target.closest(
      "button, input, textarea, select, a, .cm-lp-table-wrap, .cm-lp-image-wrap",
    )
  ) {
    return false;
  }

  const headingEl = target.closest(".cm-line.cm-lp-heading-line");
  let lineEl: HTMLElement | null =
    headingEl instanceof HTMLElement ? headingEl : null;

  // Clicks can also land on .cm-content inside the heading's padding box.
  if (!lineEl) {
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    if (hit instanceof Element) {
      const found = hit.closest(".cm-line.cm-lp-heading-line");
      if (found instanceof HTMLElement) lineEl = found;
    }
  }
  if (!lineEl || !view.contentDOM.contains(lineEl)) return false;

  const rect = lineEl.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  ) {
    return false;
  }

  // Map through the vertical center of the heading so padding clicks stay on it.
  const midY = rect.top + rect.height / 2;
  const x = Math.min(Math.max(event.clientX, rect.left + 4), rect.right - 4);
  const snapped = view.posAtCoords({ x, y: midY });
  if (snapped == null) return false;

  const raw = view.posAtCoords({ x: event.clientX, y: event.clientY });
  const want = view.state.doc.lineAt(snapped);
  if (raw != null && view.state.doc.lineAt(raw).number === want.number) {
    return false;
  }

  const anchor = Math.min(Math.max(snapped, want.from), want.to);
  event.preventDefault();
  view.dispatch({
    selection: { anchor },
    effects: EditorView.scrollIntoView(anchor, { y: "nearest" }),
  });
  view.focus();
  return true;
}

/** 笔记首行 `# 标题` 之后才是正文；修改时间是挂在标题后的装饰，不属于正文。 */
function noteBodyStart(doc: Text): number | null {
  if (doc.lines < 1) return null;
  const line = doc.line(1);
  if (!/^#\s+/.test(line.text) || /^##/.test(line.text)) return null;
  return Math.min(doc.length, line.to + (line.to < doc.length ? 1 : 0));
}

function selectNoteBody(view: EditorView, sourceMode: boolean) {
  const doc = view.state.doc;
  const from = sourceMode ? 0 : (noteBodyStart(doc) ?? 0);
  view.dispatch({
    selection: { anchor: from, head: doc.length },
  });
  view.focus();
}

function createTrailingLine(view: EditorView) {
  const end = view.state.doc.length;
  const text = view.state.doc.toString();
  const insert = text.endsWith("\n") ? "" : "\n";
  view.dispatch({
    changes: insert ? { from: end, insert } : undefined,
    selection: { anchor: end + insert.length },
    effects: EditorView.scrollIntoView(end + insert.length, {
      y: "center",
      yMargin: 80,
    }),
  });
  view.focus();
}

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("无法读取图片文件"));
    reader.readAsDataURL(file);
  });
}

async function insertDroppedImage(view: EditorView, file: File, notePath?: string | null) {
  if (file.size > 20 * 1024 * 1024) throw new Error("图片不能超过 20MB");
  const tauriPath = (file as File & { path?: string }).path;
  const src = tauriPath || (await fileToDataUrl(file));
  await insertImageSnippet(view, src, file.name || "图片", notePath);
}

function isBlankBodyNote(doc: string) {
  const trimmed = doc.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return false;
  if (trimmed.includes("\n")) return false;
  return /^#\s+.+$/.test(trimmed);
}

class BlankHintWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  eq(other: BlankHintWidget) {
    return this.text === other.text;
  }

  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-lp-blank-hint";
    const body = document.createElement("span");
    body.className = "cm-lp-blank-hint__body";
    body.textContent = this.text;
    el.append(body);
    return el;
  }

  ignoreEvent() {
    return true;
  }
}

type TitleMeta = {
  timeLabel: string;
};

class TitleMetaWidget extends WidgetType {
  constructor(readonly meta: TitleMeta) {
    super();
  }

  eq(other: TitleMetaWidget) {
    return (
      this.meta.timeLabel === other.meta.timeLabel
    );
  }

  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-lp-title-meta";
    el.setAttribute("contenteditable", "false");

    const time = document.createElement("span");
    time.className = "cm-lp-title-meta__time";
    time.textContent = this.meta.timeLabel;

    el.append(time);
    return el;
  }

  ignoreEvent() {
    return true;
  }
}

function blankHintDecorations(state: EditorState, placeholder: string): DecorationSet {
  if (!isBlankBodyNote(state.doc.toString())) {
    return Decoration.none;
  }
  if (state.doc.lines < 2) return Decoration.none;
  const line = state.doc.line(2);
  const widget = Decoration.widget({
    widget: new BlankHintWidget(placeholder),
    side: 1,
  });
  return Decoration.set([widget.range(line.from)], true);
}

function blankHintExtension(placeholder: string) {
  return StateField.define<DecorationSet>({
    create(state) {
      return blankHintDecorations(state, placeholder);
    },
    update(deco, tr) {
      if (tr.docChanged) {
        return blankHintDecorations(tr.state, placeholder);
      }
      return deco;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}

function titleMetaDecorations(state: EditorState, meta?: TitleMeta): DecorationSet {
  if (!meta || state.doc.lines < 1) return Decoration.none;
  const line = state.doc.line(1);
  if (!/^#\s+.+/.test(line.text)) return Decoration.none;
  return Decoration.set([
    Decoration.widget({
      widget: new TitleMetaWidget(meta),
      block: true,
      side: 1,
    }).range(line.to),
  ]);
}

function titleMetaExtension(meta?: TitleMeta) {
  return StateField.define<DecorationSet>({
    create(state) {
      return titleMetaDecorations(state, meta);
    },
    update(deco, tr) {
      if (tr.docChanged) {
        return titleMetaDecorations(tr.state, meta);
      }
      return deco;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}

export type NoteMarkdownEditorHandle = EditorToolbarTarget & {
  focus: () => void;
  getView: () => EditorView | null;
  getSelection: () => string;
  getCursorPos: () => number;
  insertAtCursor: (text: string) => void;
  replaceSelection: (text: string) => void;
  selectAll: () => void;
  gotoOffset: (offset: number) => void;
  runClipboard: (command: "copy" | "cut" | "paste") => Promise<void>;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  fontSize?: number;
  /** 源码模式：等宽字体 */
  sourceMode?: boolean;
  readOnly?: boolean;
  notePath?: string | null;
  libraryRootPath?: string | null;
  placeholder?: string;
  titleMeta?: TitleMeta;
  onContextMenu?: (info: {
    x: number;
    y: number;
    selection: string;
  }) => void;
  onSlashAction?: (action: SlashActionId) => void;
};

const externalDocumentUpdate = Annotation.define<boolean>();

export const NoteMarkdownEditor = forwardRef<NoteMarkdownEditorHandle, Props>(
  function NoteMarkdownEditor(
    {
      value,
      onChange,
      fontSize = 15,
      sourceMode = false,
      readOnly = false,
      notePath = null,
      libraryRootPath = null,
      placeholder = "首行 # 标题；输入 / 唤起命令；光标行显示 Markdown 源码",
      titleMeta,
      onContextMenu,
      onSlashAction,
    },
    ref,
  ) {
    const hostRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const themeComp = useRef(new Compartment());
    const modeComp = useRef(new Compartment());
    const blankHintComp = useRef(new Compartment());
    const titleMetaComp = useRef(new Compartment());
    const sourceModeRef = useRef(sourceMode);
    sourceModeRef.current = sourceMode;
    const valueRef = useRef(value);
    const onChangeRef = useRef(onChange);
    const onContextMenuRef = useRef(onContextMenu);
    const onSlashActionRef = useRef(onSlashAction);
    valueRef.current = value;
    onChangeRef.current = onChange;
    onContextMenuRef.current = onContextMenu;
    onSlashActionRef.current = onSlashAction;

    useImperativeHandle(ref, () => ({
      focus: () => viewRef.current?.focus(),
      applyFormat: (command: FormatCommand) => {
        const activeTarget = getActiveEditorToolbarTarget();
        if (activeTarget) {
          activeTarget.applyFormat(command);
          emitEditorFormatChanged(activeTarget.getFormatMarks());
          return;
        }
        const view = viewRef.current;
        if (!view) return;
        applyCodeMirrorFormat(view, command);
        emitEditorFormatChanged(detectFormatMarksAtSelection(view.state));
      },
      insertImage: async (src, notePath) => {
        const view = viewRef.current;
        if (!view) return;
        await insertImageSnippet(view, src, "图片", notePath);
      },
      insertCallout: (color?: string) => {
        const view = viewRef.current;
        if (!view) return;
        insertCalloutSnippet(view, color);
      },
      getFormatMarks: () => {
        const activeTarget = getActiveEditorToolbarTarget();
        if (activeTarget) return activeTarget.getFormatMarks();
        const view = viewRef.current;
        return view ? detectFormatMarksAtSelection(view.state) : {};
      },
      getView: () => viewRef.current,
      getSelection: () => {
        const view = viewRef.current;
        if (!view) return "";
        const { from, to } = view.state.selection.main;
        return view.state.doc.sliceString(from, to);
      },
      getCursorPos: () => viewRef.current?.state.selection.main.head ?? 0,
      insertAtCursor: (text: string) => {
        const view = viewRef.current;
        if (!view) return;
        const { from, to } = view.state.selection.main;
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
        });
        view.focus();
      },
      replaceSelection: (text: string) => {
        const view = viewRef.current;
        if (!view) return;
        const { from, to } = view.state.selection.main;
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
        });
        view.focus();
      },
      selectAll: () => {
        const view = viewRef.current;
        if (!view) return;
        selectNoteBody(view, sourceModeRef.current);
      },
      gotoOffset: (offset: number) => {
        const view = viewRef.current;
        if (!view) return;
        const pos = Math.max(0, Math.min(offset, view.state.doc.length));
        view.dispatch({
          selection: { anchor: pos },
          effects: EditorView.scrollIntoView(pos, { y: "start", yMargin: 48 }),
        });
        view.focus();
      },
      runClipboard: async (command) => {
        const view = viewRef.current;
        if (!view) return;
        view.focus();
        const { from, to } = view.state.selection.main;
        const selected = view.state.doc.sliceString(from, to);
        if (command === "copy" || command === "cut") {
          if (!selected) return;
          try {
            await navigator.clipboard.writeText(selected);
          } catch {
            document.execCommand(command);
            return;
          }
          if (command === "cut") {
            view.dispatch({
              changes: { from, to, insert: "" },
              selection: { anchor: from },
            });
          }
          return;
        }
        try {
          const text = await navigator.clipboard.readText();
          view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from + text.length },
          });
        } catch {
          document.execCommand("paste");
        }
      },
    }));

    useEffect(() => {
      if (!hostRef.current) return;

      const modeExtensions = (source: boolean): Extension[] =>
        source
          ? []
          : [livePreviewExtension(notePath, libraryRootPath), mathPreviewExtension()];

      const formatKeymap = keymap.of([
        {
          key: "Mod-a",
          preventDefault: true,
          run: (view) => {
            selectNoteBody(view, sourceModeRef.current);
            return true;
          },
        },
        {
          key: "Mod-b",
          preventDefault: true,
          run: (view) => {
            applyCodeMirrorFormat(view, { type: "bold" });
            return true;
          },
        },
        {
          key: "Mod-i",
          preventDefault: true,
          run: (view) => {
            applyCodeMirrorFormat(view, { type: "italic" });
            return true;
          },
        },
        {
          key: "Mod-u",
          preventDefault: true,
          run: (view) => {
            applyCodeMirrorFormat(view, { type: "underline" });
            return true;
          },
        },
        {
          key: "Mod-Shift-x",
          preventDefault: true,
          run: (view) => {
            applyCodeMirrorFormat(view, { type: "strike" });
            return true;
          },
        },
        {
          key: "Alt-Shift-5",
          preventDefault: true,
          run: (view) => {
            applyCodeMirrorFormat(view, { type: "strike" });
            return true;
          },
        },
      ]);

      const syncExt: Extension = EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const next = update.state.doc.toString();
          if (next !== valueRef.current) {
            onChangeRef.current(next);
          }
        }
        if (update.docChanged || update.selectionSet || update.focusChanged) {
          const activeTarget = getActiveEditorToolbarTarget();
          emitEditorFormatChanged(
            activeTarget
              ? activeTarget.getFormatMarks()
              : detectFormatMarksAtSelection(update.state),
          );
        }
      });

      const state = EditorState.create({
        doc: valueRef.current,
        extensions: [
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.contentAttributes.of(readOnly ? { role: "document", "aria-readonly": "true" } : {}),
          EditorState.transactionFilter.of(tr => readOnly && tr.docChanged && !tr.annotation(externalDocumentUpdate) ? [] : tr),
          history(),
          dropCursor(),
          closeBrackets(),
          markdown({
            base: markdownLanguage,
            extensions: [alignmentMarkdown],
            codeLanguages: resolveCodeLanguage,
            addKeymap: true,
          }),
          // 源码 / 实时预览都启用代码高亮
          themeComp.current.of([
            meteorNoteEditorTheme(fontSize, sourceModeRef.current),
            meteorNoteHighlight(),
          ]),
          modeComp.current.of(modeExtensions(sourceModeRef.current)),
          blankHintComp.current.of(blankHintExtension(placeholder)),
          titleMetaComp.current.of(
            sourceModeRef.current ? [] : titleMetaExtension(titleMeta),
          ),
          slashCommandExtension((action) => onSlashActionRef.current?.(action)),
          formatKeymap,
          keymap.of([
            ...markdownEditingKeymap,
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
          ]),
          EditorView.lineWrapping,
          EditorState.transactionFilter.of((tr) => {
            if (sourceModeRef.current || !tr.selection || tr.docChanged) return tr;
            if (!tr.isUserEvent("select")) return tr;
            const bodyFrom = noteBodyStart(tr.newDoc);
            if (bodyFrom == null) return tr;
            let changed = false;
            const ranges = tr.selection.ranges.map((range) => {
              if (range.anchor < bodyFrom || range.head >= bodyFrom) return range;
              changed = true;
              return EditorSelection.range(range.anchor, bodyFrom);
            });
            if (!changed) return tr;
            return {
              filter: false,
              selection: EditorSelection.create(ranges, tr.selection.mainIndex),
            };
          }),
          syncExt,
          EditorView.domEventHandlers({
            click(event, view) {
              if (!view.state.readOnly) return false;
              const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
              if (position == null) return false;
              let node = syntaxTree(view.state).resolveInner(position, -1);
              while (node.parent && !["Link", "Autolink"].includes(node.name)) node = node.parent;
              const url = node.getChild("URL");
              if (!url) return false;
              const href = view.state.doc.sliceString(url.from, url.to).replace(/^<|>$/g, "");
              if (!/^(https?:|mailto:)/i.test(href)) return false;
              event.preventDefault();
              void openExternal(href).catch(error => window.alert(`无法打开链接：${String(error)}`));
              return true;
            },
            mousedown(event, view) {
              if (view.state.readOnly) return false;
              const target = event.target;
              if (
                target instanceof Element &&
                !target.closest(".cm-lp-table-wrap")
              ) {
                setActiveEditorToolbarTarget(null);
                emitEditorFormatChanged(detectFormatMarksAtSelection(view.state));
              }
              if (snapClickToHeadingLine(event, view)) return true;
              if (!clickShouldCreateTrailingLine(event, view)) return false;
              event.preventDefault();
              createTrailingLine(view);
              return true;
            },
            contextmenu(event, view) {
              const cb = onContextMenuRef.current;
              if (!cb) return false;
              event.preventDefault();
              const pos = view.posAtCoords({
                x: event.clientX,
                y: event.clientY,
              });
              const before = view.state.selection.main;
              if (pos != null && (before.empty || pos < before.from || pos > before.to)) {
                view.dispatch({ selection: { anchor: pos } });
              }
              const { from, to } = view.state.selection.main;
              const selection = view.state.doc.sliceString(from, to);
              cb({
                x: event.clientX,
                y: event.clientY,
                selection,
              });
              return true;
            },
            dragover(event) {
              const files = Array.from(event.dataTransfer?.files ?? []);
              if (!files.some((file) => file.type.startsWith("image/"))) {
                return false;
              }
              event.preventDefault();
              return true;
            },
            drop(event, view) {
              if (view.state.readOnly) { event.preventDefault(); return true; }
              const file = Array.from(event.dataTransfer?.files ?? []).find((item) =>
                item.type.startsWith("image/"),
              );
              if (!file) return false;
              event.preventDefault();
              const pos = view.posAtCoords({
                x: event.clientX,
                y: event.clientY,
              });
              if (pos != null) {
                view.dispatch({ selection: { anchor: pos } });
              }
              void insertDroppedImage(view, file, notePath).catch((error) => window.alert(`插入图片失败：${error instanceof Error ? error.message : String(error)}`));
              return true;
            },
          }),
        ],
      });

      const view = new EditorView({
        state,
        parent: hostRef.current,
      });
      viewRef.current = view;

      return () => {
        view.destroy();
        viewRef.current = null;
      };
      // 仅挂载一次；外部 value / 主题通过后续 effect 同步
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const cur = view.state.doc.toString();
      if (cur === value) return;
      view.dispatch({
        changes: { from: 0, to: cur.length, insert: value },
        annotations: externalDocumentUpdate.of(true),
      });
    }, [value]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        effects: [
          themeComp.current.reconfigure([
            meteorNoteEditorTheme(fontSize, sourceMode),
            meteorNoteHighlight(),
          ]),
          modeComp.current.reconfigure(
            sourceMode
              ? []
              : [livePreviewExtension(notePath, libraryRootPath), mathPreviewExtension()],
          ),
          blankHintComp.current.reconfigure(
            blankHintExtension("输入 / 插入内容"),
          ),
          titleMetaComp.current.reconfigure(
            sourceMode ? [] : titleMetaExtension(titleMeta),
          ),
        ],
      });
    }, [fontSize, libraryRootPath, notePath, sourceMode, titleMeta]);

    return (
      <div
        ref={hostRef}
        className={`mn-cm-editor${sourceMode ? " is-source" : ""}${readOnly ? " is-reading" : ""}`}
      />
    );
  },
);
