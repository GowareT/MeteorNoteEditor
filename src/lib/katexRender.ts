import katex from "katex";
import "katex/dist/katex.min.css";

export function renderKatexToHtml(
  tex: string,
  displayMode: boolean,
): string {
  try {
    return katex.renderToString(tex, {
      throwOnError: false,
      displayMode,
      strict: "ignore",
      output: "html",
    });
  } catch {
    return displayMode ? `$$${tex}$$` : `$${tex}$`;
  }
}
