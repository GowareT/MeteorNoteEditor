import { t } from "@/lib/i18n";
import { currentPlatform, isValidWindowsName } from "./platform";
/** 笔记正文首行 `# 标题` 约定（类似常规 MD 编辑器） */

function stripTitleInlineFormat(text: string): string {
  let next = text.trim();
  let changed = true;
  while (changed) {
    changed = false;
    const before = next;
    next = next
      .replace(/^\*\*([\s\S]+)\*\*$/, "$1")
      .replace(/^__([\s\S]+)__$/, "$1")
      .replace(/^~~([\s\S]+)~~$/, "$1")
      .replace(/^`([\s\S]+)`$/, "$1")
      .replace(/^<u>([\s\S]+)<\/u>$/i, "$1")
      .replace(/^<mark(?:\s+[^>]*)?>([\s\S]+)<\/mark>$/i, "$1")
      .replace(/^<span\s+[^>]*>([\s\S]+)<\/span>$/i, "$1")
      .replace(/^\*([^*][\s\S]*?)\*$/, "$1")
      .replace(/^_([^_][\s\S]*?)_$/, "$1")
      .trim();
    changed = next !== before;
  }
  return next;
}

function replaceTitleInlineText(text: string, title: string): string {
  const safe = title.trim() || t("未命名笔记");
  const trimmed = text.trim();
  const leading = text.slice(0, text.indexOf(trimmed));
  const trailing = text.slice(leading.length + trimmed.length);
  const specs: Array<[RegExp, (m: RegExpExecArray) => string]> = [
    [/^\*\*([\s\S]+)\*\*$/, () => `**${safe}**`],
    [/^__([\s\S]+)__$/, () => `__${safe}__`],
    [/^~~([\s\S]+)~~$/, () => `~~${safe}~~`],
    [/^`([\s\S]+)`$/, () => `\`${safe}\``],
    [/^<u>([\s\S]+)<\/u>$/i, () => `<u>${safe}</u>`],
    [
      /^<mark(\s+[^>]*)?>([\s\S]+)<\/mark>$/i,
      (m) => `<mark${m[1] ?? ""}>${safe}</mark>`,
    ],
    [
      /^<span(\s+[^>]*)>([\s\S]+)<\/span>$/i,
      (m) => `<span${m[1] ?? ""}>${safe}</span>`,
    ],
    [/^\*([^*][\s\S]*?)\*$/, () => `*${safe}*`],
    [/^_([^_][\s\S]*?)_$/, () => `_${safe}_`],
  ];
  for (const [re, build] of specs) {
    const match = re.exec(trimmed);
    if (match) return `${leading}${build(match)}${trailing}`;
  }
  return `${leading}${safe}${trailing}`;
}

export function extractLeadingTitle(md: string): string | null {
  const text = md.replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const m = /^#\s+(.+?)\s*$/.exec(first);
  if (!m) return null;
  const title = stripTitleInlineFormat(m[1]!);
  return title || null;
}

/** 保证正文以 `# …` 首行标题开头；已有首行 H1 则原样保留 */
export function ensureLeadingTitle(md: string, title: string): string {
  const safe = title.trim() || t("未命名笔记");
  const text = md.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const first = text.split("\n", 1)[0] ?? "";
  if (/^#\s+/.test(first)) {
    const rest = text.slice(first.length);
    if (!rest.replace(/\n/g, "").trim()) return `${first}\n`;
    return text;
  }
  if (!text.trim()) return `# ${safe}\n`;
  return `# ${safe}\n${text.replace(/^\n+/, "")}`;
}

export function syncLeadingTitle(md: string, title: string): string {
  const safe = title.trim() || t("未命名笔记");
  const text = md.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const first = text.split("\n", 1)[0] ?? "";
  if (/^#\s+/.test(first)) {
    const current = first.replace(/^#\s+/, "");
    return `# ${replaceTitleInlineText(current, safe)}${text.slice(first.length)}`;
  }
  if (!text.trim()) return `# ${safe}\n`;
  return `# ${safe}\n${text.replace(/^\n+/, "")}`;
}

export function isValidNoteTitle(name: string): boolean {
  const t = name.trim();
  if (!t) return false;
  if (t.includes("/") || t.includes("\\") || t.includes(":")) return false;
  if (t.startsWith(".")) return false;
  if (currentPlatform() === "windows" && !isValidWindowsName(t)) return false;
  return true;
}
