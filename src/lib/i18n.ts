import { en, enSingular } from "./locales/en";

export type Locale = "zh-CN" | "en";
export const LANGUAGE_KEY = "meteornote-editor.language";
const listeners = new Set<() => void>();
function readLocale(): Locale {
  try { return localStorage.getItem(LANGUAGE_KEY) === "en" ? "en" : "zh-CN"; }
  catch { return "zh-CN"; }
}
let locale = readLocale();
export function getLocale(): Locale { return locale; }
export function subscribeLocale(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function announce(next: Locale) {
  locale = next;
  if (typeof document !== "undefined") document.documentElement.lang = next;
  listeners.forEach(listener => listener());
}
export function setLocale(next: Locale) {
  localStorage.setItem(LANGUAGE_KEY, next);
  announce(next);
}
if (typeof window !== "undefined") {
  window.addEventListener?.("storage", event => { if (event.key === LANGUAGE_KEY || event.key === null) announce(readLocale()); });
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}
export function t(source: string, ...values: unknown[]): string {
  const catalog = Number(values[0]) === 1 && Object.prototype.hasOwnProperty.call(enSingular, source) ? enSingular : en;
  const message = locale === "en" ? (Object.prototype.hasOwnProperty.call(catalog, source) ? catalog[source] : source) : source;
  return message.replace(/\{(\d+)\}/g, (_, index: string) => String(values[Number(index)] ?? ""));
}
// Match complete known messages; captured paths, filenames and user text stay untouched.
export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (locale !== "en") return message;
  if (message.startsWith("Error: ")) return `Error: ${errorMessage(message.slice(7))}`;
  const entries = Object.entries(en);
  if (Object.prototype.hasOwnProperty.call(en, message)) return en[message];
  for (const [key, english] of entries) {
    const source = key;
    const target = english;
    if (!/\{\d+\}/.test(source)) continue;
    const slots: number[] = [];
    const pattern = source.split(/(\{\d+\})/).map(part => {
      if (/^\{\d+\}$/.test(part)) { slots.push(Number(part.slice(1, -1))); return "([\\s\\S]*?)"; }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("");
    const match = new RegExp(`^${pattern}$`).exec(message);
    if (match) return target.replace(/\{(\d+)\}/g, (_, index: string) => {
      const value = match[slots.indexOf(Number(index)) + 1] ?? "";
      // These slots contain another error, never a filename or note content.
      return ["无法读取笔记：{0}", "草稿恢复缓存写入失败：{0}", "保存失败，已保留当前编辑：{0}",
        "尚未保存，窗口保持打开：{0}", "无法打开链接：{0}", "插入图片失败：{0}"].includes(key)
        ? errorMessage(value) : value;
    });
  }
  return message;
}

// CodeMirror owns these accessibility and search-panel phrases.
export const editorPhrases: Record<string, string> = {
  "Find": "查找", "Replace": "替换", "next": "下一个", "previous": "上一个",
  "all": "全部", "match case": "区分大小写", "regexp": "正则表达式", "by word": "全字匹配",
  "replace": "替换", "replace all": "全部替换", "close": "关闭", "Go to line": "跳转到行",
  "go": "跳转", "Completions": "补全建议", "current match": "当前匹配", "on line": "所在行",
  "replaced match on line $": "已替换第 $ 行的匹配", "replaced $ matches": "已替换 $ 处匹配",
  "Control character": "控制字符",
};
