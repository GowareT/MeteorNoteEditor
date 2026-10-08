import { t } from "@/lib/i18n";
import { syntaxTree } from "@codemirror/language";
import { EditorSelection, StateField, EditorState } from "@codemirror/state";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { applyFormat as applyInlineFormat, detectFormatMarksAtSelection } from "./mdFormat";
import { CODE_LANGUAGE_OPTIONS, resolveCodeLanguage } from "@/lib/codeHighlight";
import {
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
  keymap,
} from "@codemirror/view";
import { resolveEditorImage, parseImageSettings, imageAlt, applyImageCrop, openImageCropDialog, mediaIconButton, Crop, Maximize2, type ImageSettings } from "@/lib/editorImages";
import {
  getLibraryIconDef,
  LIBRARY_ICONS,
  normalizeLibraryIconId,
} from "@/lib/libraryIcons";
import {
  parseMarkdownTable,
  serializeMarkdownTable,
  type MarkdownTable,
} from "@/lib/mdTable";
import {
  clearActiveEditorToolbarTarget,
  emitEditorFormatChanged,
  setActiveEditorToolbarTarget,
  type EditorToolbarTarget,
} from "@/lib/editorToolbarTarget";

import { alignmentMarkdown, alignmentBlocks, lineAlignment } from "./alignment";

const hideMark = Decoration.replace({});

const MARK_NODES = new Set([
  "EmphasisMark",
  "CodeMark",
  "CodeInfo",
  "LinkMark",
  "QuoteMark",
  "HardBreak",
  "SubscriptMark",
  "SuperscriptMark",
  "URL",
]);

const HEADING_LINE_CLASS: Record<string, string> = {
  ATXHeading1: "cm-lp-heading-line cm-lp-h1-line",
  ATXHeading2: "cm-lp-heading-line cm-lp-h2-line",
  ATXHeading3: "cm-lp-heading-line cm-lp-h3-line",
  ATXHeading4: "cm-lp-heading-line cm-lp-h4-line",
  ATXHeading5: "cm-lp-heading-line cm-lp-h5-line",
  ATXHeading6: "cm-lp-heading-line cm-lp-h6-line",
  SetextHeading1: "cm-lp-heading-line cm-lp-h1-line",
  SetextHeading2: "cm-lp-heading-line cm-lp-h2-line",
};

const HR_LINE_RE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE_OPEN_RE = /^(\s*)(`{3,}|~{3,})[ \t]*([\w#+.-]*)\s*$/;
const TABLE_META_LINE_RE = /^<!--\s*mn-table\s+.+?\s*-->\s*$/;
const LOOSE_STRONG_RE = /\*\*(\s*[^*\n]*?\S\s+)\*\*/g;
const TABLE_NODE_NAMES = new Set([
  "Table",
  "TableHeader",
  "TableRow",
  "TableCell",
  "TableDelimiter",
]);

type DecoEntry = { from: number; to: number; deco: Decoration };
type FenceRange = { from: number; to: number; closed: boolean };
type TableCellStyle = {
  colSpan?: number;
  rowSpan?: number;
  hidden?: boolean;
  align?: "left" | "center" | "right";
  color?: string;
  bg?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
};
export type TableMeta = {
  width?: number;
  cols?: Array<number | undefined>;
  rows?: Array<number | undefined>;
  cells?: Record<string, TableCellStyle>;
};
type ParsedTableMeta = { meta: TableMeta; to: number };

function push(entries: DecoEntry[], from: number, to: number, deco: Decoration) {
  if (from > to) return;
  entries.push({ from, to, deco });
}

function cloneTable(table: MarkdownTable): MarkdownTable {
  return {
    header: [...table.header],
    aligns: [...table.aligns],
    rows: table.rows.map((row) => [...row]),
  };
}

function normalizeTableCellValue(value: string) {
  return value.replace(/\r\n/g, "\n");
}

function createTableModel(raw: string) {
  const table = parseMarkdownTable(raw);
  return table ? cloneTable(table) : null;
}

function cellKey(row: number, col: number) {
  return `${row}:${col}`;
}

function parseCellKey(key: string) {
  const match = /^(\d+):(\d+)$/.exec(key);
  if (!match) return null;
  return {
    row: Number(match[1]),
    col: Number(match[2]),
  };
}

function getCellMeta(meta: TableMeta, row: number, col: number) {
  const key = cellKey(row, col);
  meta.cells ??= {};
  meta.cells[key] ??= {};
  return meta.cells[key]!;
}

function readCellMeta(meta: TableMeta, row: number, col: number) {
  return meta.cells?.[cellKey(row, col)];
}

function isCoveredCell(meta: TableMeta, row: number, col: number) {
  return Boolean(readCellMeta(meta, row, col)?.hidden);
}

function isPlainVisibleCell(meta: TableMeta, row: number, col: number) {
  const style = readCellMeta(meta, row, col);
  return !style?.hidden && !style?.colSpan && !style?.rowSpan;
}

function clearSpanFields(style: TableCellStyle) {
  delete style.colSpan;
  delete style.rowSpan;
  delete style.hidden;
}

function hasTableMeta(meta: TableMeta) {
  const cleaned = sanitizeTableMeta(meta);
  return Boolean(
    cleaned.width ||
    cleaned.cols?.length ||
      cleaned.rows?.length ||
      Object.values(cleaned.cells ?? {}).some(
        (cell) =>
          cell.colSpan ||
          cell.rowSpan ||
          cell.hidden ||
          cell.align ||
          cell.color ||
          cell.bg ||
          cell.bold ||
          cell.italic ||
          cell.underline ||
          cell.strike,
      ),
  );
}

function hasCellStyle(style: TableCellStyle) {
  return Boolean(
    style.colSpan ||
      style.rowSpan ||
      style.hidden ||
      style.align ||
      style.color ||
      style.bg ||
      style.bold ||
      style.italic ||
      style.underline ||
      style.strike,
  );
}

function compactNumberArray(values?: Array<number | undefined>) {
  if (!values?.length) return undefined;
  const next = values.map((value) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      return undefined;
    }
    return Math.round(value);
  });
  while (next.length && next[next.length - 1] == null) next.pop();
  return next.length ? (next as number[]) : undefined;
}

function sanitizeTableMeta(meta: TableMeta): TableMeta {
  const next: TableMeta = {};
  if (
    typeof meta.width === "number" &&
    Number.isFinite(meta.width) &&
    meta.width > 0
  ) {
    next.width = Math.round(meta.width);
  }
  const cols = compactNumberArray(meta.cols);
  const rows = compactNumberArray(meta.rows);
  if (cols) next.cols = cols;
  if (rows) next.rows = rows;
  for (const [key, style] of Object.entries(meta.cells ?? {})) {
    if (!hasCellStyle(style)) continue;
    next.cells ??= {};
    next.cells[key] = { ...style };
  }
  return next;
}


function serializeTableMeta(meta: TableMeta) {
  return `<!-- mn-table ${encodeURIComponent(JSON.stringify(meta))} -->`;
}

function serializeTableBlock(table: MarkdownTable, meta: TableMeta) {
  const markdown = serializeMarkdownTable(table);
  const cleaned = sanitizeTableMeta(meta);
  return hasTableMeta(cleaned) ? `${markdown}\n${serializeTableMeta(cleaned)}` : markdown;
}

function tableHasAnyContent(table: MarkdownTable) {
  return (
    table.header.some((cell) => cell.trim().length > 0) ||
    table.rows.some((row) => row.some((cell) => cell.trim().length > 0))
  );
}

function normalizeTableMetaForSave(table: MarkdownTable, meta: TableMeta) {
  if (!tableHasAnyContent(table)) {
    return {};
  }
  return sanitizeTableMeta(meta);
}

function shiftTableMetaRows(meta: TableMeta, fromRow: number, delta: number) {
  const rows = meta.rows as Array<number | undefined> | undefined;
  if (rows?.length !== undefined) {
    rows.splice(fromRow, 0, ...Array.from({ length: delta }, () => undefined));
  }
  if (!meta.cells) return;
  const next: Record<string, TableCellStyle> = {};
  for (const [key, style] of Object.entries(meta.cells)) {
    const parsed = parseCellKey(key);
    if (!parsed) {
      next[key] = style;
      continue;
    }
    const row = parsed.row >= fromRow ? parsed.row + delta : parsed.row;
    next[cellKey(row, parsed.col)] = style;
  }
  meta.cells = next;
}

function shiftTableMetaCols(meta: TableMeta, fromCol: number, delta: number) {
  const cols = meta.cols as Array<number | undefined> | undefined;
  if (cols?.length !== undefined) {
    cols.splice(fromCol, 0, ...Array.from({ length: delta }, () => undefined));
  }
  if (!meta.cells) return;
  const next: Record<string, TableCellStyle> = {};
  for (const [key, style] of Object.entries(meta.cells)) {
    const parsed = parseCellKey(key);
    if (!parsed) {
      next[key] = style;
      continue;
    }
    const col = parsed.col >= fromCol ? parsed.col + delta : parsed.col;
    next[cellKey(parsed.row, col)] = style;
  }
  meta.cells = next;
}

function deleteTableMetaRow(meta: TableMeta, row: number) {
  meta.rows?.splice(row, 1);
  if (!meta.cells) return;
  const next: Record<string, TableCellStyle> = {};
  for (const [key, style] of Object.entries(meta.cells)) {
    const parsed = parseCellKey(key);
    if (!parsed || parsed.row === row) continue;
    const nextRow = parsed.row > row ? parsed.row - 1 : parsed.row;
    const clean = { ...style };
    clearSpanFields(clean);
    next[cellKey(nextRow, parsed.col)] = clean;
  }
  meta.cells = next;
}

function deleteTableMetaCol(meta: TableMeta, col: number) {
  meta.cols?.splice(col, 1);
  if (!meta.cells) return;
  const next: Record<string, TableCellStyle> = {};
  for (const [key, style] of Object.entries(meta.cells)) {
    const parsed = parseCellKey(key);
    if (!parsed || parsed.col === col) continue;
    const nextCol = parsed.col > col ? parsed.col - 1 : parsed.col;
    const clean = { ...style };
    clearSpanFields(clean);
    next[cellKey(parsed.row, nextCol)] = clean;
  }
  meta.cells = next;
}

function readTableMetaAfter(state: EditorState, tableTo: number): ParsedTableMeta {
  if (tableTo >= state.doc.length) return { meta: {}, to: tableTo };
  const next = state.doc.lineAt(tableTo + 1);
  if (next.from !== tableTo + 1) return { meta: {}, to: tableTo };
  const match = /^<!--\s*mn-table\s+(.+?)\s*-->\s*$/.exec(next.text.trim());
  if (!match) return { meta: {}, to: tableTo };
  try {
    return {
      meta: JSON.parse(decodeURIComponent(match[1] ?? "")) as TableMeta,
      to: next.to,
    };
  } catch {
    return { meta: {}, to: tableTo };
  }
}

function isAtxHeadingLine(text: string) {
  return /^#{1,6}\s+/.test(text);
}

function sanitizeCalloutColor(value?: string) {
  const color = value?.trim();
  if (!color) return "#fff6d6";
  return /^#[0-9a-f]{3,8}$/i.test(color) ? color : "#fff6d6";
}

function sanitizeCalloutIcon(value?: string) {
  return normalizeLibraryIconId(value?.trim().toLowerCase(), "lightbulb");
}

function calloutIconSvg(iconId: string) {
  return getLibraryIconDef(sanitizeCalloutIcon(iconId), "lightbulb").svg;
}

function readCalloutConfig(rawParts?: string) {
  const parts = (rawParts ?? "")
    .split(":")
    .map((item) => item.trim())
    .filter(Boolean);
  const color = parts.find((item) => /^#[0-9a-f]{3,8}$/i.test(item));
  const icon = parts.find((item) => !/^#[0-9a-f]{3,8}$/i.test(item));
  return {
    color: sanitizeCalloutColor(color),
    icon: sanitizeCalloutIcon(icon),
  };
}

function updateCalloutMarkerIcon(marker: string, iconId: string) {
  const config = readCalloutConfig(/\[!note((?::[^\]]+)*)\]/i.exec(marker)?.[1]);
  return marker.replace(
    /\[!note(?::[^\]]+)*\]/i,
    `[!note:${config.color}:${sanitizeCalloutIcon(iconId)}]`,
  );
}

function parseCalloutHead(text: string, lineFrom: number) {
  const match = /^(\s*>\s?\[!note((?::[^\]]+)*)\])(\s*)(.*)$/i.exec(text);
  if (!match) return null;
  const marker = match[1] ?? "";
  const config = readCalloutConfig(match[2]);
  const spacer = match[3] ?? "";
  const body = match[4] ?? "";
  const bodyFrom = lineFrom + marker.length + spacer.length;
  return {
    color: config.color,
    icon: config.icon,
    markerFrom: lineFrom,
    markerTo: lineFrom + marker.length,
    bodyFrom,
    hideTo: body.trim() === t("提示") ? lineFrom + text.length : bodyFrom,
  };
}

function isEscaped(raw: string, index: number) {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && raw[i] === "\\"; i -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function pushInlinePairMarks(
  entries: DecoEntry[],
  lineFrom: number,
  raw: string,
  delimiter: string,
  className: string,
  claimedRanges: FenceRange[],
) {
  let index = 0;
  while (index < raw.length) {
    const open = raw.indexOf(delimiter, index);
    if (open < 0) return;
    if (isEscaped(raw, open)) {
      index = open + delimiter.length;
      continue;
    }
    if (
      delimiter.length === 1 &&
      (raw[open - 1] === delimiter || raw[open + 1] === delimiter)
    ) {
      index = open + 1;
      continue;
    }
    if (
      (delimiter === "**" || delimiter === "__") &&
      raw[open + delimiter.length] === delimiter[0]
    ) {
      index = open + 1;
      continue;
    }
    let close = raw.indexOf(delimiter, open + delimiter.length);
    while (close >= 0 && (isEscaped(raw, close) || (delimiter.length === 1 && (raw[close - 1] === delimiter || raw[close + 1] === delimiter)))) {
      close = raw.indexOf(delimiter, close + delimiter.length);
    }
    if (close < 0) return;
    const innerFrom = open + delimiter.length;
    const innerTo = close;
    if (raw.slice(innerFrom, innerTo).trim()) {
      const from = lineFrom + open;
      const to = lineFrom + close + delimiter.length;
      // Only an identical parsed range owns this delimiter pair. A containing
      // bold/italic/strike node must not suppress a nested fallback format.
      if (claimedRanges.some((range) => range.from === from && range.to === to)) {
        index = close + delimiter.length;
        continue;
      }
      push(entries, from, from + delimiter.length, hideMark);
      push(entries, to - delimiter.length, to, hideMark);
      push(
        entries,
        lineFrom + innerFrom,
        lineFrom + innerTo,
        Decoration.mark({ class: className }),
      );
      claimedRanges.push({ from, to, closed: true });
      if (delimiter === "***" || delimiter === "___") {
        claimedRanges.push({ from: from + 1, to: to - 1, closed: true });
      }
    }
    index = close + delimiter.length;
  }
}

type InlineHtmlTagRange = {
  openFrom: number;
  openTo: number;
  closeFrom: number;
  closeTo: number;
  opening: string;
};

function collectInlineHtmlTagRanges(raw: string, tag: string) {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<\\/?${escapedTag}\\b[^>]*>`, "gi");
  const stack: Array<{ from: number; to: number; opening: string }> = [];
  const ranges: InlineHtmlTagRange[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    if (!/^<\//.test(match[0])) {
      if (!/\/>$/.test(match[0])) {
        stack.push({
          from: match.index,
          to: match.index + match[0].length,
          opening: match[0],
        });
      }
      continue;
    }
    const open = stack.pop();
    if (!open) continue;
    ranges.push({
      openFrom: open.from,
      openTo: open.to,
      closeFrom: match.index,
      closeTo: match.index + match[0].length,
      opening: open.opening,
    });
  }
  return ranges;
}

