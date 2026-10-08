import { t } from "@/lib/i18n";
import { fileUrlToPath } from "../platform";
import { EditorSelection, type EditorState, type TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import * as api from "@/lib/api";

import { alignmentBlocks, lineAlignment, type TextAlign } from "./alignment";
export type { TextAlign } from "./alignment";

export type FormatMarks = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  highlight?: true | string;
  color?: string | null;
  align?: TextAlign;
};

export type FormatCommand =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "underline" }
  | { type: "strike" }
  | { type: "highlight"; color?: string }
  | { type: "color"; color: string }
  | { type: "align"; align: TextAlign }
  | { type: "todo" }
  | { type: "ul" }
  | { type: "ol" }
  | { type: "clear" }
  | { type: "paint"; marks: FormatMarks }
  | {
      type: "insert";
      kind:
        | "link"
        | "image"
        | "image-url"
        | "image-local"
        | "callout"
        | "code"
        | "table"
        | "hr"
        | "quote"
        | "math";
    };

function selectedText(state: EditorState) {
  const { from, to } = state.selection.main;
  return { from, to, text: state.doc.sliceString(from, to) };
}

function inlineFormatTarget(state: EditorState) {
  const { from, to } = state.selection.main;
  if (from === to) {
    const line = state.doc.lineAt(from);
    const match = inlineBlockPrefix(line.text);
    if (match && from < line.from + match[1]!.length) {
      const pos = line.from + match[1]!.length;
      return { from: pos, to: pos, text: "" };
    }
    return { from, to, text: "" };
  }

  const startLine = state.doc.lineAt(from);
  const endLine = state.doc.lineAt(Math.max(from, to - 1));
  if (startLine.number !== endLine.number) {
    return { from, to, text: state.doc.sliceString(from, to) };
  }
  const match = inlineBlockPrefix(startLine.text);
  if (!match) return { from, to, text: state.doc.sliceString(from, to) };

  const contentFrom = startLine.from + match[1]!.length;
  const nextFrom = Math.max(from, contentFrom);
  const nextTo = Math.max(nextFrom, to);
  return {
    from: nextFrom,
    to: nextTo,
    text: state.doc.sliceString(nextFrom, nextTo),
  };
}

