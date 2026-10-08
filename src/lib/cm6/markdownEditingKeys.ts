import { EditorSelection } from "@codemirror/state";
import { EditorView, type KeyBinding } from "@codemirror/view";
import { applyFormat, unwrapInlineFormats } from "@/lib/cm6/mdFormat";
import { alignmentBlocks } from "./alignment";

type ListLine = {
  indent: string;
  kind: "ordered" | "bullet" | "task";
  marker: string;
  number?: number;
  delimiter?: string;
  prefixLength: number;
  content: string;
};

const LIST_LINE_RE =
  /^(\s*)(?:(\d+)([.)])|([-*+]))\s+(?:\[([ xX])\]\s+)?(.*)$/;
const FENCE_OPEN_LINE_RE = /^\s*(`{3,}|~{3,})([\w+-]*)\s*$/;
const FENCE_CLOSE_LINE_RE = /^\s*(`{3,}|~{3,})\s*$/;
const INLINE_CLOSERS_ONLY_RE =
  /^(?:(?:\*\*|__|~~|==|<\/(?:mark|span|u)>|[*_`])+\s*)$/i;
const ATX_HEADING_PREFIX_RE = /^(\s*#{1,6}\s+)/;
const LEADING_TITLE_RE = /^#\s+/;
const BLOCKQUOTE_PREFIX_RE = /^(\s*>+\s*)/;
const TAB_INSERT = "  ";

function protectAlignmentBoundary(view: EditorView, backward: boolean) {
  if (view.dom.closest('.is-source') || !view.state.selection.main.empty) return false;
  const { head } = view.state.selection.main;
  const line = view.state.doc.lineAt(head);
  const blocks = alignmentBlocks(view.state);
  const adjacent = blocks.find(block => backward
    ? line.number === block.closeLine || (head === line.from && !!line.text && line.number === block.closeLine + 1)
    : line.number === block.openLine || (head === line.to && !!line.text && line.number === block.openLine - 1));
  if (adjacent) {
    view.dispatch({selection: EditorSelection.cursor(backward ? adjacent.innerTo : adjacent.innerFrom)});
    return true;
  }
  const boundary = blocks.find(block => line.number === block.openLine || line.number === block.closeLine);
  if (boundary) {
    view.dispatch({selection: EditorSelection.cursor(line.number === boundary.openLine ? boundary.innerFrom : boundary.innerTo)});
    return true;
  }
  const touchesBoundary = blocks.some(block => backward
    ? head === line.from && line.number === block.openLine + 1
    : head === line.to && line.number === block.closeLine - 1);
  if (!touchesBoundary) return false;
  // Joining text to an invisible tag would turn the whole block into raw HTML.
  // At this boundary, delete the paragraph's alignment before joining lines.
  applyFormat(view, {type: 'align', align: 'left'});
  return true;
}

type FenceBlock = {
  openLine: ReturnType<EditorView["state"]["doc"]["line"]>;
  closeLine: ReturnType<EditorView["state"]["doc"]["line"]>;
};

function parseListLine(text: string): ListLine | null {
  const match = LIST_LINE_RE.exec(text);
  if (!match) return null;
  const indent = match[1] ?? "";
  const orderedNumber = match[2];
  const delimiter = match[3] ?? ".";
  const bullet = match[4] ?? "-";
  const taskMark = match[5];
  const content = match[6] ?? "";
  const prefixLength = text.length - content.length;
  if (taskMark != null) {
    return {
      indent,
      kind: "task",
      marker: bullet,
      prefixLength,
      content,
    };
  }
  if (orderedNumber) {
    return {
      indent,
      kind: "ordered",
      marker: orderedNumber,
      number: Number(orderedNumber),
      delimiter,
      prefixLength,
      content,
    };
  }
  return {
    indent,
    kind: "bullet",
    marker: bullet,
    prefixLength,
    content,
  };
}

function nextListPrefix(info: ListLine) {
  if (info.kind === "task") return `${info.indent}${info.marker} [ ] `;
  if (info.kind === "ordered") {
    return `${info.indent}${(info.number ?? 0) + 1}${info.delimiter ?? "."} `;
  }
  return `${info.indent}${info.marker} `;
}

function isLeadingNoteTitleLine(text: string, lineNumber: number) {
  return lineNumber === 1 && LEADING_TITLE_RE.test(text) && !/^##/.test(text);
}

function headingPrefixLength(text: string) {
  const match = ATX_HEADING_PREFIX_RE.exec(text);
  return match?.[1]?.length ?? 0;
}

function clearInlineFormatsOnRange(
  view: EditorView,
  from: number,
  to: number,
  text: string,
) {
  const next = unwrapInlineFormats(text);
  if (next === text) return false;
  view.dispatch({
    changes: { from, to, insert: next },
    selection: EditorSelection.cursor(from),
  });
  return true;
}

/**
 * 标题文字最前面 Backspace：清除标题格式（去掉 #），笔记首行 H1 标题只清行内格式。
 */
function clearFormatAtHeadingContentStart(view: EditorView) {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;

  const line = state.doc.lineAt(sel.head);
  const prefixLen = headingPrefixLength(line.text);
  if (!prefixLen) return false;
  if (sel.head !== line.from + prefixLen) return false;

  // 笔记约定首行 `# 标题`：不可降级成正文，只清除行内格式
  if (isLeadingNoteTitleLine(line.text, line.number)) {
    const content = line.text.slice(prefixLen);
    return (
      clearInlineFormatsOnRange(
        view,
        line.from + prefixLen,
        line.to,
        content,
      ) || true
    );
  }

  view.dispatch({
    changes: { from: line.from, to: line.from + prefixLen, insert: "" },
    selection: EditorSelection.cursor(line.from),
  });
  return true;
}

/**
 * 正文首行行首 Backspace：不要合并进笔记标题，改为清除当前行格式。
 */
function clearFormatOrBlockJoinIntoTitle(view: EditorView) {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;

  const line = state.doc.lineAt(sel.head);
  if (line.number <= 1 || sel.head !== line.from) return false;

  const prev = state.doc.line(line.number - 1);
  if (!isLeadingNoteTitleLine(prev.text, prev.number)) return false;

  // 标题下的空行：删掉空行本身，不要把下一行拼进标题
  if (!line.text) {
    const delTo =
      line.number < state.doc.lines ? line.to + 1 : line.to;
    if (delTo > line.from) {
      view.dispatch({
        changes: { from: line.from, to: delTo },
        selection: EditorSelection.cursor(line.from),
      });
    }
    return true;
  }

  const headingLen = headingPrefixLength(line.text);
  if (headingLen > 0) {
    view.dispatch({
      changes: { from: line.from, to: line.from + headingLen, insert: "" },
      selection: EditorSelection.cursor(line.from),
    });
    return true;
  }

  const quote = BLOCKQUOTE_PREFIX_RE.exec(line.text);
  if (quote?.[1]) {
    view.dispatch({
      changes: {
        from: line.from,
        to: line.from + quote[1].length,
        insert: "",
      },
      selection: EditorSelection.cursor(line.from),
    });
    return true;
  }

  const list = parseListLine(line.text);
  if (list && list.prefixLength > 0) {
    view.dispatch({
      changes: {
        from: line.from,
        to: line.from + list.prefixLength,
        insert: list.indent,
      },
      selection: EditorSelection.cursor(line.from + list.indent.length),
    });
    return true;
  }

  // 无块级格式则清行内格式；即便没有格式也吞掉 Backspace，避免并入标题
  clearInlineFormatsOnRange(view, line.from, line.to, line.text);
  return true;
}

function insertNewlinePreservingInline(view: EditorView, inheritHeading = false) {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;

  const line = state.doc.lineAt(sel.head);
  const rel = sel.head - line.from;
  const after = line.text.slice(rel);
  let insertFrom = sel.head;

  if (after.trim() && INLINE_CLOSERS_ONLY_RE.test(after)) {
    insertFrom = line.to;
  }

  const heading = ATX_HEADING_PREFIX_RE.exec(line.text);
  const prefix =
    inheritHeading && heading && insertFrom < line.to ? (heading[1] ?? "") : "";
  const insert = `\n${prefix}`;
  view.dispatch({
    changes: { from: insertFrom, to: insertFrom, insert },
    selection: EditorSelection.cursor(insertFrom + insert.length),
  });
  return true;
}

function continueOrExitList(view: EditorView) {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  const info = parseListLine(line.text);
  if (!info) return false;

  if (!info.content.trim()) {
    const insert = info.indent;
    view.dispatch({
      changes: { from: line.from, to: line.to, insert },
      selection: EditorSelection.cursor(line.from + insert.length),
    });
    return true;
  }

  const insert = `\n${nextListPrefix(info)}`;
  view.dispatch({
    changes: { from: sel.head, to: sel.head, insert },
    selection: EditorSelection.cursor(sel.head + insert.length),
  });
  return true;
}

function clearEmptyListMarker(view: EditorView) {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  const emptyMarker = /^(\s*)(?:(?:[-*+])(?:\s+\[[ xX]\])?|\d+[.)])\s*$/.exec(
    line.text,
  );
  if (emptyMarker) {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: "" },
      selection: EditorSelection.cursor(line.from),
    });
    return true;
  }
  const info = parseListLine(line.text);
  if (!info || info.content.trim()) return false;
  const markerTo = line.from + info.prefixLength;
  if (sel.head < line.from || sel.head > markerTo) return false;
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: "" },
    selection: EditorSelection.cursor(line.from),
  });
  return true;
}