function parsedInlineFormatRanges(state: EditorState): FenceRange[] {
  const ranges: FenceRange[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (
        node.name === "StrongEmphasis" ||
        node.name === "Emphasis"
      ) {
        ranges.push({ from: node.from, to: node.to, closed: true });
      }
    },
  });
  return ranges;
}

class TableWidget extends WidgetType {
  private cellViews = new Map<string, EditorView>();
  private pendingRaw: string | null = null;
  private rebind: ((next: TableWidget) => void) | null = null;
  private timers = new Set<number>();
  private activeTarget: EditorToolbarTarget | null = null;
  private outsideActionsCleanup: (() => void) | null = null;

  constructor(
    readonly raw: string,
    readonly from: number,
    readonly to: number,
    readonly meta: TableMeta,
  ) {
    super();
  }

  eq(other: TableWidget) {
    return (
      this.raw === other.raw &&
      this.from === other.from &&
      this.to === other.to &&
      JSON.stringify(this.meta) === JSON.stringify(other.meta)
    );
  }

  updateDOM(dom: HTMLElement, view: EditorView) {
    const previous = (dom as HTMLElement & { mnTableWidget?: TableWidget }).mnTableWidget;
    if (!previous || previous.from !== this.from ||
        previous.pendingRaw !== view.state.doc.sliceString(this.from, this.to)) return false;
    this.cellViews = previous.cellViews;
    this.timers = previous.timers;
    this.activeTarget = previous.activeTarget;
    this.outsideActionsCleanup = previous.outsideActionsCleanup;
    this.rebind = previous.rebind;
    this.rebind?.(this);
    (dom as HTMLElement & { mnTableWidget?: TableWidget }).mnTableWidget = this;
    return true;
  }

