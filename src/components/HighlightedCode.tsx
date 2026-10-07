import { useEffect, useState, type ReactNode } from "react";
import { highlightCodeTokens, type CodeToken } from "@/lib/codeHighlight";
import "./HighlightedCode.css";

export function HighlightedCode({ code, language }: { code: string; language: string }) {
  const [result, setResult] = useState<{ code: string; language: string; tokens: CodeToken[] } | null>(null);
  useEffect(() => {
    let active = true;
    void highlightCodeTokens(code, language).then((tokens) => {
      if (active) setResult({ code, language, tokens });
    }).catch(() => { if (active) setResult(null); });
    return () => { active = false; };
  }, [code, language]);
  const parts: ReactNode[] = [];
  let offset = 0;
  if (result?.code === code && result.language === language) {
    for (const token of result.tokens) {
      if (token.from > offset) parts.push(code.slice(offset, token.from));
      parts.push(<span key={token.from} className={token.className}>{code.slice(token.from, token.to)}</span>);
      offset = token.to;
    }
  }
  parts.push(code.slice(offset));
  return <code>{parts}</code>;
}
