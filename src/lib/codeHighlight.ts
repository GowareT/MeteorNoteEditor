import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { classHighlighter, highlightTree } from "@lezer/highlight";

export const CODE_LANGUAGE_OPTIONS = [
  ["", "纯文本"], ["javascript", "JavaScript"], ["typescript", "TypeScript"],
  ["python", "Python"], ["json", "JSON"], ["html", "HTML"], ["css", "CSS"],
  ["bash", "Bash"], ["sql", "SQL"], ["java", "Java"], ["c", "C"],
  ["cpp", "C++"], ["csharp", "C#"], ["swift", "Swift"], ["go", "Go"],
  ["rust", "Rust"], ["kotlin", "Kotlin"], ["yaml", "YAML"], ["xml", "XML"],
] as const;

export function resolveCodeLanguage(info: string) {
  const name = info.trim().split(/\s+/)[0].toLowerCase();
  if (!name || ["text", "txt", "plain", "plaintext"].includes(name)) return null;
  return LanguageDescription.matchLanguageName(languages, name, false) ??
    LanguageDescription.matchFilename(languages, `snippet.${name}`);
}

export type CodeToken = { from: number; to: number; className: string };

export async function highlightCodeTokens(code: string, info: string): Promise<CodeToken[]> {
  const description = resolveCodeLanguage(info);
  if (!description) return [];
  const support = await description.load();
  const tokens: CodeToken[] = [];
  highlightTree(support.language.parser.parse(code), classHighlighter, (from, to, className) => {
    tokens.push({ from, to, className });
  });
  return tokens;
}