  toDOM(view: EditorView) {
    let widget: TableWidget = this;
    this.rebind = (next) => { widget = next; };
    const wrap = document.createElement("div");
    wrap.className = "cm-lp-table-wrap cm-lp-table-wrap--editable";
    wrap.dataset.tableFrom = String(widget.from);
    (wrap as HTMLElement & { mnTableWidget?: TableWidget }).mnTableWidget = this;
    wrap.setAttribute("contenteditable", "false");

    const model = createTableModel(widget.raw);
    if (!model) {
      wrap.classList.add("is-invalid");
      wrap.textContent = widget.raw;
      return wrap;
    }

    const grid = document.createElement("table");
    grid.className = "cm-lp-table cm-lp-table--editable";

    const meta = structuredClone(widget.meta ?? {}) as TableMeta;
    let selected: { row: number; col: number } | null = null;
    const writeCellValue = (row: number, col: number, value: string) => {
      if (row === 0) model.header[col] = normalizeTableCellValue(value);
      else model.rows[row - 1]![col] = normalizeTableCellValue(value);
    };
    const restoreFocusedCell = (focus: { row: number; col: number; start: number; end: number } | null) => {
      if (!focus) return;
      window.queueMicrotask(() => {
        const nextWrap = view.dom.querySelector<HTMLElement>(`[data-table-from="${widget.from}"]`);
        const owner = (nextWrap as (HTMLElement & { mnTableWidget?: TableWidget }) | null)?.mnTableWidget;
        const editor = owner?.cellViews.get(cellKey(focus.row, focus.col));
        if (!editor) return;
        editor.dispatch({ selection: EditorSelection.range(
          Math.min(focus.start, editor.state.doc.length),
          Math.min(focus.end, editor.state.doc.length),
        ), scrollIntoView: false });
        editor.contentDOM.focus({ preventScroll: true });
      });
    };
    const addCellButton = (kind: "row" | "col", index: number) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `cm-lp-table-add cm-lp-table-add--${kind}`;
      const label = kind === "row" ? t("在下方新增一行") : t("在右侧新增一列");
      button.setAttribute("aria-label", label);
      button.title = label;
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (kind === "row") {
          model.rows.splice(index + 1, 0, new Array(model.header.length).fill(""));
          shiftTableMetaRows(meta, index + 2, 1);
        } else {
          model.header.splice(index + 1, 0, "");
          model.aligns.splice(index + 1, 0, "left");
          for (const row of model.rows) {
            row.splice(index + 1, 0, "");
          }
          shiftTableMetaCols(meta, index + 1, 1);
        }
        clearPendingCommits();
        commit(true, false);
      });
      return button;
    };

    const commit = (restoreFocus = true, reuseDOM = true) => {
      if ([...widget.cellViews.values()].some((editor) => editor.composing)) return;
      const nextRaw = serializeTableBlock(model, normalizeTableMetaForSave(model, meta));
      if (nextRaw === view.state.doc.sliceString(widget.from, widget.to)) return;
      const focused = selected ? widget.cellViews.get(cellKey(selected.row, selected.col)) : null;
      const focusState = restoreFocus && focused && selected
        ? { ...selected, start: focused.state.selection.main.from, end: focused.state.selection.main.to }
        : null;
      widget.pendingRaw = reuseDOM ? nextRaw : null;
      view.dispatch({
        changes: { from: widget.from, to: widget.to, insert: nextRaw },
        effects: view.scrollSnapshot(),
        scrollIntoView: false,
      });
      restoreFocusedCell(focusState);
    };

    const scheduleCommit = () => {
      const timerId = window.setTimeout(() => {
        widget.timers.delete(timerId);
        commit();
      }, 120);
      widget.timers.add(timerId);
    };

    const clearPendingCommits = () => {
      for (const timerId of widget.timers) {
        window.clearTimeout(timerId);
      }
      widget.timers.clear();
    };

    const exitTableFromCell = () => {
      clearPendingCommits();
      const nextRaw = serializeTableBlock(model, normalizeTableMetaForSave(model, meta));
      const after = widget.from + nextRaw.length + 1;
      view.dispatch({
        changes: { from: widget.from, to: widget.to, insert: `${nextRaw}\n` },
        selection: EditorSelection.cursor(after),
        scrollIntoView: true,
      });
      view.focus();
    };

    const clearVisualSelection = () => {
      grid.querySelectorAll(".is-selected").forEach((el) => {
        el.classList.remove("is-selected");
      });
    };

    const closeCellActions = () => {
      grid.querySelectorAll(".cm-lp-table-actions").forEach((el) => el.remove());
    };

    widget.outsideActionsCleanup?.();
    const closeActionsOnOutsideMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        grid.contains(target) &&
        target.closest(".cm-lp-table-actions, .cm-lp-table-cell-trigger")
      ) {
        return;
      }
      closeCellActions();
      if (
        target instanceof Element &&
        target.closest(".mn-md-tb, .mn-md-tb__pop--portal")
      ) {
        return;
      }
      if (!(target instanceof Node) || !grid.contains(target)) {
        clearVisualSelection();
        selected = null;
        if (widget.activeTarget) {
          clearActiveEditorToolbarTarget(widget.activeTarget);
          widget.activeTarget = null;
          emitEditorFormatChanged({});
        }
      }
    };
    window.addEventListener("mousedown", closeActionsOnOutsideMouseDown, true);
    widget.outsideActionsCleanup = () => {
      window.removeEventListener(
        "mousedown",
        closeActionsOnOutsideMouseDown,
        true,
      );
    };

    const mergeCellRight = (row: number, col: number) => {
      if (isCoveredCell(meta, row, col)) return;
      const style = getCellMeta(meta, row, col);
      const width = style.colSpan ?? 1;
      const height = style.rowSpan ?? 1;
      const targetCol = col + width;
      if (targetCol >= model.header.length) return;
      for (let r = row; r < row + height; r += 1) {
        if (!isPlainVisibleCell(meta, r, targetCol)) return;
      }
      style.colSpan = width + 1;
      for (let r = row; r < row + height; r += 1) {
        getCellMeta(meta, r, targetCol).hidden = true;
      }
      clearPendingCommits();
      closeCellActions();
      commit(true, false);
    };

    const mergeCellDown = (row: number, col: number) => {
      if (isCoveredCell(meta, row, col)) return;
      const style = getCellMeta(meta, row, col);
      const width = style.colSpan ?? 1;
      const height = style.rowSpan ?? 1;
      const targetRow = row + height;
      if (targetRow >= model.rows.length + 1) return;
      for (let c = col; c < col + width; c += 1) {
        if (!isPlainVisibleCell(meta, targetRow, c)) return;
      }
      style.rowSpan = height + 1;
      for (let c = col; c < col + width; c += 1) {
        getCellMeta(meta, targetRow, c).hidden = true;
      }
      clearPendingCommits();
      closeCellActions();
      commit(true, false);
    };

    const splitCell = (row: number, col: number) => {
      const style = readCellMeta(meta, row, col);
      if (!style?.colSpan && !style?.rowSpan) return;
      const width = style.colSpan ?? 1;
      const height = style.rowSpan ?? 1;
      delete style.colSpan;
      delete style.rowSpan;
      for (let r = row; r < row + height; r += 1) {
        for (let c = col; c < col + width; c += 1) {
          if (r === row && c === col) continue;
          const covered = readCellMeta(meta, r, c);
          if (covered?.hidden) delete covered.hidden;
        }
      }
      clearPendingCommits();
      closeCellActions();
      commit(true, false);
    };

    const deleteRow = (row: number) => {
      if (row <= 0 || model.rows.length <= 1) return;
      model.rows.splice(row - 1, 1);
      deleteTableMetaRow(meta, row);
      clearPendingCommits();
      closeCellActions();
      commit(true, false);
    };

    const deleteCol = (col: number) => {
      if (model.header.length <= 1) return;
      model.header.splice(col, 1);
      model.aligns.splice(col, 1);
      for (const row of model.rows) row.splice(col, 1);
      deleteTableMetaCol(meta, col);
      clearPendingCommits();
      closeCellActions();
      commit(true, false);
    };

    const appendCellActions = (
      cellEl: HTMLTableCellElement,
      row: number,
      col: number,
    ) => {
      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "cm-lp-table-cell-trigger";
      trigger.textContent = "⋯";
      trigger.setAttribute("aria-label", t("单元格操作"));
      trigger.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        selectCell(row, col);
        const existing = cellEl.querySelector(".cm-lp-table-actions");
        closeCellActions();
        if (existing) return;

        const panel = document.createElement("div");
        panel.className = "cm-lp-table-actions";
        const addAction = (
          label: string,
          run: () => void,
          disabled = false,
        ) => {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = label;
          button.disabled = disabled;
          button.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
          });
          button.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!button.disabled) run();
          });
          panel.appendChild(button);
        };

        const style = readCellMeta(meta, row, col);
        const width = style?.colSpan ?? 1;
        const height = style?.rowSpan ?? 1;
        addAction(t("向右合并"), () => mergeCellRight(row, col), col + width >= model.header.length);
        addAction(t("向下合并"), () => mergeCellDown(row, col), row + height >= model.rows.length + 1);
        addAction(t("取消合并"), () => splitCell(row, col), !style?.colSpan && !style?.rowSpan);
        addAction(t("删除行"), () => deleteRow(row), row === 0 || model.rows.length <= 1);
        addAction(t("删除列"), () => deleteCol(col), model.header.length <= 1);
        cellEl.appendChild(panel);
      });
      cellEl.appendChild(trigger);
    };

    const selectCell = (row: number, col: number) => {
      selected = { row, col };
      clearVisualSelection();
      grid
        .querySelector(`[data-cell="${cellKey(row, col)}"]`)
        ?.classList.add("is-selected");
      widget.activeTarget = {
        applyFormat: (command) => {
          if (!selected) return;
          const cell = getCellMeta(meta, selected.row, selected.col);
          const editor = widget.cellViews.get(cellKey(selected.row, selected.col));
          if (!editor) return;
          if (command.type === "align") {
            cell.align = command.align;
            editor.dom.style.textAlign = command.align;
            grid.querySelector<HTMLElement>(`[data-cell="${cellKey(selected.row, selected.col)}"]`)!.style.textAlign = command.align;
            editor.requestMeasure();
          } else if (["bold", "italic", "underline", "strike", "highlight", "color", "clear", "paint"].includes(command.type)) {
            if (editor.state.selection.main.empty) {
              editor.dispatch({ selection: EditorSelection.range(0, editor.state.doc.length) });
            }
            applyInlineFormat(editor, command);
          } else return;
          clearPendingCommits();
          commit();
          emitEditorFormatChanged(widget.activeTarget?.getFormatMarks() ?? {});
        },
        insertImage: () => {},
        insertCallout: () => {},
        getFormatMarks: () => {
          if (!selected) return {};
          const cell = readCellMeta(meta, selected.row, selected.col);
          const editor = widget.cellViews.get(cellKey(selected.row, selected.col));
          return {
            ...(editor ? detectFormatMarksAtSelection(editor.state) : {}),
            align: cell?.align ?? model.aligns[selected.col] ?? "left",
          };
        },
      };
      setActiveEditorToolbarTarget(widget.activeTarget);
      emitEditorFormatChanged(widget.activeTarget.getFormatMarks());
    };

    const renderBody = () => {
      for (const editor of widget.cellViews.values()) editor.destroy();
      widget.cellViews.clear();
      grid.replaceChildren();
      grid.style.width = meta.width ? `${meta.width}px` : "100%";
      const makeRow = (values: string[], row: number, parent: HTMLElement) => {
        const tr = document.createElement("tr");
        values.forEach((value, col) => {
          const style = meta.cells?.[cellKey(row, col)];
          if (style?.hidden) return;
          const cell = document.createElement(row === 0 ? "th" : "td");
          cell.dataset.cell = cellKey(row, col);
          cell.colSpan = style?.colSpan ?? 1;
          cell.rowSpan = style?.rowSpan ?? 1;
          cell.style.width = meta.cols?.[col] ? `${meta.cols[col]}px` : "";
          cell.style.height = meta.rows?.[row] ? `${meta.rows[row]}px` : "";
          const align = style?.align ?? model.aligns[col] ?? "left";
          cell.style.textAlign = align;
          // Migrate legacy whole-cell styles into the same Markdown used by the body.
          let content = value;
          if (style) {
            if (style.bold) content = `**${content}**`;
            if (style.italic) content = `*${content}*`;
            if (style.underline) content = `<u>${content}</u>`;
            else if (style.strike) content = `~~${content}~~`;
            if (style.bg) content = `<mark style="background-color:${style.bg}">${content}</mark>`;
            if (style.color) content = `<span style="color:${style.color}">${content}</span>`;
            for (const key of ["bold", "italic", "underline", "strike", "bg", "color"] as const) delete style[key];
          }
          writeCellValue(row, col, content);
          const host = document.createElement("div");
          host.className = "cm-lp-cell-editor";
          cell.appendChild(host);
          tr.appendChild(cell);
          const editor = new EditorView({
            parent: host,
            state: EditorState.create({
              doc: content,
              extensions: [
                EditorState.readOnly.of(view.state.readOnly),
                EditorView.editable.of(!view.state.readOnly),
                EditorView.contentAttributes.of(view.state.readOnly ? { role: "document", "aria-readonly": "true" } : {}),
                EditorState.transactionFilter.of(tr => view.state.readOnly && tr.docChanged ? [] : tr),
                markdown({ base: markdownLanguage, extensions: [alignmentMarkdown], addKeymap: false }),
                history(),
                livePreviewExtension(null, null, true),
                EditorView.lineWrapping,
                keymap.of([
                  ...(["bold", "italic", "underline", "strike"] as const).map((type, index) => ({
                    key: ["Mod-b", "Mod-i", "Mod-u", "Mod-Shift-x"][index],
                    run: (inner: EditorView) => { applyInlineFormat(inner, { type }); return true; },
                  })),
                  { key: "Enter", run: (inner) => { if (inner.composing) return false; exitTableFromCell(); return true; } },
                  { key: "Shift-Enter", run: (inner) => { if (inner.composing) return false; inner.dispatch(inner.state.replaceSelection("\n")); return true; } },
                  ...historyKeymap, ...defaultKeymap,
                ]),
                EditorView.updateListener.of((update) => {
                  if (update.docChanged) {
                    writeCellValue(row, col, update.state.doc.toString());
                    clearPendingCommits();
                    scheduleCommit();
                  }
                  if (update.selectionSet || update.focusChanged) {
                    if (update.view.hasFocus) selectCell(row, col);
                  }
                }),
                EditorView.domEventHandlers({
                  focus: () => { selectCell(row, col); return false; },
                  compositionend: () => { clearPendingCommits(); scheduleCommit(); return false; },
                }),
              ],
            }),
          });
          editor.dom.style.textAlign = align;
          widget.cellViews.set(cellKey(row, col), editor);
          cell.addEventListener("mousedown", () => selectCell(row, col));
          cell.appendChild(resizeHandle("col", col, row));
          cell.appendChild(resizeHandle("row", col, row));
          if (row === 0) cell.appendChild(addCellButton("col", col));
          if (col === values.length - 1) cell.appendChild(addCellButton("row", row - 1));
          appendCellActions(cell, row, col);
        });
        parent.appendChild(tr);
      };
      const thead = document.createElement("thead");
      const tbody = document.createElement("tbody");
      makeRow(model.header, 0, thead);
      model.rows.forEach((row, index) => makeRow(row, index + 1, tbody));
      grid.append(thead, tbody);
    };

    const resizeHandle = (kind: "col" | "row", col: number, row: number) => {
      const handle = document.createElement("span");
      handle.className = `cm-lp-table-resize cm-lp-table-resize--${kind}`;
      handle.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const startX = event.clientX;
        const startY = event.clientY;
        const target = (event.currentTarget as HTMLElement).parentElement;
        const startWidth = target?.getBoundingClientRect().width ?? 120;
        const startHeight = target?.getBoundingClientRect().height ?? 42;
        const gridRect = grid.getBoundingClientRect();
        const targetRect = target?.getBoundingClientRect();
        const startTableWidth = gridRect.width;
        const wrapStyle = window.getComputedStyle(wrap);
        const wrapHorizontalPadding =
          Number.parseFloat(wrapStyle.paddingLeft) +
          Number.parseFloat(wrapStyle.paddingRight);
        const maxTableWidth = Math.max(
          120,
          Math.floor(wrap.clientWidth - wrapHorizontalPadding),
        );
        const minTableWidth = Math.min(
          maxTableWidth,
          Math.max(120, model.header.length * 40),
        );
        const minColumnWidth = 40;
        const isTableEdge =
          kind === "col" &&
          Boolean(targetRect) &&
          Math.abs((targetRect?.right ?? 0) - gridRect.right) <= 2;
        const measuredColumnWidths = model.header.map((_, index) => {
          const headerCell = grid.querySelector<HTMLElement>(
            `[data-cell="${cellKey(0, index)}"]`,
          );
          const span = Number(headerCell?.getAttribute("colspan") ?? 1);
          return headerCell
            ? headerCell.getBoundingClientRect().width / Math.max(1, span)
            : (meta.cols?.[index] ?? startTableWidth / model.header.length);
        });
        const measuredColumnsTotal = measuredColumnWidths.reduce(
          (sum, width) => sum + width,
          0,
        );
        const startColumnWidths = measuredColumnWidths.map(
          (width) => (width / measuredColumnsTotal) * startTableWidth,
        );
        const nextCol = !isTableEdge
          ? grid.querySelector<HTMLElement>(`[data-cell="${cellKey(row, col + 1)}"]`)
          : null;
        const startNextWidth = nextCol?.getBoundingClientRect().width ?? 0;
        const editorScrollLeft = view.scrollDOM.scrollLeft;
        const editorScrollTop = view.scrollDOM.scrollTop;
        const pageScrollX = window.scrollX;
        const pageScrollY = window.scrollY;
        clearPendingCommits();
        const previousCursor = document.documentElement.style.cursor;
        const previousUserSelect = document.documentElement.style.userSelect;
        document.documentElement.style.cursor =
          kind === "col" ? "col-resize" : "row-resize";
        document.documentElement.style.userSelect = "none";
        const onMove = (moveEvent: MouseEvent) => {
          moveEvent.preventDefault();
          moveEvent.stopPropagation();
          if (kind === "col") {
            const delta = moveEvent.clientX - startX;
            if (isTableEdge) {
              const nextTableWidth = Math.round(
                Math.min(maxTableWidth, Math.max(minTableWidth, startTableWidth + delta)),
              );
              const scale = nextTableWidth / startTableWidth;
              meta.width = nextTableWidth;
              meta.cols = startColumnWidths.map((width) =>
                Math.max(1, Math.round(width * scale)),
              );
            } else {
              const boundedDelta = Math.min(
                startNextWidth - minColumnWidth,
                Math.max(minColumnWidth - startWidth, delta),
              );
              meta.cols ??= [];
              meta.cols[col] = Math.round(startWidth + boundedDelta);
              meta.cols[col + 1] = Math.round(startNextWidth - boundedDelta);
            }
          } else {
            meta.rows ??= [];
            meta.rows[row] = Math.max(24, Math.round(startHeight + moveEvent.clientY - startY));
          }
          grid.style.width = meta.width ? `${meta.width}px` : "100%";
          grid.querySelectorAll<HTMLTableCellElement>("[data-cell]").forEach((cell) => {
            const position = parseCellKey(cell.dataset.cell!);
            if (!position) return;
            if (meta.cols?.[position.col]) cell.style.width = `${meta.cols[position.col]}px`;
            if (meta.rows?.[position.row]) cell.style.height = `${meta.rows[position.row]}px`;
          });
          view.scrollDOM.scrollLeft = editorScrollLeft;
          view.scrollDOM.scrollTop = editorScrollTop;
          if (window.scrollX !== pageScrollX || window.scrollY !== pageScrollY) {
            window.scrollTo(pageScrollX, pageScrollY);
          }
        };
        const onUp = () => {
          window.removeEventListener("mousemove", onMove, true);
          window.removeEventListener("mouseup", onUp, true);
          document.documentElement.style.cursor = previousCursor;
          document.documentElement.style.userSelect = previousUserSelect;
          commit(false);
        };
        window.addEventListener("mousemove", onMove, { capture: true, passive: false });
        window.addEventListener("mouseup", onUp, true);
      });
      return handle;
    };

    renderBody();
    wrap.addEventListener("mouseleave", clearVisualSelection);
    wrap.appendChild(grid);
    return wrap;
  }

  ignoreEvent() {
    return true;
  }

  destroy() {
    for (const editor of this.cellViews.values()) editor.destroy();
    this.cellViews.clear();
    this.outsideActionsCleanup?.();
    this.outsideActionsCleanup = null;
    if (this.activeTarget) clearActiveEditorToolbarTarget(this.activeTarget);
    this.activeTarget = null;
    for (const timer of this.timers) {
      window.clearTimeout(timer);
    }
    this.timers.clear();
  }
}