function isFenceCloseFor(text: string, openFence: string) {
  const trimmed = text.trim();
  if (trimmed.length < openFence.length) return false;
  const ch = openFence[0] ?? "`";
  for (let i = 0; i < trimmed.length; i += 1) {
    if (trimmed[i] !== ch) return false;
  }
  return true;
}

function findFenceBlockAtLine(view: EditorView, lineNumber: number) {
  const { doc } = view.state;
  let openLine: FenceBlock["openLine"] | null = null;
  let openFence = "";

  for (let number = 1; number <= doc.lines; number += 1) {
    const line = doc.line(number);
    if (!openLine) {
      const open = FENCE_OPEN_LINE_RE.exec(line.text);
      if (!open) continue;
      openLine = line;
      openFence = open[1] ?? "```";
      continue;
    }

    if (!isFenceCloseFor(line.text, openFence)) continue;
    if (lineNumber >= openLine.number && lineNumber <= line.number) {
      return { openLine, closeLine: line };
    }
    openLine = null;
    openFence = "";
  }

  return null;
}

function clearEmptyFenceBlock(view: EditorView) {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;

  const line = state.doc.lineAt(sel.head);
  const block = findFenceBlockAtLine(view, line.number);
  if (!block) return false;

  for (
    let number = block.openLine.number + 1;
    number < block.closeLine.number;
    number += 1
  ) {
    if (state.doc.line(number).text.trim()) return false;
  }

  view.dispatch({
    changes: { from: block.openLine.from, to: block.closeLine.to, insert: "" },
    selection: EditorSelection.cursor(block.openLine.from),
  });
  return true;
}

