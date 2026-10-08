import { t } from "@/lib/i18n";
import type { CSSProperties, ReactNode } from "react";
import { resolveEditorImage, parseImageSettings, applyImageCrop } from "@/lib/editorImages";
import {
  getLibraryIconDef,
  normalizeLibraryIconId,
} from "@/lib/libraryIcons";
import { renderKatexToHtml } from "@/lib/katexRender";
import { looksLikeTableStart, parseMarkdownTable } from "@/lib/mdTable";
import type { TableMeta } from "@/lib/cm6/livePreview";
import { sourceAlignmentBlocks } from "@/lib/cm6/alignment";
import { HighlightedCode } from "./HighlightedCode";

const TABLE_META_LINE_RE = /^<!--\s*mn-table\s+.+?\s*-->\s*$/;

function readCalloutMeta(rawParts?: string) {
  const parts = (rawParts ?? "")
    .split(":")
    .map((item) => item.trim())
    .filter(Boolean);
  const color = parts.find((item) => /^#[0-9a-f]{3,8}$/i.test(item));
  const icon = parts.find((item) => !/^#[0-9a-f]{3,8}$/i.test(item));
  const iconId = normalizeLibraryIconId(icon, "lightbulb");
  return {
    color: color || "#fff6d6",
    icon: getLibraryIconDef(iconId, "lightbulb").svg,
  };
}

function MathHtml({
  tex,
  display,
}: {
  tex: string;
  display: boolean;
}) {
  return (
    <span
      className={display ? "mn-md-math-block" : "mn-md-math-inline"}
      dangerouslySetInnerHTML={{
        __html: renderKatexToHtml(tex, display),
      }}
  />
  );
}


function cleanMarkdownImageSrc(src: string) {
  let trimmed = src.trim();
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
    trimmed = trimmed.slice(1, -1);
  }
  return trimmed.replace(/\\([()])/g, "$1");
}


function safeLinkHref(raw: string) {
  const href = cleanMarkdownImageSrc(raw);
  if (/^(https?:|mailto:|tel:)/i.test(href) || href.startsWith("#")) {
    return href;
  }
  return "#";
}

function readHtmlAttr(rawAttrs: string, name: string) {
  const re = new RegExp(`${name}\\s*=\\s*([\"'])(.*?)\\1`, "i");
  return re.exec(rawAttrs)?.[2] ?? "";
}

function readCssProp(style: string, prop: string) {
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i");
  return re.exec(style)?.[1]?.trim() ?? "";
}

function renderInline(
  text: string,
  notePath?: string | null,
  libraryRootPath?: string | null,
): ReactNode[] {
  const parts: ReactNode[] = [];
  const re =
    /(!\[([^\]]*?)\]\((<[^>\n]+>|(?:\\.|[^)\n])*)\)|\[([^\]\n]+?)\]\((<[^>\n]+>|(?:\\.|[^)\n])*)\)|<span\b([^>]*)>(.*?)<\/span>|<mark\b([^>]*)>(.*?)<\/mark>|<u\b[^>]*>(.*?)<\/u>|~~([\s\S]*?\S[\s\S]*?)~~|==([\s\S]*?\S[\s\S]*?)==|\$\$([^$]+?)\$\$|\$([^\$\n]+?)\$|\*\*([\s\S]*?\S[\s\S]*?)\*\*|__([\s\S]*?\S[\s\S]*?)__|(?<!\*)\*((?:\*\*[\s\S]*?\*\*|[^*\n])+?)\*(?!\*)|(?<!_)_((?:__[\s\S]*?__|[^_\n])+?)_(?!_)|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) {
      parts.push(text.slice(last, m.index));
    }
    if (m[2] != null) {
      const img = parseImageSettings(m[2]);
      parts.push(
        <span key={`img-${key++}`} className="mn-image-frame mn-md-image-frame" style={img.width ? {width:img.width} : undefined}>
        <img
          className="mn-md-image"
          src={resolveEditorImage(m[3] ?? "", notePath, libraryRootPath)}
          alt={img.label || t("图片")}
          onLoad={(event) => {
            const element = event.currentTarget;
            if (!img.width) element.parentElement!.style.width = `${element.naturalWidth}px`;
            applyImageCrop(element.parentElement!, element, img.crop);
          }}
          loading="lazy"
        /></span>,
      );
    } else if (m[4] != null) {
      parts.push(
        <a
          key={`a-${key++}`}
          className="mn-md-link"
          href={safeLinkHref(m[5] ?? "")}
          target="_blank"
          rel="noreferrer"
        >
          {renderInline(m[4], notePath, libraryRootPath)}
        </a>,
      );
    } else if (m[6] != null) {
      const style = readHtmlAttr(m[6] ?? "", "style");
      const color = readCssProp(style, "color");
      parts.push(
        <span
          key={`c-${key++}`}
          className="mn-md-color"
          style={color ? { color } : undefined}
        >
          {renderInline(m[7] ?? "", notePath, libraryRootPath)}
        </span>,
      );
    } else if (m[8] != null) {
      const style = readHtmlAttr(m[8] ?? "", "style");
      const bg = readCssProp(style, "background-color");
      parts.push(
        <mark
          key={`m-${key++}`}
          className="mn-md-mark"
          style={bg ? { backgroundColor: bg } : undefined}
        >
          {renderInline(m[9] ?? "", notePath, libraryRootPath)}
        </mark>,
      );
    } else if (m[10] != null) {
      parts.push(
        <u key={`u-${key++}`}>
          {renderInline(m[10], notePath, libraryRootPath)}
        </u>,
      );
    } else if (m[11] != null) {
      parts.push(
        <del key={`d-${key++}`}>
          {renderInline(m[11], notePath, libraryRootPath)}
        </del>,
      );
    } else if (m[12] != null) {
      parts.push(
        <mark key={`hm-${key++}`} className="mn-md-mark">
          {renderInline(m[12], notePath, libraryRootPath)}
        </mark>,
      );
    } else if (m[13] != null) {
      parts.push(<MathHtml key={`mb-${key++}`} tex={m[13]} display />);
    } else if (m[14] != null) {
      parts.push(<MathHtml key={`mi-${key++}`} tex={m[14]} display={false} />);
    } else if (m[15] != null) {
      const combined = m[15].startsWith("*") && text[re.lastIndex] === "*";
      if (combined) re.lastIndex += 1;
      parts.push(
        <strong key={`b-${key++}`}>
          {combined ? <em>{renderInline(m[15].slice(1), notePath, libraryRootPath)}</em> : renderInline(m[15], notePath, libraryRootPath)}
        </strong>,
      );
    } else if (m[16] != null) {
      const combined = m[16].startsWith("_") && text[re.lastIndex] === "_";
      if (combined) re.lastIndex += 1;
      parts.push(
        <strong key={`bu-${key++}`}>
          {combined ? <em>{renderInline(m[16].slice(1), notePath, libraryRootPath)}</em> : renderInline(m[16], notePath, libraryRootPath)}
        </strong>,
      );
    } else if (m[17] != null) {
      parts.push(
        <em key={`i-${key++}`}>
          {renderInline(m[17], notePath, libraryRootPath)}
        </em>,
      );
    } else if (m[18] != null) {
      parts.push(
        <em key={`iu-${key++}`}>
          {renderInline(m[18], notePath, libraryRootPath)}
        </em>,
      );
    } else if (m[19] != null) {
      parts.push(<code key={`c-${key++}`}>{m[19]}</code>);
    }
    last = re.lastIndex;
  }

  if (last < text.length) {
    const rest = text.slice(last);
    const urlRe = /<((?:https?:\/\/|mailto:)[^>\s]+)>|https?:\/\/[^\s<>()]+/g;
    let restLast = 0;
    let url: RegExpExecArray | null;
    while ((url = urlRe.exec(rest))) {
      if (url.index > restLast) parts.push(rest.slice(restLast, url.index));
      const href = url[1] ?? url[0];
      parts.push(
        <a
          key={`url-${key++}`}
          className="mn-md-link"
          href={href}
          target="_blank"
          rel="noreferrer"
        >
          {href}
        </a>,
      );
      restLast = url.index + href.length;
    }
    if (restLast < rest.length) parts.push(rest.slice(restLast));
  }
  return parts;
}