class ListBulletWidget extends WidgetType {
  constructor(
    readonly ordered: boolean,
    readonly label: string,
  ) {
    super();
  }

  eq(other: ListBulletWidget) {
    return this.ordered === other.ordered && this.label === other.label;
  }

  toDOM() {
    const el = document.createElement("span");
    if (this.ordered) {
      el.className = "cm-lp-list-num";
      const m = /^(\d+)([.)])$/.exec(this.label);
      if (m) {
        const num = document.createElement("span");
        num.className = "cm-lp-list-num-val";
        num.textContent = m[1];
        el.appendChild(num);
        const dot = document.createElement("span");
        dot.className = "cm-lp-list-dot";
        dot.textContent = ".";
        el.appendChild(dot);
      } else {
        el.textContent = this.label;
      }
    } else {
      el.className = "cm-lp-list-bullet";
      el.textContent = "•";
    }
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  ignoreEvent() {
    return false;
  }
}

class TaskCheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }

  eq(other: TaskCheckboxWidget) {
    return (
      this.checked === other.checked &&
      this.from === other.from &&
      this.to === other.to
    );
  }

  toDOM(view: EditorView) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `cm-lp-taskbox${this.checked ? " is-checked" : ""}`;
    el.disabled = view.state.readOnly;
    el.setAttribute("aria-label", this.checked ? t("标记为未完成") : t("标记为完成"));
    el.setAttribute("aria-pressed", String(this.checked));
    el.setAttribute("contenteditable", "false");
    el.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    el.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const insert = this.checked ? "[ ] " : "[x] ";
      view.dispatch({
        changes: {
          from: this.from,
          to: this.to,
          insert,
        },
        selection: { anchor: this.from + insert.length },
      });
      view.focus();
    });
    // Keep native button baselines out of the text line in both checked states.
    const marker = document.createElement("span");
    marker.className = "cm-lp-task-marker";
    marker.setAttribute("contenteditable", "false");
    marker.appendChild(el);
    return marker;
  }

  ignoreEvent() {
    return false;
  }
}