function inlineBlockPrefix(text: string) {
  return /^(\s*(?:(?:>\s*)+(?:\[![^\]\n]+\][ \t]*)?)?(?:#{1,6}\s+|(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s*)?)?)/.exec(text);
}

function blockText(text: string) {
  // Unwrap stacked block prefixes left by older insertion commands as well.
  for (;;) {
    text = text.replace(/^([ \t]*)\\>(?=[ \t]*\[!note(?:[:\]]))/i, "$1>");
    const prefix = inlineBlockPrefix(text)![1];
    if (!prefix) return text;
    text = text.slice(prefix.length);
  }
}

function isPlainQuote(state: EditorState, pos: number) {
  for (let n = state.doc.lineAt(pos).number; n > 0; n--) {
    const text = state.doc.line(n).text;
    if (!/^\s*>/.test(text)) return n !== state.doc.lineAt(pos).number;
    if (/^\s*>\s*\[!/.test(text)) return false;
  }
  return true;
}

function splitEdgeWhitespace(text: string) {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  if (!match) return { leading: "", body: text, trailing: "" };
  return {
    leading: match[1] ?? "",
    body: match[2] ?? "",
    trailing: match[3] ?? "",
  };
}

function escapedAt(raw: string, index: number) {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && raw[i] === "\\"; i -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function findDelimiterRange(
  raw: string,
  lineFrom: number,
  delimiter: string,
  from: number,
  to: number,
) {
  let index = 0;
  while (index < raw.length) {
    const open = raw.indexOf(delimiter, index);
    if (open < 0) return null;
    if (escapedAt(raw, open)) {
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
    let close = raw.indexOf(delimiter, open + delimiter.length);
    while (close >= 0 && (escapedAt(raw, close) || (delimiter.length === 1 && (raw[close - 1] === delimiter || raw[close + 1] === delimiter)))) {
      close = raw.indexOf(delimiter, close + delimiter.length);
    }
    if (close < 0) return null;
    const innerFrom = lineFrom + open + delimiter.length;
    const innerTo = lineFrom + close;
    if (from === to) {
      if (from >= innerFrom && from <= innerTo) {
        return {
          openFrom: lineFrom + open,
          openTo: innerFrom,
          closeFrom: innerTo,
          closeTo: lineFrom + close + delimiter.length,
        };
      }
    } else if (from >= innerFrom && to <= innerTo) {
      return {
        openFrom: lineFrom + open,
        openTo: innerFrom,
        closeFrom: innerTo,
        closeTo: lineFrom + close + delimiter.length,
      };
    }
    index = close + delimiter.length;
  }
  return null;
}

function delimiterRangeCovers(
  raw: string,
  lineFrom: number,
  delimiter: string,
  from: number,
  to: number,
) {
  return Boolean(findDelimiterRange(raw, lineFrom, delimiter, from, to));
}

function findCombinedEmphasisRange(
  raw: string,
  lineFrom: number,
  from: number,
  to: number,
) {
  return (
    findDelimiterRange(raw, lineFrom, "***", from, to) ??
    findDelimiterRange(raw, lineFrom, "___", from, to)
  );
}

function combinedEmphasisBoundary(
  range: FormatBoundary,
  kind: "bold" | "italic",
): FormatBoundary {
  if (kind === "italic") {
    return {
      openFrom: range.openFrom,
      openTo: range.openFrom + 1,
      closeFrom: range.closeTo - 1,
      closeTo: range.closeTo,
    };
  }
  return {
    openFrom: range.openFrom + 1,
    openTo: range.openTo,
    closeFrom: range.closeFrom,
    closeTo: range.closeTo - 1,
  };
}

function htmlRangeCovers(
  raw: string,
  lineFrom: number,
  re: RegExp,
  closeLength: number,
  from: number,
  to: number,
) {
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const openLength = match[0].indexOf(">") + 1;
    if (openLength <= 0) continue;
    const innerFrom = lineFrom + match.index + openLength;
    const innerTo = lineFrom + match.index + match[0].length - closeLength;
    if (from === to) {
      if (from > innerFrom && from < innerTo) return true;
    } else if (from >= innerFrom && to <= innerTo) {
      return true;
    }
  }
  return false;
}

function wrapToggle(
  view: EditorView,
  open: string,
  close: string,
  emptyPlaceholder = "",
  allowUnwrap = true,
) {
  const { from, to, text } = inlineFormatTarget(view.state);
  if (
    allowUnwrap &&
    from >= open.length &&
    to + close.length <= view.state.doc.length
  ) {
    const before = view.state.doc.sliceString(from - open.length, from);
    const after = view.state.doc.sliceString(to, to + close.length);
    if (before === open && after === close) {
      view.dispatch({
        changes: [
          { from: to, to: to + close.length, insert: "" },
          { from: from - open.length, to: from, insert: "" },
        ],
        selection: EditorSelection.range(
          from - open.length,
          to - open.length,
        ),
      });
      return;
    }
  }
  const { leading, body, trailing } = text
    ? splitEdgeWhitespace(text)
    : { leading: "", body: "", trailing: "" };
  const bodyFrom = from + leading.length;
  if (
    allowUnwrap &&
    body.startsWith(open) &&
    body.endsWith(close) &&
    body.length >= open.length + close.length
  ) {
    const inner = body.slice(open.length, body.length - close.length);
    const insert = `${leading}${inner}${trailing}`;
    view.dispatch({
      changes: { from, to, insert },
      selection: EditorSelection.range(bodyFrom, bodyFrom + inner.length),
    });
    return;
  }
  const insert = body
    ? `${leading}${open}${body}${close}${trailing}`
    : `${open}${emptyPlaceholder}${close}`;
  const cursor = body
    ? bodyFrom + open.length + body.length + close.length
    : from + open.length + emptyPlaceholder.length;
  const anchor = body ? bodyFrom + open.length : from + open.length;
  const head = body ? bodyFrom + open.length + body.length : cursor;
  view.dispatch({
    changes: { from, to, insert },
    selection: body
      ? EditorSelection.range(anchor, head)
      : EditorSelection.cursor(cursor),
  });
}

function findCoveringMarkdownNode(
  state: EditorState,
  nodeName: "StrongEmphasis" | "Emphasis" | "Strikethrough",
  from: number,
  to: number,
) {
  const tree = syntaxTree(state);
  const probes = from === to ? [from] : [from, Math.max(from, to - 1)];
  let best: ReturnType<typeof tree.resolveInner> | null = null;

  for (const probe of probes) {
    for (const bias of [-1, 1] as const) {
      let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(
        probe,
        bias,
      );
      while (node) {
        if (
          node.name === nodeName &&
          node.from <= from &&
          node.to >= to &&
          (!best || node.to - node.from < best.to - best.from)
        ) {
          best = node;
        }
        node = node.parent;
      }
    }
  }
  return best;
}

type FormatBoundary = {
  openFrom: number;
  openTo: number;
  closeFrom: number;
  closeTo: number;
};

function removeFormatBoundaryOnly(
  view: EditorView,
  boundary: FormatBoundary,
  selectionFrom: number,
  selectionTo: number,
) {
  const changes = [
    { from: boundary.openFrom, to: boundary.openTo, insert: "" },
    { from: boundary.closeFrom, to: boundary.closeTo, insert: "" },
  ];
  const changeSet = view.state.changes(changes);
  const mappedFrom = changeSet.mapPos(selectionFrom, 1);
  const mappedTo = changeSet.mapPos(selectionTo, -1);
  view.dispatch({
    changes: changeSet,
    selection:
      selectionFrom === selectionTo
        ? EditorSelection.cursor(mappedFrom)
        : EditorSelection.range(mappedFrom, mappedTo),
  });
}

function selectionCoversVisibleBoundaryContent(
  state: EditorState,
  boundary: FormatBoundary,
  selectionFrom: number,
  selectionTo: number,
) {
  if (selectionFrom === selectionTo) return false;
  const content = state.doc.sliceString(boundary.openTo, boundary.closeFrom);
  const selected = state.doc.sliceString(
    Math.max(boundary.openTo, selectionFrom),
    Math.min(boundary.closeFrom, selectionTo),
  );
  return unwrapInlineFormats(content) === unwrapInlineFormats(selected);
}

function removeFormatInSelection(
  view: EditorView,
  boundary: FormatBoundary,
  selectionFrom: number,
  selectionTo: number,
) {
  const contentFrom = boundary.openTo;
  const contentTo = boundary.closeFrom;
  const from = Math.max(contentFrom, selectionFrom);
  const to = Math.min(contentTo, selectionTo);
  const open = view.state.doc.sliceString(boundary.openFrom, boundary.openTo);
  const close = view.state.doc.sliceString(boundary.closeFrom, boundary.closeTo);
  const changes: Array<{ from: number; to: number; insert: string }> = [];

  // 光标没有选区时维持常规行为：取消当前完整格式节点。
  if (selectionFrom === selectionTo) {
    removeFormatBoundaryOnly(view, boundary, selectionFrom, selectionTo);
    return;
  }
  if (
    selectionCoversVisibleBoundaryContent(
      view.state,
      boundary,
      selectionFrom,
      selectionTo,
    )
  ) {
    removeFormatBoundaryOnly(view, boundary, selectionFrom, selectionTo);
    return;
  }

  if (from <= contentFrom) {
    changes.push({ from: boundary.openFrom, to: boundary.openTo, insert: "" });
  } else {
    changes.push({ from, to: from, insert: close });
  }
  if (to >= contentTo) {
    changes.push({ from: boundary.closeFrom, to: boundary.closeTo, insert: "" });
  } else {
    changes.push({ from: to, to, insert: open });
  }

  changes.sort((a, b) => a.from - b.from || a.to - b.to);
  const changeSet = view.state.changes(changes);
  const mappedFrom = changeSet.mapPos(from, 1);
  const mappedTo = changeSet.mapPos(to, -1);
  view.dispatch({
    changes: changeSet,
    selection:
      selectionFrom === selectionTo
        ? EditorSelection.cursor(mappedFrom)
        : EditorSelection.range(mappedFrom, mappedTo),
  });
}

function collectMarkdownBoundaries(
  state: EditorState,
  nodeName: "StrongEmphasis" | "Emphasis" | "Strikethrough",
) {
  const boundaries: FormatBoundary[] = [];
  const markerName =
    nodeName === "Strikethrough" ? "StrikethroughMark" : "EmphasisMark";
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== nodeName) return;
      const first = node.node.firstChild;
      const last = node.node.lastChild;
      if (
        first &&
        last &&
        first !== last &&
        first.name === markerName &&
        last.name === markerName
      ) {
        boundaries.push({
          openFrom: first.from,
          openTo: first.to,
          closeFrom: last.from,
          closeTo: last.to,
        });
      }
    },
  });
  return boundaries;
}