export function SimpleMarkdown({
  source,
  notePath = null,
  libraryRootPath = null,
  titleMeta,
}: {
  source: string;
  notePath?: string | null;
  libraryRootPath?: string | null;
  titleMeta?: {
    timeLabel: string;
  };
}) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const alignmentByLine = new Map(sourceAlignmentBlocks(lines.join('\n')).map(block => [block.openLine - 1, block]));
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (TABLE_META_LINE_RE.test(line.trim())) {
      i += 1;
      continue;
    }

    // 分割线
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      blocks.push(<hr key={`hr-${key++}`} className="mn-md-hr" />);
      i += 1;
      continue;
    }

    const alignBlock = alignmentByLine.get(i);
    if (alignBlock) {
      const { align } = alignBlock;
      const body = lines.slice(i + 1, alignBlock.closeLine - 1).join('\n');
      i = alignBlock.closeLine;
      blocks.push(
        <div
          key={`align-${key++}`}
          className={`mn-md-align is-${align}`}
          style={{ textAlign: align }}
        >
          {body.trim() ? <SimpleMarkdown source={body} notePath={notePath} libraryRootPath={libraryRootPath} /> : <br />}
        </div>,
      );
      continue;
    }

    // 表格
    if (looksLikeTableStart(line, lines[i + 1])) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i]!.includes("|")) {
        tableLines.push(lines[i]!);
        i += 1;
      }
      const table = parseMarkdownTable(tableLines.join("\n"));
      let meta: TableMeta = {};
      if (i < lines.length && TABLE_META_LINE_RE.test(lines[i]!.trim())) {
        try { meta = JSON.parse(decodeURIComponent(/^<!--\s*mn-table\s+(.+?)\s*-->/.exec(lines[i]!.trim())?.[1] ?? "")) ?? {}; } catch { /* Invalid optional metadata does not hide the table. */ }
      }
      if (table) {
        const renderRow = (values: string[], row: number) => <tr key={row}>{values.map((value,col) => {
          const style=meta.cells?.[`${row}:${col}`];
          if (style?.hidden) return null;
          const Cell = row===0 ? "th" : "td";
          return <Cell key={col} colSpan={style?.colSpan} rowSpan={style?.rowSpan} style={{width:meta.cols?.[col],height:meta.rows?.[row],textAlign:style?.align ?? table.aligns[col] ?? "left",color:style?.color,backgroundColor:style?.bg,fontWeight:style?.bold?700:undefined,fontStyle:style?.italic?"italic":undefined,textDecoration:style?.underline?"underline":style?.strike?"line-through":undefined,whiteSpace:"pre-wrap"}}>{renderInline(value,notePath,libraryRootPath)}</Cell>;
        })}</tr>;
        blocks.push(
          <div
            key={`table-${key++}`}
            className="mn-md-table-wrap"
          ><table className="mn-md-table" style={{width:meta.width ? `min(100%, ${meta.width}px)` : "100%",tableLayout:"fixed"}}><thead>{renderRow(table.header,0)}</thead><tbody>{table.rows.map((row,index)=>renderRow(row,index+1))}</tbody></table></div>,
        );
      } else {
        blocks.push(
          <pre key={`pre-${key++}`} className="mn-md-codeblock">
            {tableLines.join("\n")}
          </pre>,
        );
      }
      if (i < lines.length && TABLE_META_LINE_RE.test(lines[i]!.trim())) {
        i += 1;
      }
      continue;
    }

    // 围栏代码块
    const fence = /^(`{3,}|~{3,})[ \t]*([\w#+.-]*)\s*$/.exec(line.trim());
    if (fence) {
      const fenceMark = fence[1]!;
      const lang = fence[2] || "";
      const body: string[] = [];
      i += 1;
      while (
        i < lines.length &&
        !new RegExp(`^\\${fenceMark[0]}{${fenceMark.length},}\\s*$`).test(
          lines[i]!.trim(),
        )
      ) {
        body.push(lines[i]!);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push(
        <pre key={`code-${key++}`} className="mn-md-codeblock" data-lang={lang || undefined}>
          <HighlightedCode code={body.join("\n")} language={lang} />
        </pre>,
      );
      continue;
    }

    // 块级公式：$$ ... $$
    if (/^\$\$/.test(line.trim())) {
      const first = line.trim();
      if (first === "$$") {
        const body: string[] = [];
        i += 1;
        while (i < lines.length && lines[i]!.trim() !== "$$") {
          body.push(lines[i]!);
          i += 1;
        }
        if (i < lines.length && lines[i]!.trim() === "$$") i += 1;
        blocks.push(
          <div key={`math-${key++}`} className="mn-md-math-block-wrap">
            <MathHtml tex={body.join("\n")} display />
          </div>,
        );
        continue;
      }
      const one = /^\$\$([\s\S]+?)\$\$$/.exec(first);
      if (one) {
        blocks.push(
          <div key={`math-${key++}`} className="mn-md-math-block-wrap">
            <MathHtml tex={one[1]!} display />
          </div>,
        );
        i += 1;
        continue;
      }
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      const Tag = (
        level <= 1 ? "h2" : level === 2 ? "h3" : level === 3 ? "h4" : "h5"
      ) as "h2" | "h3" | "h4" | "h5";
      let offset = 0;
      for (let j = 0; j < i; j++) offset += lines[j]!.length + 1;
      blocks.push(
        <Tag
          key={`h-${key++}`}
          className={`mn-md-heading h${level}`}
          data-outline-offset={offset}
        >
          {renderInline(heading[2]!, notePath, libraryRootPath)}
        </Tag>,
      );
      if (i === 0 && level === 1 && titleMeta) {
        blocks.push(
          <div key={`title-meta-${key++}`} className="mn-md-title-meta">
            <span className="mn-md-title-meta__time">{titleMeta.timeLabel}</span>
          </div>,
        );
      }
      i += 1;
      continue;
    }

    // 无序 / 有序列表
    if (/^[-*+]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
      const ordered = /^\d+[.)]\s+/.test(line);
      const items: ReactNode[] = [];
      const itemRe = ordered ? /^\d+[.)]\s+/ : /^[-*+]\s+/;
      while (i < lines.length && itemRe.test(lines[i]!)) {
        const raw = lines[i]!.replace(itemRe, "");
        const taskMatch = /^\[[ xX]\]\s+/.exec(raw);
        const isTask = !!taskMatch;
        const checked = /^\[[xX]\]\s+/.test(raw);
        const content = isTask ? raw.replace(/^\[[ xX]\]\s+/, "") : raw;
        items.push(
          <li
            key={`li-${key++}`}
            className={isTask ? `mn-md-task${checked ? " is-checked" : ""}` : undefined}
          >
            {isTask ? <span className="mn-md-taskbox" aria-hidden="true" /> : null}
            {renderInline(content, notePath, libraryRootPath)}
          </li>,
        );
        i += 1;
      }
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag
          key={`list-${key++}`}
          className={`mn-md-list${ordered ? " is-ordered" : " is-bullet"}`}
        >
          {items}
        </ListTag>,
      );
      continue;
    }

    // 引用
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i]!)) {
        quote.push(lines[i]!.replace(/^\s*>\s?/, ""));
        i += 1;
      }
      const callout = /^\[!([a-z]+)((?::[^\]]+)*)\](?:\s*(.*))?$/i.exec(
        quote[0]?.trim() ?? "",
      );
      if (callout) {
        const meta = readCalloutMeta(callout[2]);
        const title = callout[3]?.trim() || "";
        const bodyLines =
          title && title !== "提示" ? [title, ...quote.slice(1)] : quote.slice(1);
        blocks.push(
          <aside
            key={`callout-${key++}`}
            className="mn-md-callout is-note"
            style={{ "--mn-callout-bg": meta.color } as CSSProperties}
          >
            <span
              className="mn-md-callout__icon"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: meta.icon }}
            />
            <div className="mn-md-callout__body">
              {bodyLines.length
                ? bodyLines.map((l, idx) => (
                    <div key={idx}>
                      {renderInline(l, notePath, libraryRootPath)}
                    </div>
                  ))
                : null}
            </div>
          </aside>,
        );
        continue;
      }
      blocks.push(
        <blockquote key={`q-${key++}`} className="mn-md-quote">
          <div className="mn-md-quote__body">
            {quote.map((l, idx) => (
              <div key={idx}>
                {renderInline(l, notePath, libraryRootPath)}
              </div>
            ))}
          </div>
        </blockquote>,
      );
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !alignmentByLine.has(i) &&
      !/^(#{1,6})\s+/.test(lines[i]!) &&
      !/^[-*+]\s+/.test(lines[i]!) &&
      !/^\d+[.)]\s+/.test(lines[i]!) &&
      !/^>\s?/.test(lines[i]!) &&
      !/^(`{3,}|~{3,})/.test(lines[i]!.trim()) &&
      !/^\$\$/.test(lines[i]!.trim()) &&
      !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i]!.trim()) &&
      !TABLE_META_LINE_RE.test(lines[i]!.trim()) &&
      !looksLikeTableStart(lines[i]!, lines[i + 1])
    ) {
      para.push(lines[i]!);
      i += 1;
    }
    para.forEach((line) => {
      blocks.push(
        <p key={`p-${key++}`} className="mn-md-p">
          {renderInline(line, notePath, libraryRootPath)}
        </p>,
      );
    });
  }

  if (blocks.length === 0) {
    return <p className="mn-muted">{t("暂无内容")}</p>;
  }
  return <div className="mn-md">{blocks}</div>;
}