class InlineImageWidget extends WidgetType {
  constructor(
    readonly rawAlt: string,
    readonly src: string,
    readonly rawDest: string,
    readonly from: number,
    readonly to: number,
    readonly selected: boolean,
  ) {
    super();
  }

  eq(other: InlineImageWidget) {
    return (
      this.rawAlt === other.rawAlt &&
      this.src === other.src &&
      this.rawDest === other.rawDest &&
      this.from === other.from &&
      this.to === other.to &&
      this.selected === other.selected
    );
  }

  toDOM(view: EditorView) {
    const parsed = parseImageSettings(this.rawAlt);
    const wrap = document.createElement("span");
    wrap.className = `cm-lp-image-wrap${this.selected ? " is-selected" : ""}`;
    wrap.setAttribute("contenteditable", "false");

    const img = document.createElement("img");
    img.className = "cm-lp-image";
    img.alt = parsed.label || t("图片");
    img.draggable = false;
    const frame = document.createElement("span");
    frame.className = "mn-image-frame";
    frame.append(img);
    if (parsed.width) wrap.style.width = `${parsed.width}px`;
    const error = document.createElement("span");
    error.className = "mn-image-error";
    error.hidden = true;
    error.textContent = t("图片无法加载，请检查附件或图片地址");
    img.onload = () => {
      error.hidden = true;
      if (!parsed.width) wrap.style.width = `${Math.min(img.naturalWidth, view.contentDOM.clientWidth)}px`;
      applyImageCrop(frame, img, parsed.crop);
      view.requestMeasure();
    };
    img.onerror = () => { error.hidden = false; view.requestMeasure(); };
    img.src = this.src;
    const save = (settings: ImageSettings) => {
      if (!view.dom.isConnected || this.to > view.state.doc.length || view.state.doc.sliceString(this.from, this.to) !== `![${this.rawAlt}](${this.rawDest})`) return;
      const insert = `![${imageAlt(settings)}](${this.rawDest})`;
      view.dispatch({ changes: { from: this.from, to: this.to, insert },
        selection: EditorSelection.range(this.from, this.from + insert.length),
        effects: view.scrollSnapshot(), scrollIntoView: false });
    };
    const actions = document.createElement("span");
    actions.className = "mn-image-actions";
    const crop = mediaIconButton(Crop, t("裁剪图片"));
    crop.onclick = () => openImageCropDialog(this.src, parsed.crop, (next) => save({ ...parsed, crop: next }));
    const reset = mediaIconButton(Maximize2, t("恢复原图"));
    reset.onclick = () => save({ ...parsed, crop: null, width: null });
    actions.append(crop, reset);
    const dimensions = document.createElement("span");
    dimensions.className = "mn-image-dimensions";
    dimensions.hidden = true;
    for (const corner of ["nw", "ne", "sw", "se"]) {
      const handle = document.createElement("span");
      handle.className = `cm-lp-image-resize mn-image-handle-${corner}`;
      handle.setAttribute("aria-hidden", "true");
      handle.addEventListener("pointerdown", (event) => {
        event.preventDefault(); event.stopPropagation();
        handle.setPointerCapture(event.pointerId);
        const rect = frame.getBoundingClientRect();
        const ratio = rect.width / Math.max(1, rect.height);
        const max = view.contentDOM.clientWidth;
        const startX = event.clientX, startY = event.clientY;
        let next = rect.width;
        const move = (e: PointerEvent) => {
          const dx = (e.clientX - startX) * (corner.includes("w") ? -1 : 1);
          const dy = (e.clientY - startY) * (corner.includes("n") ? -1 : 1);
          next = Math.round(Math.min(max, Math.max(40, rect.width + (dx + dy / ratio) / (1 + 1 / ratio ** 2))));
          wrap.style.width = `${next}px`;
          dimensions.textContent = `${next} × ${Math.round(next / ratio)}`;
          dimensions.hidden = false;
          view.requestMeasure();
        };
        const end = (e: PointerEvent) => {
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", end);
          handle.removeEventListener("pointercancel", cancel);
          if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
          dimensions.hidden = true;
          save({ ...parsed, width: next });
        };
        const cancel = (e: PointerEvent) => { next = rect.width; end(e); };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", end);
        handle.addEventListener("pointercancel", cancel);
      });
      wrap.append(handle);
    }

    wrap.addEventListener("mousedown", (event) => {
      if ((event.target as HTMLElement).closest("button, .cm-lp-image-resize")) { event.preventDefault(); event.stopPropagation(); return; }
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({
        selection: EditorSelection.range(this.from, this.to),
      });
      view.focus();
    });

    wrap.prepend(frame);
    wrap.append(error, actions, dimensions);
    return wrap;
  }

  ignoreEvent() {
    return false;
  }
}

/** 代码块左侧缩进：用 widget 而不是 line padding，避免选区蓝块画进 padding 左侧溢出 */
class CodeIndentWidget extends WidgetType {
  eq() {
    return true;
  }

  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-lp-code-indent";
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  ignoreEvent() {
    return true;
  }
}

const codeIndentDeco = Decoration.widget({
  widget: new CodeIndentWidget(),
  side: -1,
});

const codeIndentRightDeco = Decoration.widget({
  widget: new (class extends WidgetType {
    eq() {
      return true;
    }
    toDOM() {
      const el = document.createElement("span");
      el.className = "cm-lp-code-indent-right";
      el.setAttribute("aria-hidden", "true");
      return el;
    }
    ignoreEvent() {
      return true;
    }
  })(),
  side: 1,
});

class CodeLanguageWidget extends WidgetType {
  constructor(readonly from: number, readonly raw: string, readonly language: string) { super(); }

  eq(other: CodeLanguageWidget) {
    return this.from === other.from && this.raw === other.raw && this.language === other.language;
  }