function protectFenceBoundaryBackspace(view: EditorView) {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  if (sel.head !== line.from || line.number <= 1) return false;
  const prev = state.doc.line(line.number - 1);
  if (!FENCE_CLOSE_LINE_RE.test(prev.text)) return false;
  return true;
}

function protectFenceBoundaryDelete(view: EditorView) {
  const { state } = view;
  const sel = state.selection.main;
  if (!sel.empty) return false;
  const line = state.doc.lineAt(sel.head);
  if (
    sel.head !== line.to ||
    line.number >= state.doc.lines ||
    !FENCE_CLOSE_LINE_RE.test(line.text)
  ) {
    return false;
  }
  const next = state.doc.line(line.number + 1);
  if (!next.text.trim()) return false;
  return true;
}

function indentSelectionWithTwoSpaces(view: EditorView) {
  const { state } = view;
  const sel = state.selection.main;
  if (sel.empty) {
    view.dispatch({
      changes: { from: sel.head, insert: TAB_INSERT },
      selection: EditorSelection.cursor(sel.head + TAB_INSERT.length),
    });
    return true;
  }

  const firstLine = state.doc.lineAt(sel.from);
  const lastLine = state.doc.lineAt(Math.max(sel.from, sel.to - 1));
  const changes = [];
  for (let number = firstLine.number; number <= lastLine.number; number += 1) {
    changes.push({ from: state.doc.line(number).from, insert: TAB_INSERT });
  }
  view.dispatch({ changes });
  return true;
}

function unindentSelectionByTwoSpaces(view: EditorView) {
  const { state } = view;
  const sel = state.selection.main;
  const firstLine = state.doc.lineAt(sel.from);
  const lastLine = state.doc.lineAt(Math.max(sel.from, sel.to - 1));
  const changes = [];

  for (let number = firstLine.number; number <= lastLine.number; number += 1) {
    const line = state.doc.line(number);
    if (line.text.startsWith(TAB_INSERT)) {
      changes.push({ from: line.from, to: line.from + TAB_INSERT.length, insert: "" });
    } else if (line.text.startsWith("\t") || line.text.startsWith(" ")) {
      changes.push({ from: line.from, to: line.from + 1, insert: "" });
    }
  }

  if (!changes.length) return true;
  view.dispatch({ changes });
  return true;
}

export const markdownEditingKeymap: readonly KeyBinding[] = [
  {
    key: "Tab",
    run: indentSelectionWithTwoSpaces,
  },
  {
    key: "Shift-Tab",
    run: unindentSelectionByTwoSpaces,
  },
  {
    key: "Shift-Enter",
    run: (view) => insertNewlinePreservingInline(view, false),
  },
  {
    key: "Enter",
    run: (view) =>
      continueOrExitList(view) ||
      insertNewlinePreservingInline(view, true),
  },
  {
    key: "Backspace",
    run: (view) =>
      protectAlignmentBoundary(view, true) ||
      clearEmptyFenceBlock(view) ||
      protectFenceBoundaryBackspace(view) ||
      clearEmptyListMarker(view) ||
      clearFormatAtHeadingContentStart(view) ||
      clearFormatOrBlockJoinIntoTitle(view),
  },
  {
    key: "Delete",
    run: (view) => protectAlignmentBoundary(view, false) || clearEmptyFenceBlock(view) || protectFenceBoundaryDelete(view),
  },
];