function applyFormatAcrossSelection(
  view: EditorView,
  boundaries: FormatBoundary[],
  open: string,
  close: string,
) {
  const { from, to, text } = inlineFormatTarget(view.state);
  if (!text) {
    wrapToggle(view, open, close, "", false);
    return;
  }

  let expandedFrom = from;
  let expandedTo = to;
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const boundary of boundaries) {
      const overlaps =
        boundary.closeFrom >= expandedFrom && boundary.openTo <= expandedTo;
      if (!overlaps) continue;
      const nextFrom = Math.min(expandedFrom, boundary.openFrom);
      const nextTo = Math.max(expandedTo, boundary.closeTo);
      if (nextFrom !== expandedFrom || nextTo !== expandedTo) {
        expandedFrom = nextFrom;
        expandedTo = nextTo;
        expanded = true;
      }
    }
  }

  const included = boundaries.filter(
    (boundary) =>
      boundary.openFrom >= expandedFrom && boundary.closeTo <= expandedTo,
  );
  let body = view.state.doc.sliceString(expandedFrom, expandedTo);
  const markerRanges = included
    .flatMap((boundary) => [
      { from: boundary.openFrom - expandedFrom, to: boundary.openTo - expandedFrom },
      { from: boundary.closeFrom - expandedFrom, to: boundary.closeTo - expandedFrom },
    ])
    .filter(
      (range, index, ranges) =>
        ranges.findIndex(
          (candidate) =>
            candidate.from === range.from && candidate.to === range.to,
        ) === index,
    );
  const ascendingRanges = [...markerRanges].sort(
    (a, b) => a.from - b.from || a.to - b.to,
  );
  const mapIntoStrippedBody = (position: number) => {
    let offset = position - expandedFrom;
    for (const range of ascendingRanges) {
      const absoluteFrom = expandedFrom + range.from;
      const absoluteTo = expandedFrom + range.to;
      if (position >= absoluteTo) {
        offset -= range.to - range.from;
      } else if (position > absoluteFrom) {
        offset -= position - absoluteFrom;
      }
    }
    return offset;
  };
  const mappedSelectionFrom = mapIntoStrippedBody(from);
  const mappedSelectionTo = mapIntoStrippedBody(to);
  for (const range of [...ascendingRanges].reverse()) {
    body = body.slice(0, range.from) + body.slice(range.to);
  }

  const whitespace = splitEdgeWhitespace(body);
  if (!whitespace.body) return;
  const insert = `${whitespace.leading}${open}${whitespace.body}${close}${whitespace.trailing}`;
  const visibleFrom = whitespace.leading.length;
  const visibleTo = visibleFrom + whitespace.body.length;
  const selectionFrom = Math.min(
    visibleTo,
    Math.max(visibleFrom, mappedSelectionFrom),
  );
  const selectionTo = Math.min(
    visibleTo,
    Math.max(selectionFrom, mappedSelectionTo),
  );
  const bodyFrom = expandedFrom + whitespace.leading.length + open.length;
  view.dispatch({
    changes: { from: expandedFrom, to: expandedTo, insert },
    selection: EditorSelection.range(
      bodyFrom + selectionFrom - visibleFrom,
      bodyFrom + selectionTo - visibleFrom,
    ),
  });
}