  toDOM(view: EditorView) {
    const select = document.createElement("select");
    select.className = "cm-lp-code-language";
    select.disabled = view.state.readOnly;
    select.setAttribute("aria-label", t("代码语言"));
    select.title = t("代码语言");
    select.setAttribute("contenteditable", "false");
    const description = resolveCodeLanguage(this.language);
    const current = CODE_LANGUAGE_OPTIONS.find(([value]) => value === this.language ||
      (description && resolveCodeLanguage(value) === description))?.[0] ?? this.language;
    for (const [value, label] of CODE_LANGUAGE_OPTIONS) {
      select.add(new Option(t(label), value));
    }
    if (current && !CODE_LANGUAGE_OPTIONS.some(([value]) => value === current)) {
      select.add(new Option(description?.name || current, current));
    }
    select.value = current;
    select.addEventListener("mousedown", (event) => event.stopPropagation());
    select.addEventListener("change", () => {
      const match = /^(\s*(?:`{3,}|~{3,}))/.exec(this.raw);
      if (!match || view.state.doc.sliceString(this.from, this.from + this.raw.length) !== this.raw) return;
      view.dispatch({
        changes: { from: this.from, to: this.from + this.raw.length, insert: match[1] + select.value },
        effects: view.scrollSnapshot(), scrollIntoView: false,
      });
      view.focus();
    });
    return select;
  }

  ignoreEvent() { return true; }
}

class CodeCopyWidget extends WidgetType {
  constructor(readonly code: string) {
    super();
  }

  eq(other: CodeCopyWidget) {
    return this.code === other.code;
  }

  toDOM() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-lp-code-copy";
    button.title = t("复制代码");
    button.setAttribute("aria-label", t("复制代码"));
    button.setAttribute("contenteditable", "false");
    const setLabel = (label: string, showIcon = true) => {
      button.replaceChildren();
      if (showIcon) {
        const icon = document.createElement("span");
        icon.className = "cm-lp-code-copy__icon";
        icon.setAttribute("aria-hidden", "true");
        button.appendChild(icon);
      }
      const text = document.createElement("span");
      text.textContent = label;
      button.appendChild(text);
    };
    setLabel(t("复制"));
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        await navigator.clipboard.writeText(this.code);
        setLabel(t("已复制"), false);
        window.setTimeout(() => {
          setLabel(t("复制"));
        }, 1200);
      } catch {
        setLabel(t("复制失败"), false);
        window.setTimeout(() => {
          setLabel(t("复制"));
        }, 1200);
      }
    });
    return button;
  }

  ignoreEvent() {
    return false;
  }
}

class CodeExitWidget extends WidgetType {
  constructor(readonly pos: number) {
    super();
  }

  eq(other: CodeExitWidget) {
    return this.pos === other.pos;
  }

  toDOM(view: EditorView) {
    const el = document.createElement("div");
    el.className = "cm-lp-code-exit";
    el.setAttribute("contenteditable", "false");
    el.title = t("点击在代码块后继续输入");
    el.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({
        changes: { from: this.pos, insert: "\n" },
        selection: { anchor: this.pos + 1 },
        effects: EditorView.scrollIntoView(this.pos + 1, {
          y: "center",
          yMargin: 80,
        }),
      });
      view.focus();
    });
    return el;
  }

  ignoreEvent() {
    return false;
  }
}

let activeCalloutIconAnchor: HTMLElement | null = null;
let activeCalloutIconPopoverCleanup: (() => void) | null = null;

function closeCalloutIconPopover() {
  const cleanup = activeCalloutIconPopoverCleanup;
  activeCalloutIconPopoverCleanup = null;
  activeCalloutIconAnchor = null;
  cleanup?.();
}

class CalloutHeadWidget extends WidgetType {
  constructor(
    readonly iconId: string,
    readonly markerFrom: number,
    readonly markerTo: number,
  ) {
    super();
  }

  eq(other: CalloutHeadWidget) {
    return (
      this.iconId === other.iconId &&
      this.markerFrom === other.markerFrom &&
      this.markerTo === other.markerTo
    );
  }

  toDOM(view: EditorView) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "cm-lp-callout-head-widget";
    el.disabled = view.state.readOnly;
    el.setAttribute("contenteditable", "false");
    el.setAttribute("aria-haspopup", "dialog");
    el.setAttribute("aria-label", t("选择高亮块图标"));
    el.title = t("选择高亮块图标");

    const icon = document.createElement("span");
    icon.className = "cm-lp-callout-head-widget__icon";
    icon.innerHTML = calloutIconSvg(this.iconId);

    el.append(icon);
    el.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    el.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (activeCalloutIconAnchor === el) {
        closeCalloutIconPopover();
        return;
      }
      closeCalloutIconPopover();

      const panel = document.createElement("div");
      panel.className = "cm-lp-callout-icon-popover";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", t("选择高亮块图标"));

      const heading = document.createElement("div");
      heading.className = "cm-lp-callout-icon-popover__title";
      heading.textContent = t("选择图标");
      panel.appendChild(heading);

      const grid = document.createElement("div");
      grid.className = "cm-lp-callout-icon-popover__grid";
      const currentIcon = sanitizeCalloutIcon(this.iconId);
      for (const definition of LIBRARY_ICONS) {
        const option = document.createElement("button");
        option.type = "button";
        option.className = `cm-lp-callout-icon-popover__option${
          definition.id === currentIcon ? " is-selected" : ""
        }`;
        option.title = definition.label;
        option.setAttribute("aria-label", definition.label);

        const optionIcon = document.createElement("span");
        optionIcon.className = "cm-lp-callout-icon-popover__option-icon";
        optionIcon.innerHTML = definition.svg;
        const optionLabel = document.createElement("span");
        optionLabel.className = "cm-lp-callout-icon-popover__option-label";
        optionLabel.textContent = definition.label;
        option.append(optionIcon, optionLabel);
        option.addEventListener("mousedown", (downEvent) => {
          downEvent.preventDefault();
          downEvent.stopPropagation();
        });
        option.addEventListener("click", (clickEvent) => {
          clickEvent.preventDefault();
          clickEvent.stopPropagation();
          const currentMarker = view.state.doc.sliceString(
            this.markerFrom,
            this.markerTo,
          );
          const nextMarker = updateCalloutMarkerIcon(
            currentMarker,
            definition.id,
          );
          closeCalloutIconPopover();
          view.dispatch({
            changes: {
              from: this.markerFrom,
              to: this.markerTo,
              insert: nextMarker,
            },
          });
          view.focus();
        });
        grid.appendChild(option);
      }
      panel.appendChild(grid);
      document.body.appendChild(panel);

      const anchorRect = el.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const left = Math.min(
        window.innerWidth - panelRect.width - 8,
        Math.max(8, anchorRect.left),
      );
      const roomBelow = window.innerHeight - anchorRect.bottom - 8;
      const top =
        roomBelow >= panelRect.height
          ? anchorRect.bottom + 6
          : Math.max(8, anchorRect.top - panelRect.height - 6);
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;

      const closeOnOutside = (outsideEvent: MouseEvent) => {
        const target = outsideEvent.target;
        if (
          target instanceof Node &&
          (panel.contains(target) || el.contains(target))
        ) {
          return;
        }
        closeCalloutIconPopover();
      };
      const closeOnKey = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key === "Escape") closeCalloutIconPopover();
      };
      const cleanup = () => {
        panel.remove();
        window.removeEventListener("mousedown", closeOnOutside, true);
        window.removeEventListener("keydown", closeOnKey, true);
        window.removeEventListener("scroll", closeCalloutIconPopover, true);
      };
      activeCalloutIconAnchor = el;
      activeCalloutIconPopoverCleanup = cleanup;
      window.addEventListener("mousedown", closeOnOutside, true);
      window.addEventListener("keydown", closeOnKey, true);
      window.addEventListener("scroll", closeCalloutIconPopover, true);
    });
    return el;
  }

  ignoreEvent() {
    return false;
  }

  destroy(dom: HTMLElement) {
    if (activeCalloutIconAnchor === dom) closeCalloutIconPopover();
  }
}

function listDepth(node: {
  node: { parent: { type: { name: string }; parent: unknown } | null };
}): number {
  let depth = 0;
  let p: { type: { name: string }; parent: unknown } | null = node.node.parent;
  while (p) {
    if (p.type.name === "BulletList" || p.type.name === "OrderedList") depth += 1;
    p = p.parent as { type: { name: string }; parent: unknown } | null;
  }
  return Math.max(depth, 1);
}

function parentNodeName(node: {
  node: { parent: { type: { name: string } } | null };
}) {
  return node.node.parent?.type.name ?? "";
}


function readHtmlAttr(rawAttrs: string, name: string) {
  const re = new RegExp(`${name}\\s*=\\s*([\"'])(.*?)\\1`, "i");
  return re.exec(rawAttrs)?.[2] ?? "";
}

function readCssProp(style: string, prop: string) {
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i");
  return re.exec(style)?.[1]?.trim() ?? "";
}

function parseFenceOpen(text: string) {
  const m = FENCE_OPEN_RE.exec(text);
  if (!m) return null;
  return { fence: m[2]!, lang: (m[3] || "").trim() };
}

function isFenceClose(text: string, fence: string) {
  const ch = fence[0] ?? "`";
  const min = fence.length;
  const trimmed = text.trim();
  if (trimmed.length < min) return false;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] !== ch) return false;
  }
  return true;
}

/** 收集围栏代码块区间，用于行样式与跳过 HR 误伤 */
function findFenceRanges(
  state: EditorState,
): FenceRange[] {
  const ranges: FenceRange[] = [];
  let pos = 0;
  const end = state.doc.length;
  while (pos <= end) {
    const line = state.doc.lineAt(pos);
    const open = parseFenceOpen(line.text);
    if (open) {
      let blockEnd = line.to;
      let n = line.number;
      let closed = false;
      while (n < state.doc.lines) {
        const L = state.doc.line(n + 1);
        if (isFenceClose(L.text, open.fence)) {
          blockEnd = L.to;
          closed = true;
          break;
        }
        blockEnd = L.to;
        n += 1;
      }
      // 正在输入中的代码块通常还没有结束围栏，也要立即进入代码块预览态。
      ranges.push({ from: line.from, to: blockEnd, closed });
      pos = blockEnd + 1;
      if (closed) continue;
      break;
    }
    if (line.number >= state.doc.lines) break;
    pos = line.to + 1;
  }
  return ranges;
}

function inRanges(
  ranges: readonly FenceRange[],
  from: number,
  to: number,
) {
  return ranges.some((r) => from < r.to && to > r.from);
}

function hasBlankLineAfter(state: EditorState, lineNumber: number) {
  if (lineNumber >= state.doc.lines) return false;
  const next = state.doc.line(lineNumber + 1);
  return next.text.trim().length === 0;
}

function buildLivePreviewDeco(
  state: EditorState,
  notePath?: string | null,
  libraryRootPath?: string | null,
  inlineOnly = false,
): DecorationSet {
  try {
    return buildLivePreviewDecoInner(state, notePath, libraryRootPath, inlineOnly);
  } catch (err) {
    console.error("[livePreview] decoration build failed", err);
    return Decoration.none;
  }
}

/**
 * 可编辑优先的 Live Preview：
 * - 光标所在行始终显示 Markdown 源码
 * - 其它行隐藏标记、套样式
 * - 表格会替换成可直接编辑的块级 widget
 */
function buildLivePreviewDecoInner(
  state: EditorState,
  notePath?: string | null,
  libraryRootPath?: string | null,
  inlineOnly = false,
): DecorationSet {
  const sel = state.selection.main;
  // 选区任一端所在行也视为「编辑中」，保持源码可见
  const activeLines = new Set<number>(state.readOnly ? [] : [
    state.doc.lineAt(sel.head).number,
    state.doc.lineAt(sel.anchor).number,
  ]);
  const entries: DecoEntry[] = [];
  const fenceRanges = inlineOnly ? [] : findFenceRanges(state);
  const claimedInlineRanges = parsedInlineFormatRanges(state);

  // 代码块行背景（不替换源码）
  for (const r of fenceRanges) {
    const startLine = state.doc.lineAt(r.from);
    const endLine = state.doc.lineAt(Math.max(r.from, r.to - 1));
    const open = parseFenceOpen(startLine.text);
    const lang = open?.lang || "";
    const firstCodeLineNumber = startLine.number + 1;
    const lastCodeLineNumber = r.closed ? endLine.number - 1 : endLine.number;
    const hasCodeLines = firstCodeLineNumber <= lastCodeLineNumber;
    const copyLineNumber = hasCodeLines ? firstCodeLineNumber : null;
    const langLineNumber = hasCodeLines ? firstCodeLineNumber : null;
    const code =
      hasCodeLines && firstCodeLineNumber <= lastCodeLineNumber
        ? Array.from(
            { length: lastCodeLineNumber - firstCodeLineNumber + 1 },
            (_, index) => state.doc.line(firstCodeLineNumber + index).text,
          ).join("\n")
        : "";
    for (let ln = startLine.number; ln <= endLine.number; ln++) {
      const L = state.doc.line(ln);
      const parts = ["cm-lp-codeblock-line"];
      if (ln === startLine.number) parts.push("cm-lp-codeblock-first");
      if (r.closed && ln === endLine.number) parts.push("cm-lp-codeblock-last");
      if (ln === copyLineNumber) parts.push("cm-lp-codeblock-copy-line");
      if (ln === langLineNumber) parts.push("cm-lp-codeblock-lang-line");
      if (hasCodeLines && ln === firstCodeLineNumber) {
        parts.push("cm-lp-codeblock-content-first");
      }
      if (hasCodeLines && ln === lastCodeLineNumber) {
        parts.push("cm-lp-codeblock-content-last");
      }
      const spec: { class: string; attributes?: Record<string, string> } = {
        class: parts.join(" "),
      };
      // Keep the language control on the first code line; changing it updates the fence.
      if (ln === langLineNumber) {
        push(entries, L.to, L.to, Decoration.widget({
          widget: new CodeLanguageWidget(startLine.from, startLine.text, lang), side: 2,
        }));
      }
      push(entries, L.from, L.from, Decoration.line(spec));
      // 只给真实代码行加左右缩进；首尾 fence 行不再制造可点击的假行高。
      if (hasCodeLines && ln >= firstCodeLineNumber && ln <= lastCodeLineNumber) {
        push(entries, L.from, L.from, codeIndentDeco);
        push(entries, L.to, L.to, codeIndentRightDeco);
      }
      if (ln === copyLineNumber) {
        push(
          entries,
          L.to,
          L.to,
          Decoration.widget({
            widget: new CodeCopyWidget(code),
            side: 1,
          }),
        );
      }
    }
    if (r.closed && !hasBlankLineAfter(state, endLine.number)) {
      push(
        entries,
        endLine.to,
        endLine.to,
        Decoration.widget({
          widget: new CodeExitWidget(endLine.to),
          side: 100,
          block: true,
        }),
      );
    }
  }

  // 分割线：始终画线并隐藏 ---（含光标行），避免点进去露出源码；仍可 Backspace 删除
  let pos = 0;
  while (pos <= state.doc.length) {
    const line = state.doc.lineAt(pos);
    if (
      line.length > 0 &&
      !inRanges(fenceRanges, line.from, line.to) &&
      HR_LINE_RE.test(line.text)
    ) {
      const hrClass = activeLines.has(line.number)
        ? "cm-lp-hr-line is-active"
        : "cm-lp-hr-line";
      push(
        entries,
        line.from,
        line.from,
        Decoration.line({ class: hrClass }),
      );
      push(entries, line.from, line.to, hideMark);
    }
    if (line.number >= state.doc.lines) break;
    pos = line.to + 1;
  }

  // 表格内部元数据只用于保存宽高/合并/样式，孤立时也不要在实时预览里露出。
  pos = 0;
  while (pos <= state.doc.length) {
    const line = state.doc.lineAt(pos);
    if (
      line.length > 0 &&
      !inRanges(fenceRanges, line.from, line.to) &&
      TABLE_META_LINE_RE.test(line.text.trim())
    ) {
      push(
        entries,
        line.from,
        line.from,
        Decoration.line({ class: "cm-lp-table-meta-line" }),
      );
      push(entries, line.from, line.to, hideMark);
    }
    if (line.number >= state.doc.lines) break;
    pos = line.to + 1;
  }

  pos = 0;
  while (pos <= state.doc.length) {
    const line = state.doc.lineAt(pos);
    if (
      line.length > 0 &&
      !inRanges(fenceRanges, line.from, line.to) &&
      !TABLE_META_LINE_RE.test(line.text.trim()) &&
      !line.text.trimStart().startsWith("|")
    ) {
      LOOSE_STRONG_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = LOOSE_STRONG_RE.exec(line.text))) {
        const from = line.from + match.index;
        const to = from + match[0].length;
        push(entries, from, from + 2, hideMark);
        push(entries, to - 2, to, hideMark);
        push(
          entries,
          from + 2,
          to - 2,
          Decoration.mark({ class: "cm-lp-strong" }),
        );
      }
      // Combined bold + italic must be claimed before ** and *. CommonMark
      // does not parse *** when its entire body is an inline HTML wrapper.
      pushInlinePairMarks(
        entries,
        line.from,
        line.text,
        "***",
        "cm-lp-strong cm-lp-em",
        claimedInlineRanges,
      );
      pushInlinePairMarks(
        entries,
        line.from,
        line.text,
        "___",
        "cm-lp-strong cm-lp-em",
        claimedInlineRanges,
      );
      pushInlinePairMarks(
        entries,
        line.from,
        line.text,
        "**",
        "cm-lp-strong",
        claimedInlineRanges,
      );
      pushInlinePairMarks(
        entries,
        line.from,
        line.text,
        "__",
        "cm-lp-strong",
        claimedInlineRanges,
      );
      pushInlinePairMarks(
        entries,
        line.from,
        line.text,
        "*",
        "cm-lp-em",
        claimedInlineRanges,
      );
      pushInlinePairMarks(
        entries,
        line.from,
        line.text,
        "_",
        "cm-lp-em",
        claimedInlineRanges,
      );
      pushInlinePairMarks(
        entries,
        line.from,
        line.text,
        "~~",
        "cm-lp-strike",
        claimedInlineRanges,
      );
    }
    if (line.number >= state.doc.lines) break;
    pos = line.to + 1;
  }

  syntaxTree(state).iterate({
    enter(node) {
      const name = node.name;
      if (inlineOnly && (name === "Table" || name === "Image")) return false;
      if (inlineOnly && (HEADING_LINE_CLASS[name] || ["HeaderMark", "ListMark", "ListItem", "Task", "TaskMarker", "QuoteMark"].includes(name))) return;
      // The image widget owns its complete source range, including link markers.
      if (name === "Image") return false;

      // Keep nested literal brackets from becoming shortcut-reference links.
      if (name === "Link" && node.from > 0 &&
          state.doc.sliceString(node.from - 1, node.from) === "[" &&
          state.doc.sliceString(node.to, node.to + 1) === "]" &&
          /^\[[^\[\]\n]*\]$/.test(state.doc.sliceString(node.from, node.to))) {
        push(entries, node.from, node.to, Decoration.mark({ class: "cm-lp-bracket-text" }));
        return false;
      }

      if (name === "Table") {
        const raw = state.doc.sliceString(node.from, node.to);
        const parsedMeta = readTableMetaAfter(state, node.to);
        push(
          entries,
          node.from,
          parsedMeta.to,
          Decoration.replace({
            widget: new TableWidget(raw, node.from, parsedMeta.to, parsedMeta.meta),
            block: true,
            // Own both boundaries so CodeMirror does not create editable
            // empty lines at the start/end of the hidden Markdown table.
            inclusive: true,
          }),
        );
        return false;
      }

      if (TABLE_NODE_NAMES.has(name)) return false;

      if (name === "FencedCode" || name === "CodeBlock") {
        // 继续进入子节点：可单独处理 CodeMark / CodeInfo
        return;
      }

      if (name === "ListItem") {
        const depth = listDepth(node);
        const L = state.doc.lineAt(node.from);
        push(
          entries,
          L.from,
          L.from,
          Decoration.line({
            class: `cm-lp-list-item cm-lp-list-depth-${Math.min(depth, 4)}`,
          }),
        );
        return;
      }

      if (name === "ListMark") {
        const text = state.doc.sliceString(node.from, node.to).trim();
        const ordered = /^\d+[.)]/.test(text);
        const lineText = state.doc.lineAt(node.from).text;
        const isTaskLine = /^\s*(?:>\s*)*[-*+]\s+\[[ xX]\](?:\s|$)/.test(lineText);
        const label = ordered
          ? text.replace(/\)$/, ".").replace(/\s+$/, "")
          : "•";
        // 一并吃掉标记后的空格，避免 widget + 源码空格双重间距
        let to = node.to;
        if (to < state.doc.length && state.doc.sliceString(to, to + 1) === " ") {
          to += 1;
        }
        if (isTaskLine) {
          return;
        }
        push(
          entries,
          node.from,
          to,
          Decoration.replace({
            widget: new ListBulletWidget(ordered, label),
          }),
        );
        return;
      }

      if (name === "Task") {
        return;
      }

      if (name === "TaskMarker") {
        return;
      }

      // 标题 # / ## 及后随空格：replace 掉以与正文左对齐（hide 仍占宽）
      if (name === "HeaderMark") {
        const line = state.doc.lineAt(node.from);
        if (!isAtxHeadingLine(line.text.trimStart())) {
          push(
            entries,
            node.from,
            node.to,
            Decoration.mark({ class: "cm-lp-hash-plain" }),
          );
          return;
        }
        let to = node.to;
        if (to < state.doc.length && state.doc.sliceString(to, to + 1) === " ") {
          to += 1;
        }
        push(entries, node.from, to, Decoration.replace({}));
        return;
      }

      if (MARK_NODES.has(name)) {
        if (name === "URL" && parentNodeName(node) === "Autolink") return;
        push(entries, node.from, node.to, hideMark);
        return;
      }

      // 标题样式挂在整行（避免与 HeaderMark replace 区间重叠）
      const headingLineClass = HEADING_LINE_CLASS[name];
      if (headingLineClass) {
        const L = state.doc.lineAt(node.from);
        if (
          name.startsWith("ATXHeading") &&
          !isAtxHeadingLine(L.text.trimStart())
        ) {
          return;
        }
        push(
          entries,
          L.from,
          L.from,
          Decoration.line({ class: headingLineClass }),
        );
        return;
      }

      if (name === "StrongEmphasis") {
        push(
          entries,
          node.from,
          node.to,
          Decoration.mark({ class: "cm-lp-strong" }),
        );
        return;
      }

      if (name === "Emphasis") {
        push(
          entries,
          node.from,
          node.to,
          Decoration.mark({ class: "cm-lp-em" }),
        );
        return;
      }

      if (name === "Subscript") {
        push(
          entries,
          node.from,
          node.to,
          Decoration.mark({ class: "cm-lp-sub" }),
        );
        return;
      }

      if (name === "Superscript") {
        push(
          entries,
          node.from,
          node.to,
          Decoration.mark({ class: "cm-lp-sup" }),
        );
        return;
      }

      if (name === "InlineCode") {
        push(
          entries,
          node.from,
          node.to,
          Decoration.mark({ class: "cm-lp-code" }),
        );
        return;
      }

      if (name === "Link") {
        push(
          entries,
          node.from,
          node.to,
          Decoration.mark({ class: "cm-lp-link" }),
        );
      }

      if (name === "Autolink") {
        push(
          entries,
          node.from,
          node.to,
          Decoration.mark({ class: "cm-lp-link" }),
        );
      }

      if (name === "Blockquote") {
        return;
      }
    },
  });

