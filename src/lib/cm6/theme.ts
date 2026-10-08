import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

function isDarkTheme() {
  const forced = document.documentElement.getAttribute("data-theme");
  if (forced === "dark") return true;
  if (forced === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** 贴合 MeteorNote 变量的 CM6 主题 */
export function meteorNoteEditorTheme(fontSize: number, monospace: boolean) {
  return EditorView.theme(
    {
      "&": {
        height: "100%",
        width: "100%",
        maxWidth: "none",
        fontSize: `${fontSize}px`,
        fontFamily: monospace
          ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
          : "var(--mn-font-ui)",
        color: "var(--mn-text)",
        backgroundColor: "transparent",
      },
      ".cm-scroller": {
        fontFamily: "inherit",
        lineHeight: "1.84",
        overflow: "auto",
        width: "100%",
        maxWidth: "none",
      },
      ".cm-content": {
        padding:
          "18px var(--mn-note-gutter, 22px) max(22vh, 120px)",
        caretColor: "var(--mn-accent, #3375fa)",
        minHeight: "calc(100% + 22vh)",
        width: "100%",
        maxWidth: "var(--mn-note-content-max-width, 920px)",
        margin: "0 auto",
        boxSizing: "border-box",
        fontWeight: "400",
      },
      ".cm-line": {
        padding: "0 2px",
        lineHeight: "inherit",
        minHeight: "1.84em",
        width: "100%",
        maxWidth: "none",
        boxSizing: "border-box",
      },
      ".cm-line:not(.cm-lp-heading-line):not(.cm-lp-task-item):not(.cm-lp-codeblock-line):not(.cm-lp-quote):not(.cm-lp-callout):not(.cm-lp-table-meta-line):not(.cm-lp-align-boundary):not(.cm-lp-hr-line):not(:has(> br:only-child))":
        {
          paddingBottom: "0.34em",
        },
      ".cm-line:has(> br:only-child)": {
        minHeight: "2.3em",
      },
      "&.cm-focused": {
        outline: "none",
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
        background:
          "color-mix(in srgb, var(--mn-accent, #3375fa) 22%, transparent) !important",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--mn-accent, #3375fa)",
      },
      ".cm-activeLine": {
        backgroundColor: "transparent",
      },
      ".cm-gutters": {
        display: "none",
      },
      ".cm-placeholder": {
        color: "var(--mn-text-secondary)",
        fontStyle: "normal",
      },
      ".cm-tooltip": {
        border: "1px solid var(--mn-border)",
        background: "var(--mn-surface)",
        color: "var(--mn-text)",
        borderRadius: "8px",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
      },
      ".cm-tooltip.cm-tooltip-autocomplete": {
        "& > ul": {
          fontFamily: "var(--mn-font-ui)",
          fontSize: "13px",
          maxHeight: "280px",
        },
        "& > ul > li": {
          padding: "6px 10px",
          borderRadius: "4px",
          cursor: "default",
        },
        "& > ul > li:hover": {
          background:
            "color-mix(in srgb, var(--mn-accent, #3375fa) 11%, transparent)",
          color: "var(--mn-text)",
        },
        "& > ul > li[aria-selected]": {
          background:
            "color-mix(in srgb, var(--mn-accent, #3375fa) 16%, transparent)",
          color: "var(--mn-text)",
        },
      },
      ".cm-completionLabel": {
        fontWeight: 500,
      },
      ".cm-completionDetail": {
        marginLeft: "8px",
        color: "var(--mn-text-secondary)",
        fontStyle: "normal",
      },
      /* Live Preview：隐藏 MD 标记（避免 letter-spacing 负值导致相邻文字选不中） */
      ".cm-lp-hide": {
        opacity: "0",
        fontSize: "0.01px",
        color: "transparent",
        caretColor: "var(--mn-accent, #3375fa)",
      },
      ".cm-lp-hr-line": {
        position: "relative",
        fontSize: "0",
        lineHeight: "1.6",
        color: "transparent",
      },
      ".cm-lp-hr-line::after": {
        content: '""',
        display: "block",
        position: "absolute",
        left: "0",
        right: "0",
        top: "50%",
        borderTop: "1px solid rgba(128, 128, 128, 0.55)",
      },
      ".cm-lp-hr-line.is-active::after": {
        borderTopColor:
          "color-mix(in srgb, var(--mn-accent, #3375fa) 55%, rgba(128, 128, 128, 0.55))",
      },
      ".cm-lp-hash-plain": {
        color: "inherit",
        fontSize: "inherit",
        fontWeight: "inherit",
        lineHeight: "inherit",
      },
      ".cm-lp-h1-line": {
        fontSize: "calc(1em * var(--mn-md-h1-scale, 1.35))",
        fontWeight: "650",
        lineHeight: "1.45",
        paddingTop: "1.25em",
        paddingBottom: "0.78em",
        minHeight: "2.4em",
        cursor: "text",
      },
      ".cm-lp-h2-line": {
        fontSize: "calc(1em * var(--mn-md-h2-scale, 1.2))",
        fontWeight: "650",
        lineHeight: "1.45",
        paddingTop: "1.1em",
        paddingBottom: "0.7em",
        minHeight: "2.3em",
        cursor: "text",
      },
      ".cm-lp-h3-line": {
        fontSize: "calc(1em * var(--mn-md-h3-scale, 1.1))",
        fontWeight: "650",
        lineHeight: "1.45",
        paddingTop: "0.95em",
        paddingBottom: "0.62em",
        minHeight: "2.2em",
        cursor: "text",
      },
      ".cm-lp-h4-line, .cm-lp-h5-line, .cm-lp-h6-line": {
        fontSize: "calc(1em * var(--mn-md-h4-scale, 1.05))",
        fontWeight: "600",
        lineHeight: "1.45",
        paddingTop: "0.8em",
        paddingBottom: "0.56em",
        minHeight: "2.1em",
        cursor: "text",
      },
      ".cm-lp-heading-line": {
        cursor: "text",
        width: "100%",
      },
      ".cm-lp-strong": {
        fontWeight: "700",
      },
      ".cm-lp-heading-line .cm-lp-strong": {
        fontWeight: "800",
      },
      ".cm-lp-em": {
        fontStyle: "italic",
      },
      ".cm-lp-strike": {
        color: "var(--mn-text-secondary) !important",
        textDecorationLine: "line-through",
        textDecorationStyle: "solid",
        textDecorationThickness: "1px",
        textDecorationColor:
          "color-mix(in srgb, var(--mn-text-secondary) 78%, transparent) !important",
      },
      ".cm-lp-underline": {
        textDecorationLine: "underline",
        textDecorationStyle: "solid",
        textDecorationThickness: "1px",
        textUnderlineOffset: "0.16em",
      },
      ".cm-lp-strike.cm-lp-underline, .cm-lp-strike .cm-lp-underline, .cm-lp-underline .cm-lp-strike": {
        textDecorationLine: "underline line-through",
        textDecorationStyle: "solid",
        textDecorationThickness: "1px",
        textUnderlineOffset: "0.16em",
      },
      ".cm-lp-em.cm-lp-underline, .cm-lp-em .cm-lp-underline, .cm-lp-underline .cm-lp-em": {
        fontStyle: "italic",
        textDecorationLine: "underline",
        textDecorationStyle: "solid",
        textDecorationThickness: "1px",
        textUnderlineOffset: "0.16em",
      },
      ".cm-lp-em.cm-lp-strike.cm-lp-underline, .cm-lp-em .cm-lp-strike .cm-lp-underline, .cm-lp-underline .cm-lp-em .cm-lp-strike": {
        fontStyle: "italic",
        textDecorationLine: "underline line-through",
        textDecorationStyle: "solid",
        textDecorationThickness: "1px",
        textUnderlineOffset: "0.16em",
      },
      ".cm-lp-sub": {
        fontSize: "0.78em",
        verticalAlign: "sub",
      },
      ".cm-lp-sup": {
        fontSize: "0.78em",
        verticalAlign: "super",
      },
      ".cm-lp-code": {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: "0.92em",
        padding: "0.1em 0.35em",
        borderRadius: "4px",
        background: "color-mix(in srgb, var(--mn-text) 6%, transparent)",
      },
      ".cm-lp-link": {
        color: "var(--mn-accent, #3375fa)",
        textDecoration: "underline",
        textUnderlineOffset: "2px",
      },
      ".cm-lp-math-inline": {
        display: "inline",
        verticalAlign: "middle",
      },
      ".cm-lp-math-block": {
        display: "block",
        margin: "0.55em 0",
        overflowX: "auto",
        textAlign: "center",
      },
      ".cm-lp-math-inline.is-error, .cm-lp-math-block.is-error": {
        color: "var(--mn-danger, #c0392b)",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: "0.92em",
      },
      ".cm-lp-list-item": {
        paddingLeft: "0",
      },
      ".cm-lp-list-bullet, .cm-lp-list-num": {
        display: "inline-block",
        minWidth: "0",
        marginLeft: "0",
        marginRight: "0.5em",
        fontVariantNumeric: "tabular-nums",
        userSelect: "none",
        whiteSpace: "nowrap",
        verticalAlign: "baseline",
        opacity: "1",
        fontSize: "1em",
        lineHeight: "inherit",
      },
      ".cm-lp-list-bullet": {
        textAlign: "left",
        fontWeight: "700",
        fontSize: "1.05em",
        lineHeight: "1",
        transform: "translateY(-0.05em)",
        color: "var(--mn-accent, #3375fa)",
      },
      ".cm-lp-list-num": {
        display: "inline-flex",
        justifyContent: "flex-start",
        minWidth: "0",
        marginLeft: "0.35em",
        marginRight: "0.45em",
        textAlign: "left",
        fontWeight: "inherit",
        color: "var(--mn-accent, #3375fa)",
      },
      ".cm-lp-list-num-val": {
        color: "var(--mn-accent, #3375fa)",
        fontWeight: "inherit",
      },
      ".cm-lp-list-dot": {
        color: "var(--mn-accent, #3375fa)",
      },
      ".cm-lp-list-depth-2": {
        paddingLeft: "0.9em",
      },
      ".cm-lp-list-depth-3": {
        paddingLeft: "1.8em",
      },
      ".cm-lp-list-depth-4": {
        paddingLeft: "2.7em",
      },
      ".cm-lp-codeblock-line": {
        backgroundColor:
          "color-mix(in srgb, var(--mn-text) 4.5%, var(--mn-surface))",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: "0.92em",
        lineHeight: "var(--mn-md-code-line-height, 1.65)",
        position: "relative",
        padding: "0",
        paddingRight: "0",
        boxSizing: "border-box",
        borderLeft: "1px solid var(--mn-border)",
        borderRight: "1px solid var(--mn-border)",
      },
      ".cm-lp-codeblock-line:not(.cm-lp-codeblock-first):not(.cm-lp-codeblock-last)":
        {
          minHeight: "1.65em",
          overflow: "visible",
        },
      ".cm-lp-codeblock-line:not(.cm-lp-codeblock-first):not(.cm-lp-codeblock-last) *":
        {
          lineHeight: "inherit",
        },
      ".cm-lp-code-indent, .cm-lp-code-indent-right": {
        display: "inline-block",
        width: "1em",
        pointerEvents: "none",
        verticalAlign: "baseline",
      },
      ".cm-lp-codeblock-line.cm-activeLine": {
        backgroundColor:
          "color-mix(in srgb, var(--mn-text) 4.5%, var(--mn-surface))",
      },
      ".cm-lp-codeblock-first": {
        paddingTop: "0",
        paddingBottom: "0",
        minHeight: "0",
        height: "0",
        lineHeight: "0",
        overflow: "hidden",
      },
      ".cm-lp-codeblock-last": {
        paddingTop: "0",
        paddingBottom: "0",
        minHeight: "0",
        height: "0",
        lineHeight: "0",
        overflow: "hidden",
      },
      ".cm-lp-codeblock-content-first": {
        borderTop: "1px solid color-mix(in srgb, var(--mn-text) 8%, transparent)",
        borderTopLeftRadius: "6px",
        borderTopRightRadius: "6px",
        paddingTop: "38px",
      },
      ".cm-lp-codeblock-content-last": {
        borderBottom: "1px solid color-mix(in srgb, var(--mn-text) 8%, transparent)",
        borderBottomLeftRadius: "6px",
        borderBottomRightRadius: "6px",
        paddingBottom: "14px",
      },
      ".cm-lp-codeblock-content-first.cm-lp-codeblock-content-last": {
        minHeight: "3.7em",
      },
      ".cm-lp-codeblock-lang-line[data-lang]::after": {
        content: "attr(data-lang)",
        position: "absolute",
        left: "14px",
        top: "12px",
        zIndex: "2",
        fontSize: "11px",
        fontFamily: "var(--mn-font-ui, system-ui, sans-serif)",
        fontWeight: "550",
        lineHeight: "1",
        letterSpacing: "0",
        color:
          "color-mix(in srgb, var(--mn-text-secondary) 78%, transparent)",
        pointerEvents: "none",
        userSelect: "none",
      },
      ".cm-lp-codeblock-copy-line": {
        paddingRight: "0",
      },
      ".cm-lp-code-copy": {
        position: "absolute",
        right: "0.72em",
        top: "6px",
        zIndex: "3",
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        height: "24px",
        padding: "0 7px",
        border: "1px solid transparent",
        borderRadius: "5px",
        background: "transparent",
        color: "var(--mn-text-secondary)",
        fontFamily: "var(--mn-font-ui, system-ui, sans-serif)",
        fontSize: "11px",
        fontWeight: "500",
        lineHeight: "22px",
        cursor: "pointer",
        opacity: "0.66",
        transition:
          "opacity 0.12s ease, color 0.12s ease, border-color 0.12s ease, background 0.12s ease",
      },
      ".cm-lp-codeblock-line:hover .cm-lp-code-copy, .cm-lp-code-copy:focus-visible":
        {
          opacity: "1",
        },
      ".cm-lp-code-copy:hover": {
        borderColor: "color-mix(in srgb, var(--mn-text) 8%, transparent)",
        background: "color-mix(in srgb, var(--mn-surface) 82%, transparent)",
        color: "var(--mn-text)",
      },
      ".cm-lp-code-copy__icon": {
        position: "relative",
        width: "12px",
        height: "12px",
        flex: "0 0 12px",
      },
      ".cm-lp-code-copy__icon::before, .cm-lp-code-copy__icon::after": {
        content: "''",
        position: "absolute",
        width: "7px",
        height: "8px",
        border: "1px solid currentColor",
        borderRadius: "2px",
        boxSizing: "border-box",
      },
      ".cm-lp-code-copy__icon::before": {
        left: "1px",
        top: "1px",
        opacity: "0.62",
      },
      ".cm-lp-code-copy__icon::after": {
        right: "1px",
        bottom: "1px",
      },
      ".cm-lp-code-exit": {
        height: "0.55em",
        cursor: "text",
        background: "transparent",
      },
      ".cm-lp-code-exit:hover": {
        background: "color-mix(in srgb, var(--mn-accent) 4%, transparent)",
      },
      ".cm-lp-codeblock": {
        display: "block",
        width: "100%",
        margin: "0.55em 0",
        padding: "calc(0.75em * var(--mn-md-code-pad-y, 1)) 0.9em",
        overflowX: "auto",
        border: "1px solid color-mix(in srgb, var(--mn-text) 8%, transparent)",
        borderRadius: "6px",
        backgroundColor:
          "color-mix(in srgb, var(--mn-text) 4.5%, var(--mn-surface))",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: "0.92em",
        lineHeight: "1.55",
        whiteSpace: "pre",
      },
      ".cm-lp-codeblock code": {
        font: "inherit",
        background: "transparent",
        padding: "0",
      },
      ".cm-lp-table-wrap": {
        display: "block",
        width: "100%",
        // Block widget height measurement excludes margins. Keep spacing
        // inside the measured box so mouse coordinates below it stay correct.
        margin: "0",
        padding: "calc(10px + 0.95em) 10px calc(10px + 1.15em) 2px",
        boxSizing: "border-box",
        overflowX: "auto",
        fontFamily: "var(--mn-font-ui)",
        overscrollBehaviorInline: "contain",
      },
      ".cm-lp-table-wrap--editable": {
        overflow: "visible",
      },
      ".cm-lp-table-wrap--editable.is-invalid": {
        whiteSpace: "pre-wrap",
        padding: "0.8em 0.9em",
        borderRadius: "8px",
        backgroundColor: "rgba(128, 128, 128, 0.08)",
        border: "1px solid color-mix(in srgb, var(--mn-text) 12%, transparent)",
      },
      ".cm-lp-table-meta-line": {
        height: "0",
        minHeight: "0",
        lineHeight: "0",
        overflow: "hidden",
        paddingTop: "0",
        paddingBottom: "0",
      },
      ".cm-lp-table": {
        width: "100%",
        maxWidth: "100%",
        tableLayout: "fixed",
        borderCollapse: "separate",
        borderSpacing: "0",
        fontSize: "0.96em",
        lineHeight: "1.42",
        color: "var(--mn-text)",
        backgroundColor: "transparent",
      },
      ".cm-lp-table--editable": {
        minWidth: "min(120px, 100%)",
      },
      ".cm-lp-table th, .cm-lp-table td": {
        position: "relative",
        borderRight: "1px solid color-mix(in srgb, var(--mn-text) 10%, transparent)",
        borderBottom: "1px solid color-mix(in srgb, var(--mn-text) 10%, transparent)",
        padding: "0.5em 0.72em",
        verticalAlign: "middle",
        backgroundColor: "var(--mn-surface)",
        transition: "background-color 0.14s ease, box-shadow 0.14s ease",
      },
      ".cm-lp-table th": {
        backgroundColor: "color-mix(in srgb, var(--mn-text) 4%, var(--mn-surface))",
        fontWeight: "600",
        position: "sticky",
        top: "0",
        zIndex: "1",
      },
      ".cm-lp-table th:hover, .cm-lp-table td:hover": {
        backgroundColor: "color-mix(in srgb, var(--mn-accent) 3%, var(--mn-surface))",
        zIndex: "6",
      },
      ".cm-lp-table th.is-selected, .cm-lp-table td.is-selected": {
        backgroundColor:
          "color-mix(in srgb, var(--mn-accent, #3375fa) 7%, var(--mn-surface))",
        boxShadow:
          "inset 0 0 0 1px color-mix(in srgb, var(--mn-accent, #3375fa) 30%, transparent)",
      },
      ".cm-lp-table th:first-child, .cm-lp-table td:first-child": {
        borderLeft: "1px solid color-mix(in srgb, var(--mn-text) 10%, transparent)",
      },
      ".cm-lp-table tr:first-child th": {
        borderTop: "1px solid color-mix(in srgb, var(--mn-text) 10%, transparent)",
      },
      ".cm-lp-table tr:last-child td": {
        borderBottom: "1px solid color-mix(in srgb, var(--mn-text) 10%, transparent)",
      },
      ".cm-lp-table tr:first-child th:first-child": {
        borderTopLeftRadius: "6px",
      },
      ".cm-lp-table tr:first-child th:last-child": {
        borderTopRightRadius: "6px",
      },
      ".cm-lp-table tr:last-child td:first-child": {
        borderBottomLeftRadius: "6px",
      },
      ".cm-lp-table tr:last-child td:last-child": {
        borderBottomRightRadius: "6px",
      },
      ".cm-lp-table-add": {
        position: "absolute",
        width: "16px",
        height: "16px",
        border: "1px solid color-mix(in srgb, var(--mn-text) 16%, transparent)",
        borderRadius: "50%",
        backgroundColor: "var(--mn-surface)",
        color: "var(--mn-text-secondary)",
        boxShadow: "none",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "0",
        lineHeight: "1",
        padding: "0",
        opacity: "0",
        pointerEvents: "none",
        cursor: "pointer",
        transform: "scale(0.82)",
        transition:
          "opacity 0.12s ease, transform 0.12s ease, background-color 0.12s ease, border-color 0.12s ease",
        zIndex: "8",
      },
      ".cm-lp-table-add::before, .cm-lp-table-add::after": {
        content: '\"\"',
        position: "absolute",
        left: "50%",
        top: "50%",
        backgroundColor: "currentColor",
        transform: "translate(-50%, -50%)",
      },
      ".cm-lp-table-add::before": {
        width: "7px",
        height: "1px",
      },
      ".cm-lp-table-add::after": {
        width: "1px",
        height: "7px",
      },
      ".cm-lp-table th:hover > .cm-lp-table-add, .cm-lp-table td:hover > .cm-lp-table-add, .cm-lp-table-add:focus-visible": {
        opacity: "0.96",
        pointerEvents: "auto",
        transform: "scale(1)",
      },
      ".cm-lp-table-add:hover": {
        color: "var(--mn-accent, #3375fa)",
        backgroundColor:
          "color-mix(in srgb, var(--mn-accent, #3375fa) 9%, var(--mn-surface))",
        borderColor:
          "color-mix(in srgb, var(--mn-accent, #3375fa) 34%, transparent)",
      },
      ".cm-lp-table-add--col": {
        top: "-8px",
        right: "-8px",
      },
      ".cm-lp-table-add--row": {
        right: "-8px",
        bottom: "-8px",
      },
      ".cm-lp-table-input": {
        width: "100%",
        minWidth: "0",
        minHeight: "1.42em",
        padding: "0",
        border: "none",
        outline: "none",
        resize: "none",
        background: "transparent",
        color: "inherit",
        font: "inherit",
        display: "block",
        lineHeight: "1.42",
        caretColor: "var(--mn-accent, #3375fa)",
        overflow: "hidden",
      },
      ".cm-lp-table-input::placeholder": {
        color: "var(--mn-text-secondary)",
        opacity: "0.72",
      },
      ".cm-lp-table-input:focus": {
        backgroundColor: "transparent",
        boxShadow: "none",
        borderRadius: "4px",
      },
      ".cm-lp-table-input--head": {
        fontWeight: "650",
      },
      ".cm-lp-table td:focus-within, .cm-lp-table th:focus-within": {
        backgroundColor:
          "color-mix(in srgb, var(--mn-accent, #3375fa) 7%, var(--mn-surface))",
        boxShadow:
          "inset 0 0 0 1px color-mix(in srgb, var(--mn-accent, #3375fa) 34%, transparent)",
      },
      ".cm-lp-table-resize": {
        position: "absolute",
        zIndex: "3",
        opacity: "0",
        backgroundColor: "transparent",
        transition: "opacity 0.12s ease",
      },
      ".cm-lp-table-resize::after": {
        content: '""',
        position: "absolute",
        borderRadius: "0",
        backgroundColor: "color-mix(in srgb, var(--mn-text) 22%, transparent)",
      },
      ".cm-lp-table th:hover .cm-lp-table-resize, .cm-lp-table td:hover .cm-lp-table-resize":
        {
          opacity: "0.62",
        },
      ".cm-lp-table-resize--col": {
        top: "0",
        right: "-4px",
        width: "8px",
        height: "100%",
        cursor: "col-resize",
      },
      ".cm-lp-table-resize--col::after": {
        top: "8px",
        bottom: "8px",
        left: "3px",
        width: "1px",
      },
      ".cm-lp-table-resize--row": {
        left: "0",
        bottom: "-4px",
        width: "100%",
        height: "8px",
        cursor: "row-resize",
      },
      ".cm-lp-table-resize--row::after": {
        display: "none",
      },
      ".cm-lp-table-cell-trigger": {
        position: "absolute",
        top: "3px",
        right: "3px",
        zIndex: "5",
        width: "18px",
        height: "18px",
        padding: "0",
        border: "1px solid color-mix(in srgb, var(--mn-text) 10%, transparent)",
        borderRadius: "4px",
        backgroundColor: "color-mix(in srgb, var(--mn-surface) 94%, transparent)",
        color: "var(--mn-text-secondary)",
        fontSize: "13px",
        lineHeight: "14px",
        opacity: "0",
        cursor: "pointer",
        transition: "opacity 0.14s ease, background-color 0.14s ease, color 0.14s ease",
      },
      ".cm-lp-table th:hover .cm-lp-table-cell-trigger, .cm-lp-table td:hover .cm-lp-table-cell-trigger, .cm-lp-table .is-selected .cm-lp-table-cell-trigger":
        {
          opacity: "0.9",
        },
      ".cm-lp-table-cell-trigger:hover": {
        color: "var(--mn-accent, #3375fa)",
        backgroundColor:
          "color-mix(in srgb, var(--mn-accent, #3375fa) 7%, var(--mn-surface))",
        borderColor: "color-mix(in srgb, var(--mn-accent) 28%, transparent)",
      },
      ".cm-lp-table-actions": {
        position: "absolute",
        top: "24px",
        right: "3px",
        zIndex: "9",
        minWidth: "112px",
        padding: "4px",
        border: "1px solid color-mix(in srgb, var(--mn-text) 12%, transparent)",
        borderRadius: "8px",
        backgroundColor: "var(--mn-surface)",
        boxShadow: "0 8px 22px rgba(0, 0, 0, 0.13)",
      },
      ".cm-lp-table-actions button": {
        display: "block",
        width: "100%",
        height: "26px",
        padding: "0 8px",
        border: "none",
        borderRadius: "5px",
        background: "transparent",
        color: "var(--mn-text)",
        font: "12px/26px var(--mn-font-ui)",
        textAlign: "left",
        cursor: "default",
      },
      ".cm-lp-table-actions button:hover:not(:disabled)": {
        background:
          "color-mix(in srgb, var(--mn-accent, #3375fa) 10%, transparent)",
      },
      ".cm-lp-table-actions button:disabled": {
        color: "color-mix(in srgb, var(--mn-text-secondary) 56%, transparent)",
      },
      ".cm-lp-task-item": {
        listStyle: "none",
      },
      ".cm-lp-task-item.is-checked": {
        color: "color-mix(in srgb, var(--mn-text) 58%, transparent)",
      },
      ".cm-lp-task-done-text": {
        textDecoration: "line-through",
        textDecorationThickness: "1px",
        textDecorationColor:
          "color-mix(in srgb, var(--mn-text) 42%, transparent)",
      },
      ".cm-lp-task-marker": {
        fontSize: "inherit",
        display: "inline-block",
        position: "relative",
        overflow: "hidden",
        lineHeight: "0",
        width: "0.98em",
        height: "0.98em",
        minWidth: "0.98em",
        margin: "0 0.58em 0 0.35em",
        verticalAlign: "-0.13em",
      },
      ".cm-lp-taskbox": {
        fontSize: "inherit",
        appearance: "none",
        display: "block",
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        minWidth: "0",
        margin: "0",
        lineHeight: "0",
        padding: "0",
        borderRadius: "0.22em",
        border: "1.5px solid color-mix(in srgb, var(--mn-text) 36%, transparent)",
        backgroundColor: "color-mix(in srgb, var(--mn-surface) 96%, white)",
        boxSizing: "border-box",
        cursor: "pointer",
      },
      ".cm-lp-taskbox.is-checked": {
        borderColor: "var(--mn-accent, #3375fa)",
        backgroundColor: "var(--mn-accent, #3375fa)",
      },
      ".cm-lp-taskbox.is-checked::after": {
        position: "absolute",
        left: "50%",
        top: "43%",
        content: '""',
        width: "0.28em",
        height: "0.5em",
        borderRight: "1.8px solid white",
        borderBottom: "1.8px solid white",
        transform: "translate(-50%, -50%) rotate(40deg)",
        display: "block",
      },
      ".cm-lp-quote": {
        position: "relative",
        padding:
          "calc(var(--mn-md-quote-pad-y, 0.16) * 1em) 0 calc(var(--mn-md-quote-pad-y, 0.16) * 1em) 0.85em",
        background:
          "color-mix(in srgb, var(--mn-text) 2.5%, transparent)",
        fontStyle: "normal",
      },
      ".cm-lp-quote::before": {
        content: '""',
        position: "absolute",
        left: "0",
        top: "0",
        bottom: "0",
        width: "3px",
        borderRadius: "8px",
        background:
          "color-mix(in srgb, var(--mn-text) 18%, transparent)",
      },
      ".cm-lp-callout": {
        "--mn-callout-bg": "#fff6d6",
        position: "relative",
        minHeight: "1.72em",
        padding: "0.18em 0.9em 0.18em 2.8em",
        background: "var(--mn-callout-bg)",
        borderRadius: "0",
        fontStyle: "normal",
        lineHeight: "1.72",
      },
      ".cm-lp-callout::before": {
        display: "none",
      },
      ".cm-lp-callout-head": {
        paddingLeft: "2.8em",
      },
      ".cm-lp-callout-first": {
        marginTop: "0.58em",
        paddingTop: "0.58em",
        borderTopLeftRadius: "6px",
        borderTopRightRadius: "6px",
      },
      ".cm-lp-callout-last": {
        marginBottom: "0.82em",
        paddingBottom: "0.58em",
        borderBottomLeftRadius: "6px",
        borderBottomRightRadius: "6px",
      },
      ".cm-lp-callout-first.cm-lp-callout-last": {
        borderRadius: "6px",
      },
      ".cm-lp-callout-head-widget": {
        position: "absolute",
        left: "0.9em",
        top: "0.18em",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "1.34em",
        height: "1.72em",
        margin: "0",
        padding: "0",
        border: "none",
        borderRadius: "4px",
        background: "transparent",
        color: "color-mix(in srgb, var(--mn-text) 72%, transparent)",
        fontSize: "inherit",
        fontWeight: "600",
        fontStyle: "normal",
        cursor: "pointer",
      },
      ".cm-lp-callout-first .cm-lp-callout-head-widget": {
        top: "0.58em",
      },
      ".cm-lp-callout-head-widget:hover": {
        background:
          "color-mix(in srgb, var(--mn-text) 9%, transparent)",
        color: "var(--mn-text)",
      },
      ".cm-lp-callout-head-widget__icon": {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        color: "currentColor",
        fontSize: "inherit",
        fontWeight: "700",
        lineHeight: "1",
      },
      ".cm-lp-callout-head-widget__icon svg": {
        display: "block",
        width: "1.2em",
        height: "1.2em",
      },
      ".cm-lp-align-center": {
        textAlign: "center",
      },
      ".cm-lp-align-right": {
        textAlign: "right",
      },
      ".cm-lp-align-boundary": {
        lineHeight: "0",
        minHeight: "0",
        height: "0",
        overflow: "hidden",
        paddingTop: "0",
        paddingBottom: "0",
      },
      ".cm-lp-image-wrap": {
        position: "relative",
        display: "inline-block",
        maxWidth: "100%",
        margin: "0.1em 0",
        lineHeight: "0",
        verticalAlign: "middle",
        userSelect: "none",
        borderRadius: "10px",
      },
      ".cm-lp-image": {
        display: "inline-block",
        maxWidth: "100%",
        height: "auto",
        borderRadius: "8px",
        verticalAlign: "middle",
      },
      ".cm-lp-image-wrap.is-selected": {
        outline:
          "2px solid color-mix(in srgb, var(--mn-accent, #3375fa) 70%, white)",
        outlineOffset: "3px",
      },
      ".cm-lp-image-wrap.is-selected .cm-lp-image": {
        boxShadow:
          "0 0 0 1px color-mix(in srgb, var(--mn-accent, #3375fa) 20%, transparent)",
      },
      ".cm-lp-color": {
        font: "inherit",
      },
      ".cm-lp-mark": {
        padding: "0 0.15em",
        borderRadius: "0.2em",
        backgroundColor: "color-mix(in srgb, #fff2a8 78%, transparent)",
      },
      ".cm-lp-bracket-text, .cm-lp-bracket-text *": {
        color: "inherit !important",
        textDecoration: "none !important",
      },
      ".cm-lp-hr": {
        display: "block",
        boxSizing: "border-box",
        width: "100%",
        height: "0",
        margin: "0.85em 0",
        border: "none",
        borderTop: "1px solid rgba(128, 128, 128, 0.55)",
        background: "transparent",
      },
    },
    { dark: isDarkTheme() },
  );
}

/** Markdown + 代码块语法高亮（源码模式与 Live Preview 共用） */
function buildHighlightStyle(dark: boolean) {
  return HighlightStyle.define([
    // Markdown
    { tag: tags.heading, fontWeight: "700" },
    { tag: tags.heading1, fontSize: "1.35em" },
    { tag: tags.heading2, fontSize: "1.2em" },
    { tag: tags.heading3, fontSize: "1.1em" },
    { tag: tags.strong, fontWeight: "700" },
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: tags.link, color: "#007aff" },
    { tag: tags.url, color: "#007aff" },
    {
      tag: tags.monospace,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    },
    { tag: tags.quote, fontStyle: "normal", opacity: "0.92" },
    {
      tag: tags.meta,
      color: dark ? "#8b949e" : "#6a737d",
    },
    {
      tag: tags.processingInstruction,
      color: dark ? "#8b949e" : "#6a737d",
    },
    // Code tokens
    {
      tag: tags.comment,
      color: dark ? "#8b949e" : "#6a737d",
      fontStyle: "italic",
    },
    {
      tag: tags.lineComment,
      color: dark ? "#8b949e" : "#6a737d",
      fontStyle: "italic",
    },
    {
      tag: tags.blockComment,
      color: dark ? "#8b949e" : "#6a737d",
      fontStyle: "italic",
    },
    {
      tag: tags.keyword,
      color: dark ? "#ff7b72" : "#cf222e",
    },
    {
      tag: [tags.definitionKeyword, tags.operatorKeyword, tags.modifier],
      color: dark ? "#ff7b72" : "#cf222e",
    },
    {
      tag: tags.controlKeyword,
      color: dark ? "#ff7b72" : "#cf222e",
    },
    {
      tag: tags.string,
      color: dark ? "#a5d6ff" : "#0a3069",
    },
    {
      tag: [tags.special(tags.string), tags.regexp],
      color: dark ? "#a5d6ff" : "#0a3069",
    },
    {
      tag: tags.number,
      color: dark ? "#79c0ff" : "#0550ae",
    },
    {
      tag: [tags.bool, tags.null, tags.atom, tags.literal],
      color: dark ? "#79c0ff" : "#0550ae",
    },
    {
      tag: tags.function(tags.variableName),
      color: dark ? "#d2a8ff" : "#8250df",
    },
    {
      tag: tags.function(tags.propertyName),
      color: dark ? "#d2a8ff" : "#8250df",
    },
    {
      tag: tags.definition(tags.variableName),
      color: dark ? "#ffa657" : "#953800",
    },
    {
      tag: tags.variableName,
      color: dark ? "#ffa657" : "#953800",
    },
    {
      tag: tags.propertyName,
      color: dark ? "#79c0ff" : "#0550ae",
    },
    {
      tag: [tags.typeName, tags.className, tags.namespace],
      color: dark ? "#ffa657" : "#953800",
    },
    {
      tag: tags.operator,
      color: dark ? "#ff7b72" : "#cf222e",
    },
    {
      tag: [tags.punctuation, tags.bracket, tags.paren, tags.separator],
      color: dark ? "#c9d1d9" : "#24292f",
    },
    {
      tag: [tags.meta, tags.comment, tags.lineComment, tags.blockComment],
      color: dark ? "#8b949e" : "#6a737d",
      fontStyle: "italic",
    },
    {
      tag: tags.invalid,
      color: dark ? "#ffa198" : "#b31d28",
    },
  ]);
}

export function meteorNoteHighlight() {
  return syntaxHighlighting(buildHighlightStyle(isDarkTheme()), {
    fallback: true,
  });
}

/** @deprecated 兼容旧引用：等同 meteorNoteHighlight */
export const meteorNoteSourceHighlight = meteorNoteHighlight();