function applyMarkdownFormat(
  view: EditorView,
  nodeName: "StrongEmphasis" | "Emphasis" | "Strikethrough",
  open: string,
  close: string,
) {
  applyFormatAcrossSelection(
    view,
    collectMarkdownBoundaries(view.state, nodeName),
    open,
    close,
  );
}

function collectHtmlBoundaries(state: EditorState, tag: string) {
  const boundaries: FormatBoundary[] = [];
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<\\/?${escapedTag}\\b[^>]*>`, "gi");
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const stack: Array<{ from: number; to: number }> = [];
    let match: RegExpExecArray | null;
    while ((match = re.exec(line.text))) {
      const tokenFrom = line.from + match.index;
      const tokenTo = tokenFrom + match[0].length;
      if (!/^<\//.test(match[0])) {
        if (!/\/>$/.test(match[0])) stack.push({ from: tokenFrom, to: tokenTo });
        continue;
      }
      const open = stack.pop();
      if (!open) continue;
      boundaries.push({
        openFrom: open.from,
        openTo: open.to,
        closeFrom: tokenFrom,
        closeTo: tokenTo,
      });
    }
  }
  return boundaries;
}

function collectDelimiterBoundaries(state: EditorState, delimiter: string) {
  const boundaries: FormatBoundary[] = [];
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    let index = 0;
    while (index < line.text.length) {
      const open = line.text.indexOf(delimiter, index);
      if (open < 0) break;
      if (escapedAt(line.text, open)) {
        index = open + delimiter.length;
        continue;
      }
      let close = line.text.indexOf(delimiter, open + delimiter.length);
      while (close >= 0 && escapedAt(line.text, close)) {
        close = line.text.indexOf(delimiter, close + delimiter.length);
      }
      if (close < 0) break;
      boundaries.push({
        openFrom: line.from + open,
        openTo: line.from + open + delimiter.length,
        closeFrom: line.from + close,
        closeTo: line.from + close + delimiter.length,
      });
      index = close + delimiter.length;
    }
  }
  return boundaries;
}

function boundaryCoversSelection(
  boundary: FormatBoundary,
  from: number,
  to: number,
) {
  return from >= boundary.openTo && to <= boundary.closeFrom;
}

function unwrapMarkdownFormat(
  view: EditorView,
  nodeName: "StrongEmphasis" | "Emphasis" | "Strikethrough",
) {
  const { from, to } = inlineFormatTarget(view.state);
  const node =
    nodeName === "Strikethrough"
      ? null
      : findCoveringMarkdownNode(view.state, nodeName, from, to);
  const first = node?.firstChild;
  const last = node?.lastChild;
  if (node && first && last && first !== last) {
    const markerName =
      nodeName === "Strikethrough" ? "StrikethroughMark" : "EmphasisMark";
    if (first.name === markerName && last.name === markerName) {
      removeFormatInSelection(
        view,
        {
          openFrom: first.from,
          openTo: first.to,
          closeFrom: last.from,
          closeTo: last.to,
        },
        from,
        to,
      );
      return true;
    }
  }

  const delimiters =
    nodeName === "StrongEmphasis"
      ? ["**", "__"]
      : nodeName === "Emphasis"
        ? ["*", "_"]
        : ["~~"];
  const startLine = view.state.doc.lineAt(from);
  const endLine = view.state.doc.lineAt(to === from ? to : Math.max(from, to - 1));
  if (startLine.number !== endLine.number) return false;
  if (nodeName === "StrongEmphasis" || nodeName === "Emphasis") {
    const combined = findCombinedEmphasisRange(
      startLine.text,
      startLine.from,
      from,
      to,
    );
    if (combined) {
      removeFormatInSelection(
        view,
        combinedEmphasisBoundary(
          combined,
          nodeName === "StrongEmphasis" ? "bold" : "italic",
        ),
        from,
        to,
      );
      return true;
    }
  }
  for (const delimiter of delimiters) {
    const range = findDelimiterRange(
      startLine.text,
      startLine.from,
      delimiter,
      from,
      to,
    );
    if (!range) continue;
    removeFormatInSelection(view, range, from, to);
    return true;
  }
  return false;
}

function unwrapHtmlFormat(view: EditorView, tag: string) {
  const { from, to } = inlineFormatTarget(view.state);
  const boundary = collectHtmlBoundaries(view.state, tag)
    .filter((candidate) => boundaryCoversSelection(candidate, from, to))
    .sort(
      (a, b) =>
        a.closeTo - a.openFrom - (b.closeTo - b.openFrom),
    )[0];
  if (!boundary) return false;
  removeFormatInSelection(view, boundary, from, to);
  return true;
}

export function unwrapInlineFormats(text: string): string {
  let s = text;
  const patterns: RegExp[] = [
    /\*\*([^*]+)\*\*/g,
    /\*([^*]+)\*/g,
    /~~([^~]+)~~/g,
    /__([^_]+)__/g,
    /_([^_]+)_/g,
    /==([^=]+)==/g,
    /<u>([\s\S]*?)<\/u>/gi,
    /<mark(?:\s+style=["'][^"']*["'])?>([\s\S]*?)<\/mark>/gi,
    /<span\s+style=["'][^"']*["']>([\s\S]*?)<\/span>/gi,
    /<div\s+align=["'][^"']*["']>\s*([\s\S]*?)\s*<\/div>/gi,
    /<\/?p\s+align=["'][^"']*["']>/gi,
  ];
  for (let pass = 0; pass < 12; pass += 1) {
    const before = s;
    for (const re of patterns) s = s.replace(re, "$1");
    if (s === before) break;
  }
  return s;
}

function lineRange(state: EditorState) {
  const { from, to } = state.selection.main;
  const start = state.doc.lineAt(from).number;
  const end = state.doc.lineAt(to === from ? to : Math.max(from, to - 1)).number;
  return { start, end };
}

function mapListLines(
  view: EditorView,
  mapper: (line: string, index: number) => string,
) {
  const { start, end } = lineRange(view.state);
  const changes: { from: number; to: number; insert: string }[] = [];
  let i = 0;
  for (let n = start; n <= end; n++) {
    const line = view.state.doc.line(n);
    const next = mapper(line.text, i++);
    if (next !== line.text) {
      changes.push({ from: line.from, to: line.to, insert: next });
    }
  }
  if (!changes.length) return;
  // List commands only change prefixes; keep selection endpoints in the text,
  // including when an empty paragraph becomes a checkbox widget.
  const mapPosition = (position: number) => {
    let delta = 0;
    for (const change of changes) {
      if (position < change.from) break;
      const difference = change.insert.length - (change.to - change.from);
      if (position <= change.to) {
        const prefix = /^\s*(?:(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s)?)?/.exec(change.insert)![0];
        return change.from + delta + Math.max(prefix.length, position - change.from + difference);
      }
      delta += difference;
    }
    return position + delta;
  };
  const selection = EditorSelection.create(
    view.state.selection.ranges.map((range) =>
      EditorSelection.range(mapPosition(range.anchor), mapPosition(range.head)),
    ),
    view.state.selection.mainIndex,
  );
  view.dispatch({ changes, selection });
}

function toggleListPrefix(view: EditorView, kind: "ul" | "ol" | "todo") {
  mapListLines(view, (line, index) => {
    const trimmed = line.replace(/^\s+/, "");
    const indent = line.slice(0, line.length - trimmed.length);
    if (kind === "todo") {
      if (/^(?:(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?)?\\?>/.test(trimmed)) {
        return `${indent}- [ ] ${blockText(trimmed)}`;
      }
      if (/^[-*+]\s+\[[ xX]\]\s/.test(trimmed)) {
        return indent + trimmed.replace(/^[-*+]\s+\[[ xX]\]\s/, "");
      }
      if (/^[-*+]\s+/.test(trimmed)) {
        return indent + trimmed.replace(/^[-*+]\s+/, "- [ ] ");
      }
      if (/^\d+\.\s+/.test(trimmed)) {
        return indent + trimmed.replace(/^\d+\.\s+/, "- [ ] ");
      }
      return `${indent}- [ ] ${trimmed}`;
    }
    if (kind === "ul") {
      if (/^[-*+]\s+\[[ xX]\]\s/.test(trimmed)) {
        return indent + trimmed.replace(/^[-*+]\s+\[[ xX]\]\s/, "- ");
      }
      if (/^[-*+]\s+/.test(trimmed)) {
        return indent + trimmed.replace(/^[-*+]\s+/, "");
      }
      if (/^\d+\.\s+/.test(trimmed)) {
        return indent + trimmed.replace(/^\d+\.\s+/, "- ");
      }
      return `${indent}- ${trimmed}`;
    }
    // ol
    if (/^\d+\.\s+/.test(trimmed)) {
      return indent + trimmed.replace(/^\d+\.\s+/, "");
    }
    if (/^[-*+]\s+\[[ xX]\]\s/.test(trimmed)) {
      return indent + trimmed.replace(/^[-*+]\s+\[[ xX]\]\s/, `${index + 1}. `);
    }
    if (/^[-*+]\s+/.test(trimmed)) {
      return indent + trimmed.replace(/^[-*+]\s+/, `${index + 1}. `);
    }
    return `${indent}${index + 1}. ${trimmed}`;
  });
}

function applyAlign(view: EditorView, align: TextAlign) {
  const { state } = view;
  let { start, end } = lineRange(state);
  // Keep the note's identity heading as the first Markdown line.
  if (start === 1 && /^#\s+/.test(state.doc.line(1).text)) start++;
  if (start > end) return;
  // Keep structured Markdown blocks intact, including nested list indentation.
  syntaxTree(state).iterate({ enter(node) {
    if (!["FencedCode", "CodeBlock", "Table", "BulletList", "OrderedList", "Blockquote"].includes(node.name)) return;
    const first = state.doc.lineAt(node.from).number;
    const last = state.doc.lineAt(node.to).number;
    if (first <= end && last >= start) { start = Math.min(start, first); end = Math.max(end, last); }
    return false;
  }});
  const blocks = alignmentBlocks(state);
  let first = start, last = end;
  for (let changed = true; changed;) {
    changed = false;
    for (const block of blocks) if (block.openLine <= last && block.closeLine >= first) {
      const a = Math.min(first, block.openLine), b = Math.max(last, block.closeLine);
      if (a !== first || b !== last) { first = a; last = b; changed = true; }
    }
  }
  const boundaries = new Set(blocks.flatMap(block => [block.openLine, block.closeLine]));
  const from = state.doc.line(first).from, to = state.doc.line(last).to;
  const rows: Array<{from: number; to: number; text: string; align: TextAlign; output: number}> = [];
  for (let number = first; number <= last; number++) {
    if (boundaries.has(number)) continue;
    const line = state.doc.line(number);
    rows.push({from: line.from, to: line.to, text: line.text,
      align: number >= start && number <= end ? align : lineAlignment(blocks, number), output: 0});
  }
  if (!rows.length) return;
  let insert = '', current: TextAlign = 'left';
  for (const row of rows) {
    if (row.align !== current) {
      if (current !== 'left') insert += '</div>\n';
      if (row.align !== 'left') insert += `<div align="${row.align}" style="text-align:${row.align}">\n`;
      current = row.align;
    }
    row.output = from + insert.length;
    insert += row.text + '\n';
  }
  if (current !== 'left') insert += '</div>\n';
  insert = insert.slice(0, -1);
  if (insert === state.doc.sliceString(from, to)) return;
  const mapPosition = (position: number) => {
    if (position < from) return position;
    if (position > to) return position + insert.length - (to - from);
    const row = rows.find(row => position <= row.to) ?? rows[rows.length - 1]!;
    return row.output + Math.max(0, Math.min(row.text.length, position - row.from));
  };
  view.dispatch({changes: {from, to, insert}, selection: EditorSelection.create(
    state.selection.ranges.map(range => EditorSelection.range(mapPosition(range.anchor), mapPosition(range.head))),
    state.selection.mainIndex,
  )});
}

function applyColor(view: EditorView, color: string) {
  const open = `<span style="color:${color}">`;
  const close = `</span>`;
  const { from, to } = inlineFormatTarget(view.state);
  const boundaries = collectHtmlBoundaries(view.state, "span").filter(
    (boundary) => {
      const opening = view.state.doc.sliceString(
        boundary.openFrom,
        boundary.openTo,
      );
      return (
        /\bstyle\s*=\s*["'][^"']*\bcolor\s*:/i.test(opening) &&
        selectionCoversVisibleBoundaryContent(view.state, boundary, from, to)
      );
    },
  );
  applyFormatAcrossSelection(view, boundaries, open, close);
}

function applyHighlight(view: EditorView, color?: string) {
  const { from, to } = inlineFormatTarget(view.state);
  const boundaries = [
    ...collectHtmlBoundaries(view.state, "mark"),
    ...collectDelimiterBoundaries(view.state, "=="),
  ];
  if (!color) {
    const existing = boundaries
      .filter((boundary) => boundaryCoversSelection(boundary, from, to))
      .sort(
        (a, b) =>
          a.closeTo - a.openFrom - (b.closeTo - b.openFrom),
      )[0];
    if (existing) {
      removeFormatInSelection(view, existing, from, to);
      return;
    }
  }
  const replaceable = boundaries.filter((boundary) =>
    selectionCoversVisibleBoundaryContent(view.state, boundary, from, to),
  );
  applyFormatAcrossSelection(
    view,
    replaceable,
    color ? `<mark style="background-color:${color}">` : "==",
    color ? "</mark>" : "==",
  );
}

function applyPaint(view: EditorView, marks: FormatMarks) {
  const { from, to, text } = inlineFormatTarget(view.state);
  const { leading, body, trailing } = splitEdgeWhitespace(text);
  if (!body) return;
  const bodyFrom = from + leading.length;
  let next = unwrapInlineFormats(body);
  if (marks.bold) next = `**${next}**`;
  if (marks.italic) next = `*${next}*`;
  if (marks.strike) next = `~~${next}~~`;
  if (marks.underline) next = `<u>${next}</u>`;
  if (marks.highlight) {
    next =
      marks.highlight === true
        ? `<mark>${next}</mark>`
        : `<mark style="background-color:${marks.highlight}">${next}</mark>`;
  }
  if (marks.color) next = `<span style="color:${marks.color}">${next}</span>`;
  const insert = `${leading}${next}${trailing}`;
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.range(bodyFrom, bodyFrom + next.length),
  });
}

function markdownImageDestination(src: string) {
  const trimmed = src.trim();
  if (!/[\s()<>]/.test(trimmed)) return trimmed;
  return `<${trimmed.replace(/</g, "%3C").replace(/>/g, "%3E")}>`;
}

async function resolveEmbeddedImageSrc(
  notePath: string | null | undefined,
  src: string,
) {
  if (!notePath || /^(blob:|asset:|tauri:)/i.test(src)) return src;
  await api.libraryRootPath();
  const source = fileUrlToPath(src);
  return api.storeNoteAsset(notePath, source);
}

export async function insertImageSnippet(
  view: EditorView,
  src: string,
  alt = t("图片"),
  notePath?: string | null,
) {
  const { from, to, text } = selectedText(view.state);
  const label = (text || alt || t("图片")).replace(/[\[\]\r\n|]/g, " ").trim() || t("图片");
  const resolved = await resolveEmbeddedImageSrc(notePath, src);
  const prefix = from > view.state.doc.lineAt(from).from ? "\n" : "";
  const suffix = to < view.state.doc.lineAt(to).to ? "\n" : "";
  const image = `![${label}](${markdownImageDestination(resolved)})`;
  const insert = prefix + image + suffix;
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.range(from + prefix.length, from + prefix.length + image.length),
  });
}

function insertCalloutSnippet(view: EditorView, color = "#fff6d6") {
  const { start, end } = lineRange(view.state);
  const from = view.state.doc.line(start).from;
  const to = view.state.doc.line(end).to;
  const lines = view.state.doc.sliceString(from, to).split("\n").map(blockText);
  const body = lines.some((line) => line.trim()) ? lines.join("\n") : t("在这里输入内容");
  const safeColor = /^#[0-9a-f]{3,8}$/i.test(color) ? color : "#fff6d6";
  const insert = `> [!note:${safeColor}:lightbulb] ${body.replace(/\n/g, "\n> ")}`;
  const bodyStart = from + insert.indexOf("] ") + 2;
  view.focus();
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.range(bodyStart, from + insert.length),
  });
}

function insertSnippet(
  view: EditorView,
  kind:
    | "link"
    | "image"
    | "image-url"
    | "image-local"
    | "callout"
    | "code"
    | "table"
    | "hr"
    | "quote"
    | "math",
) {
  const { from, to, text } = selectedText(view.state);
  let insert = "";
  let cursor = 0;
  switch (kind) {
    case "link": {
      const label = text || t("链接文字");
      insert = `[${label}](https://)`;
      cursor = from + label.length + 3;
      break;
    }
    case "image":
    case "image-local":
    case "image-url":
      insert = `![${text || t("图片")}]()`;
      cursor = from + insert.length - 1;
      break;
    case "callout":
      insertCalloutSnippet(view);
      return;
    case "code":
      insert = text ? `\`\`\`\n${text}\n\`\`\`\n` : "```\n\n```\n";
      cursor = text ? from + insert.length : from + 4;
      break;
    case "table":
      insert = t("| 列1 | 列2 |\n| --- | --- |\n|  |  |");
      cursor = from + insert.indexOf("\n|  |") + 4;
      break;
    case "hr":
      insert = "\n---\n\n";
      cursor = from + insert.length;
      break;
    case "quote":
      insert = text
        ? text
            .split("\n")
            .map((l) => `> ${l}`)
            .join("\n")
        : "> ";
      cursor = from + insert.length;
      break;
    case "math":
      insert = text ? `$${text}$` : "$$";
      cursor = text ? from + insert.length : from + 1;
      break;
  }
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.cursor(cursor),
  });
}