  // 引用 / 高亮块：逐行加样式；高亮头用 widget 展示，隐藏内部标记
  pos = 0;
  let activeCalloutColor: string | null = null;
  while (pos <= state.doc.length) {
    const line = state.doc.lineAt(pos);
    if (!inlineOnly && line.length > 0 && !inRanges(fenceRanges, line.from, line.to)) {
      const text = line.text;
      const task = /^(\s*(?:>\s*)*)([-*+]\s+)(\[[ xX]\])(?:[ \t]|$)/.exec(text);
      if (task) {
        const from = line.from + task[1].length;
        const markerFrom = from + task[2].length;
        const to = line.from + task[0].length;
        const checked = /x/i.test(task[3]);
        push(entries, line.from, line.from, Decoration.line({ class: `cm-lp-task-item${checked ? " is-checked" : ""}` }));
        push(entries, from, to, Decoration.replace({ widget: new TaskCheckboxWidget(checked, markerFrom, to) }));
        if (checked && to < line.to) push(entries, to, line.to, Decoration.mark({ class: "cm-lp-task-done-text" }));
      }
      if (/^\s*>\s?/.test(text)) {
        const calloutHead = parseCalloutHead(text, line.from);
        if (calloutHead) activeCalloutColor = calloutHead.color;
        const isCalloutLine = Boolean(calloutHead || activeCalloutColor);
        const nextLine =
          line.number < state.doc.lines ? state.doc.line(line.number + 1) : null;
        const nextCalloutHead = nextLine
          ? parseCalloutHead(nextLine.text, nextLine.from)
          : null;
        const continuesCallout = Boolean(
          isCalloutLine &&
            nextLine &&
            /^\s*>\s?/.test(nextLine.text) &&
            !nextCalloutHead,
        );
        const calloutClasses = [
          "cm-lp-callout",
          calloutHead ? "cm-lp-callout-head cm-lp-callout-first" : "cm-lp-callout-body",
          !continuesCallout ? "cm-lp-callout-last" : "",
        ]
          .filter(Boolean)
          .join(" ");
        push(
          entries,
          line.from,
          line.from,
          Decoration.line({
            class: isCalloutLine ? calloutClasses : "cm-lp-quote",
            attributes: isCalloutLine
              ? { style: `--mn-callout-bg:${activeCalloutColor};` }
              : undefined,
          }),
        );
        if (calloutHead) {
          push(
            entries,
            line.from,
            calloutHead.hideTo,
            Decoration.replace({
              widget: new CalloutHeadWidget(
                calloutHead.icon,
                calloutHead.markerFrom,
                calloutHead.markerTo,
              ),
            }),
          );
        }
      } else {
        activeCalloutColor = null;
      }
    } else {
      activeCalloutColor = null;
    }
    if (line.number >= state.doc.lines) break;
    pos = line.to + 1;
  }

