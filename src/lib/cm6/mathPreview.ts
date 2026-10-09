import { syntaxTree } from "@codemirror/language";
import {
  RangeSetBuilder,
  StateField,
  type EditorState,
} from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
} from "@codemirror/view";
import "katex/dist/katex.min.css";

let katexModule: Promise<typeof import("katex")> | undefined;

type MathSpan = {
  from: number;
  to: number;
  tex: string;
  display: boolean;
};

class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly display: boolean,
  ) {
    super();
  }

  eq(other: MathWidget) {
    return this.tex === other.tex && this.display === other.display;
  }

  toDOM(view: EditorView) {
    const el = document.createElement(this.display ? "div" : "span");
    el.className = this.display ? "cm-lp-math-block" : "cm-lp-math-inline";
    el.setAttribute("contenteditable", "false");
    el.textContent = this.display ? `$$${this.tex}$$` : `$${this.tex}$`;
    // Ordinary notes do not need to load or initialize the formula renderer.
    const loading = katexModule ??= import("katex");
    void loading.then(({ default: katex }) => {
      if (!el.isConnected) return;
      katex.render(this.tex, el, { throwOnError: false, displayMode: this.display, strict: "ignore" });
      view.requestMeasure();
    }).catch(() => {
      if (katexModule === loading) katexModule = undefined;
      el.classList.add("is-error");
    });
    return el;
  }

  ignoreEvent() {
    return false;
  }
}

function codeRanges(state: EditorState): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (
        node.name === "InlineCode" ||
        node.name === "FencedCode" ||
        node.name === "CodeBlock"
      ) {
        ranges.push({ from: node.from, to: node.to });
      }
    },
  });
  return ranges;
}

function inCode(
  ranges: Array<{ from: number; to: number }>,
  from: number,
  to: number,
) {
  return ranges.some((r) => from >= r.from && to <= r.to);
}

/** 解析 `$...$` / `$$...$$`（含多行块公式），跳过代码区间 */
export function findMathSpans(
  text: string,
  code: Array<{ from: number; to: number }> = [],
): MathSpan[] {
  const spans: MathSpan[] = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    if (text[i] === "\\" && i + 1 < n) {
      i += 2;
      continue;
    }
    if (text[i] !== "$") {
      i += 1;
      continue;
    }
    const display = text[i + 1] === "$";
    const openLen = display ? 2 : 1;
    const open = i;
    const start = i + openLen;
    let j = start;
    let closed = -1;
    while (j < n) {
      if (text[j] === "\\" && j + 1 < n) {
        j += 2;
        continue;
      }
      if (display) {
        if (text[j] === "$" && text[j + 1] === "$") {
          closed = j;
          break;
        }
      } else {
        if (text[j] === "\n") break;
        if (text[j] === "$" && text[j + 1] !== "$") {
          closed = j;
          break;
        }
      }
      j += 1;
    }
    if (closed < 0) {
      i += 1;
      continue;
    }
    const closeEnd = closed + openLen;
    const tex = text.slice(start, closed);
    if (!tex.trim() || inCode(code, open, closeEnd)) {
      i = closeEnd;
      continue;
    }
    spans.push({ from: open, to: closeEnd, tex, display });
    i = closeEnd;
  }
  return spans;
}

function buildMathDeco(state: EditorState): DecorationSet {
  try {
    const sel = state.selection.main;
    const text = state.doc.toString();
    if (!text.includes("$")) return Decoration.none;
    const code = codeRanges(state);
    const spans = findMathSpans(text, code);
    const builder = new RangeSetBuilder<Decoration>();

    for (const span of spans) {
      // 编辑中（光标或选区碰到公式）显示源码
      if (sel.from <= span.to && sel.to >= span.from) continue;
      // 只做行内 replace，避免跨行 block widget 干扰编辑
      if (span.display) continue;
      builder.add(
        span.from,
        span.to,
        Decoration.replace({
          widget: new MathWidget(span.tex, false),
          inclusive: false,
        }),
      );
    }
    return builder.finish();
  } catch (err) {
    console.error("[mathPreview] decoration build failed", err);
    return Decoration.none;
  }
}

/** Live Preview：行内 `$...$` 用 KaTeX；块公式留给阅读模式，避免挡编辑 */
export function mathPreviewExtension() {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildMathDeco(state);
    },
    update(deco, tr) {
      if (tr.docChanged || tr.selection) {
        return buildMathDeco(tr.state);
      }
      return deco;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}
