import { t } from "@/lib/i18n";
import {
  autocompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import { applyFormat } from "./mdFormat";

export type SlashActionId = "image";

type SlashItem = {
  label: string;
  detail: string;
  /** 替换 `/…` 的插入文本；空字符串表示交给 apply */
  insert?: string;
  action?: SlashActionId;
};

const SLASH_ITEMS: SlashItem[] = [
  { get label() { return t("/标题1"); }, get detail() { return t("一级标题"); }, insert: "# " },
  { get label() { return t("/标题2"); }, get detail() { return t("二级标题"); }, insert: "## " },
  { get label() { return t("/标题3"); }, get detail() { return t("三级标题"); }, insert: "### " },
  { get label() { return t("/无序列表"); }, get detail() { return t("列表项"); }, insert: "- " },
  { get label() { return t("/有序列表"); }, get detail() { return t("编号列表"); }, insert: "1. " },
  { get label() { return t("/任务"); }, get detail() { return t("待办勾选"); }, insert: "- [ ] " },
  { get label() { return t("/引用"); }, get detail() { return t("引用块"); }, insert: "> " },
  { get label() { return t("/链接"); }, get detail() { return t("Markdown 链接"); }, get insert() { return t("[链接文字](https://)"); } },
  { get label() { return t("/图片"); }, get detail() { return t("本地或网络图片"); }, action: "image", insert: "" },
  { get label() { return t("/提示"); }, get detail() { return t("高亮提示块"); }, get insert() { return t("> [!note:#fff6d6:lightbulb] 在这里输入内容"); } },
  { get label() { return t("/代码块"); }, get detail() { return t("围栏代码"); }, insert: "```\n\n```\n" },
  { get label() { return t("/分割线"); }, get detail() { return t("水平线"); }, insert: "\n---\n\n" },
  { get label() { return t("/粗体"); }, get detail() { return t("加粗"); }, insert: "****" },
  { get label() { return t("/斜体"); }, get detail() { return t("斜体"); }, insert: "**" },
  { get label() { return t("/下划线"); }, get detail() { return t("下划线"); }, insert: "<u></u>" },
  { get label() { return t("/删除线"); }, get detail() { return t("删除线"); }, insert: "~~~~" },
  { get label() { return t("/高亮"); }, get detail() { return t("高亮文本"); }, insert: "====" },
  { get label() { return t("/行内公式"); }, detail: "KaTeX $...$", insert: "$$" },
  { get label() { return t("/块公式"); }, detail: "KaTeX $$...$$", insert: "$$\n\n$$" },
  {
    get label() { return t("/表格"); },
    get detail() { return t("插入 Markdown 表格"); },
    get insert() { return t("| 列1 | 列2 |\n| --- | --- |\n|  |  |"); },
  },
];

function applySnippet(
  view: EditorView,
  from: number,
  to: number,
  insert: string,
) {
  let cursorOffset = insert.length;
  if (insert === "****") cursorOffset = 2;
  if (insert === "**") cursorOffset = 1;
  if (insert === "~~~~") cursorOffset = 2;
  if (insert === "====") cursorOffset = 2;
  if (insert === "<u></u>") cursorOffset = 3;
  if (insert === "$$") cursorOffset = 1;
  if (insert === "$$\n\n$$") cursorOffset = 3;
  if (insert === "```\n\n```" || insert === "```\n\n```\n") cursorOffset = 4;
  if (insert === t("[链接文字](https://)")) cursorOffset = 1;
  if (insert === t("![图片]()")) cursorOffset = insert.length - 1;
  if (insert.startsWith("> [!note")) cursorOffset = insert.indexOf(t("在这里输入内容"));
  if (insert.startsWith(t("| 列1 |"))) cursorOffset = insert.indexOf("\n|  |") + 4;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + cursorOffset },
  });
}

export function slashCompletions(
  onAction?: (action: SlashActionId) => void,
): (context: CompletionContext) => CompletionResult | null {
  return (context) => {
    const match = context.matchBefore(/\/[^\s]*/);
    if (!match) return null;
    if (match.from > 0) {
      const prev = context.state.doc.sliceString(match.from - 1, match.from);
      if (prev !== "" && prev !== "\n" && prev !== " " && prev !== "\t") {
        return null;
      }
    }
    const query = match.text.slice(1).toLowerCase();
    const options: Completion[] = SLASH_ITEMS.filter((item) => {
      if (!query) return true;
      return (
        item.label.toLowerCase().includes(query) ||
        item.detail.toLowerCase().includes(query)
      );
    }).map((item) => ({
      label: item.label,
      detail: item.detail,
      type: "keyword",
      boost: item.action ? 2 : 1,
      apply: (view, _completion, from, to) => {
        if (item.label === t("/任务") || item.label === t("/提示")) {
          view.dispatch({ changes: { from, to, insert: "" }, selection: { anchor: from } });
          applyFormat(view, item.label === t("/任务") ? { type: "todo" } : { type: "insert", kind: "callout" });
          return;
        }
        if (item.action) {
          view.dispatch({ changes: { from, to, insert: "" } });
          onAction?.(item.action);
          return;
        }
        applySnippet(view, from, to, item.insert ?? "");
      },
    }));
    if (!options.length) return null;
    return {
      from: match.from,
      options,
      filter: false,
    };
  };
}

export function slashCommandExtension(
  onAction?: (action: SlashActionId) => void,
) {
  return [
    autocompletion({
      override: [slashCompletions(onAction)],
      activateOnTyping: true,
      icons: false,
      optionClass: () => "mn-cm-slash-option",
    }),
    EditorView.domEventHandlers({
      keyup(event, view) {
        if (event.key === "/") {
          queueMicrotask(() => startCompletion(view));
        }
        return false;
      },
    }),
  ];
}