export function detectFormatMarks(text: string): FormatMarks {
  const marks: FormatMarks = {};
  if (/\*\*[^*]+\*\*/.test(text) || /^__[\s\S]+__$/.test(text)) marks.bold = true;
  if (/(^|[^*])\*[^*]+\*([^*]|$)/.test(text) || /(^|[^_])_[^_]+_([^_]|$)/.test(text))
    marks.italic = true;
  if (/~~[^~]+~~/.test(text)) marks.strike = true;
  if (/<u>[\s\S]*?<\/u>/i.test(text)) marks.underline = true;
  const highlight =
    /<mark(?:\s+style=["'][^"']*background-color:\s*([^;"']+)[^"']*["'])?[^>]*>/i.exec(
      text,
    );
  if (highlight?.[1]) marks.highlight = highlight[1].trim();
  else if (/<mark>[\s\S]*?<\/mark>/i.test(text) || /==[^=]+==/.test(text))
    marks.highlight = true;
  const color = /style=["']color:\s*([^;"']+)/i.exec(text);
  if (color) marks.color = color[1]!.trim();
  return marks;
}

export function detectFormatMarksAtSelection(state: EditorState): FormatMarks {
  const marks = detectFormatMarks(
    state.doc.sliceString(state.selection.main.from, state.selection.main.to),
  );
  const { from, to } = inlineFormatTarget(state);
  const aligned = alignmentBlocks(state);
  const selectedLines = lineRange(state);
  const alignments = new Set<TextAlign>();
  const boundaries = new Set(aligned.flatMap(block => [block.openLine, block.closeLine]));
  for (let line = selectedLines.start; line <= selectedLines.end; line++) {
    if (!boundaries.has(line)) alignments.add(lineAlignment(aligned, line));
  }
  if (alignments.size === 1) marks.align = [...alignments][0];

  // 混合选区只有在整段都被同一格式覆盖时才显示为激活。
  if (from !== to) {
    delete marks.bold;
    delete marks.italic;
    delete marks.strike;
    delete marks.underline;
  }

  if (findCoveringMarkdownNode(state, "StrongEmphasis", from, to)) {
    marks.bold = true;
  }
  if (findCoveringMarkdownNode(state, "Emphasis", from, to)) {
    marks.italic = true;
  }
  const smallestCovering = (boundaries: FormatBoundary[]) =>
    boundaries
      .filter((boundary) => boundaryCoversSelection(boundary, from, to))
      .sort(
        (a, b) =>
          a.closeTo - a.openFrom - (b.closeTo - b.openFrom),
      )[0];

  if (smallestCovering(collectHtmlBoundaries(state, "u"))) {
    marks.underline = true;
  }
  const colorBoundary = smallestCovering(
    collectHtmlBoundaries(state, "span").filter((boundary) =>
      /\bstyle\s*=\s*["'][^"']*\bcolor\s*:/i.test(
        state.doc.sliceString(boundary.openFrom, boundary.openTo),
      ),
    ),
  );
  if (colorBoundary) {
    const opening = state.doc.sliceString(
      colorBoundary.openFrom,
      colorBoundary.openTo,
    );
    const color = /\bcolor\s*:\s*([^;"']+)/i.exec(opening)?.[1]?.trim();
    if (color) marks.color = color;
  }
  const markBoundary = smallestCovering(
    collectHtmlBoundaries(state, "mark"),
  );
  if (markBoundary) {
    const opening = state.doc.sliceString(
      markBoundary.openFrom,
      markBoundary.openTo,
    );
    marks.highlight =
      /\bbackground-color\s*:\s*([^;"']+)/i.exec(opening)?.[1]?.trim() ||
      true;
  } else if (
    smallestCovering(collectDelimiterBoundaries(state, "=="))
  ) {
    marks.highlight = true;
  }


  const startLine = state.doc.lineAt(from);
  const endLine = state.doc.lineAt(to === from ? to : Math.max(from, to - 1));
  for (let lineNo = startLine.number; lineNo <= endLine.number; lineNo += 1) {
    const line = state.doc.line(lineNo);
    const combined = findCombinedEmphasisRange(
      line.text,
      line.from,
      from,
      to,
    );
    if (combined) {
      marks.bold = true;
      marks.italic = true;
    }
    if (!marks.bold) {
      marks.bold =
        delimiterRangeCovers(line.text, line.from, "**", from, to) ||
        delimiterRangeCovers(line.text, line.from, "__", from, to);
    }
    if (!marks.italic) {
      marks.italic =
        delimiterRangeCovers(line.text, line.from, "*", from, to) ||
        delimiterRangeCovers(line.text, line.from, "_", from, to);
    }
    if (!marks.strike) {
      marks.strike = delimiterRangeCovers(line.text, line.from, "~~", from, to);
    }
    if (!marks.underline) {
      marks.underline = htmlRangeCovers(
        line.text,
        line.from,
        /<u\b[^>]*>.*?<\/u>/gi,
        "</u>".length,
        from,
        to,
      );
    }
    if (marks.bold && marks.italic && marks.strike && marks.underline) break;
  }
  return marks;
}

export { insertCalloutSnippet };

export function applyFormat(view: EditorView, cmd: FormatCommand) {
  view.focus();
  const original = view.state;
  const selection = original.selection.main;
  const first = original.doc.lineAt(selection.from).number;
  const last = original.doc.lineAt(Math.max(selection.from, selection.to - 1)).number;
  if (first !== last && ["bold", "italic", "underline", "strike", "color", "highlight"].includes(cmd.type)) {
    // Apply inline formatting to each line's content, never to quote/list prefixes.
    let current = original;
    let changes = original.changes([]);
    const ranges = Array.from({ length: last - first + 1 }, (_, i) => {
      const line = original.doc.line(first + i);
      return { from: Math.max(selection.from, line.from + (inlineBlockPrefix(line.text)?.[1].length ?? 0)), to: Math.min(selection.to, line.to) };
    }).filter((range) => range.to > range.from);
    const toggle = ["bold", "italic", "underline", "strike"].includes(cmd.type) ? cmd.type as "bold" | "italic" | "underline" | "strike" : null;
    const allEnabled = toggle && ranges.every((range) => detectFormatMarksAtSelection(original.update({selection:EditorSelection.range(range.from,range.to)}).state)[toggle]);
    for (const range of ranges.reverse()) {
      current = current.update({ selection: EditorSelection.range(range.from, range.to) }).state;
      if (toggle && !allEnabled && detectFormatMarksAtSelection(current)[toggle]) continue;
      const target = { get state() { return current; }, focus() {}, dispatch(spec: TransactionSpec) {
        const tr = current.update(spec); current = tr.state; changes = changes.compose(tr.changes);
      } } as unknown as EditorView;
      applyFormat(target, cmd);
    }
    view.dispatch({ changes, selection: EditorSelection.range(changes.mapPos(selection.from, -1), changes.mapPos(selection.to, 1)) });
    return;
  }
  if ((cmd.type === "color" || cmd.type === "highlight") && isPlainQuote(view.state, view.state.selection.main.from)) return;
  switch (cmd.type) {
    case "bold":
      if (!unwrapMarkdownFormat(view, "StrongEmphasis")) {
        applyMarkdownFormat(view, "StrongEmphasis", "**", "**");
      }
      break;
    case "italic":
      if (!unwrapMarkdownFormat(view, "Emphasis")) {
        applyMarkdownFormat(view, "Emphasis", "*", "*");
      }
      break;
    case "underline":
      if (!unwrapHtmlFormat(view, "u")) {
        applyFormatAcrossSelection(
          view,
          [
            ...collectDelimiterBoundaries(view.state, "~~"),
          ],
          "<u>",
          "</u>",
        );
      }
      break;
    case "strike":
      if (!unwrapMarkdownFormat(view, "Strikethrough")) {
        applyFormatAcrossSelection(
          view,
          collectHtmlBoundaries(view.state, "u"),
          "~~",
          "~~",
        );
      }
      break;
    case "highlight":
      applyHighlight(view, cmd.color);
      break;
    case "color":
      applyColor(view, cmd.color);
      break;
    case "align":
      applyAlign(view, cmd.align);
      break;
    case "todo":
      toggleListPrefix(view, "todo");
      break;
    case "ul":
      toggleListPrefix(view, "ul");
      break;
    case "ol":
      toggleListPrefix(view, "ol");
      break;
    case "clear": {
      const { from, to, text } = inlineFormatTarget(view.state);
      if (!text) return;
      const next = unwrapInlineFormats(text);
      view.dispatch({
        changes: { from, to, insert: next },
        selection: EditorSelection.range(from, from + next.length),
      });
      break;
    }
    case "paint":
      applyPaint(view, cmd.marks);
      break;
    case "insert":
      insertSnippet(view, cmd.kind);
      break;
  }
}