  // 行内图片 / 颜色 / 高亮：非编辑行直接替换为视觉元素
  pos = 0;
  while (pos <= state.doc.length) {
    const line = state.doc.lineAt(pos);
    if (line.length > 0 && !inRanges(fenceRanges, line.from, line.to)) {
      const raw = line.text;
      const imgRe = /!\[([^\]]*?)\]\((<[^>\n]+>|(?:\\.|[^)\n])*)\)/g;
      let m: RegExpExecArray | null;
      while ((m = imgRe.exec(raw))) {
        const from = line.from + m.index;
        const to = from + m[0].length;
        push(
          entries,
          from,
          to,
          Decoration.replace({
            widget: new InlineImageWidget(
              m[1]?.trim() || t("图片"),
              resolveEditorImage(m[2] ?? "", notePath, libraryRootPath),
              m[2] ?? "",
              from,
              to,
              !sel.empty && sel.from <= from && sel.to >= to,
            ),
            inclusive: false,
          }),
        );
      }

      for (const range of collectInlineHtmlTagRanges(raw, "u")) {
        const openFrom = line.from + range.openFrom;
        const openTo = line.from + range.openTo;
        const closeFrom = line.from + range.closeFrom;
        const closeTo = line.from + range.closeTo;
        push(entries, openFrom, openTo, hideMark);
        push(entries, closeFrom, closeTo, hideMark);
        push(
          entries,
          openTo,
          closeFrom,
          Decoration.mark({ class: "cm-lp-underline" }),
        );
      }

      for (const range of collectInlineHtmlTagRanges(raw, "span")) {
        const style = readHtmlAttr(range.opening, "style");
        const color = readCssProp(style, "color");
        if (!color) continue;
        const openFrom = line.from + range.openFrom;
        const openTo = line.from + range.openTo;
        const closeFrom = line.from + range.closeFrom;
        const closeTo = line.from + range.closeTo;
        push(entries, openFrom, openTo, hideMark);
        push(entries, closeFrom, closeTo, hideMark);
        push(
          entries,
          openTo,
          closeFrom,
          Decoration.mark({
            class: "cm-lp-color",
            attributes: { style: `color:${color}` },
          }),
        );
      }

      for (const range of collectInlineHtmlTagRanges(raw, "mark")) {
        const style = readHtmlAttr(range.opening, "style");
        const color = readCssProp(style, "background-color");
        const openFrom = line.from + range.openFrom;
        const openTo = line.from + range.openTo;
        const closeFrom = line.from + range.closeFrom;
        const closeTo = line.from + range.closeTo;
        push(entries, openFrom, openTo, hideMark);
        push(entries, closeFrom, closeTo, hideMark);
        push(
          entries,
          openTo,
          closeFrom,
          Decoration.mark({
            class: "cm-lp-mark",
            attributes: color ? { style: `background-color:${color}` } : undefined,
          }),
        );
      }

      const markdownMarkRe = /==([^=\n]*?)==/g;
      while ((m = markdownMarkRe.exec(raw))) {
        const from = line.from + m.index;
        const to = from + m[0].length;
        const innerFrom = from + 2;
        const innerTo = to - 2;
        push(entries, from, innerFrom, hideMark);
        push(entries, innerTo, to, hideMark);
        push(
          entries,
          innerFrom,
          innerTo,
          Decoration.mark({ class: "cm-lp-mark" }),
        );
      }

    }
    if (line.number >= state.doc.lines) break;
    pos = line.to + 1;
  }

  if (!inlineOnly) {
    const blocks = alignmentBlocks(state);
    const boundaries = new Set(blocks.flatMap(block => [block.openLine, block.closeLine]));
    for (const number of boundaries) {
      const line = state.doc.line(number);
      push(entries, line.from, line.from, Decoration.line({class: "cm-lp-align-boundary"}));
      push(entries, line.from, line.to, hideMark);
    }
    for (let number = 1; number <= state.doc.lines; number++) {
      if (boundaries.has(number)) continue;
      const align = lineAlignment(blocks, number);
      if (align === "left") continue;
      const line = state.doc.line(number);
      push(entries, line.from, line.from, Decoration.line({class: `cm-lp-align-${align}`}));
    }
  }

  const widgets = entries.filter((entry) => entry.to > entry.from && entry.deco.spec.widget);
  const hidden = entries.filter((entry) => entry.deco === hideMark &&
    !widgets.some((widget) => entry.from < widget.to && entry.to > widget.from))
    .sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: DecoEntry[] = [];
  for (const entry of hidden) {
    const previous = merged[merged.length - 1];
    if (previous && entry.from <= previous.to) previous.to = Math.max(previous.to, entry.to);
    else merged.push({ ...entry });
  }
  const normalized = entries.filter((entry) => entry.deco !== hideMark &&
    (!inlineOnly || entry.from !== entry.to));
  normalized.push(...merged);
  normalized.sort((a, b) => a.from - b.from || a.to - b.to);
  return Decoration.set(
    normalized.map((e) => e.deco.range(e.from, e.to)),
    true,
  );
}

/** Obsidian 式 Live Preview：编辑行显示源码，其它行隐藏标记并套样式 */
export function livePreviewExtension(
  notePath?: string | null,
  libraryRootPath?: string | null,
  inlineOnly = false,
) {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildLivePreviewDeco(state, notePath, libraryRootPath, inlineOnly);
    },
    update(deco, tr) {
      if (tr.docChanged || tr.selection) {
        return buildLivePreviewDeco(tr.state, notePath, libraryRootPath, inlineOnly);
      }
      return deco;
    },
    provide: (f) => [
      EditorView.decorations.from(f),
      EditorView.atomicRanges.of((view) => view.state.field(f).update({
        filter: (from, to, value) => from < to && (value === hideMark || Boolean(value.spec.widget)),
      })),
    ],
  });
}
