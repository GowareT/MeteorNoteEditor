export type TableAlign = "left" | "center" | "right";

export type MarkdownTable = {
  header: string[];
  aligns: TableAlign[];
  rows: string[][];
};

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function splitTableRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < t.length; i += 1) {
    const ch = t[i];
    if (ch === "|") {
      let slashCount = 0;
      for (let j = i - 1; j >= 0 && t[j] === "\\"; j -= 1) {
        slashCount += 1;
      }
      if (slashCount % 2 === 0) {
        cells.push(current);
        current = "";
        continue;
      }
    }
    current += ch;
  }
  cells.push(current);
  return cells.map((c) => {
    let cell = c;
    if (cell.startsWith(" ")) cell = cell.slice(1);
    if (cell.endsWith(" ")) cell = cell.slice(0, -1);
    return cell;
  });
}

function decodeTableCellText(cell: string) {
  return cell.replace(/\\\|/g, "|").replace(/<br\s*\/?>/gi, "\n");
}

function encodeTableCellText(cell: string) {
  return cell.replace(/\r\n/g, "\n").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function isSeparatorRow(cells: string[]) {
  return (
    cells.length > 0 &&
    cells.every((c) => /^:?-{3,}:?$/.test(c.replace(/\s/g, "")))
  );
}

function alignFromSep(cell: string): "left" | "center" | "right" {
  const t = cell.trim();
  const left = t.startsWith(":");
  const right = t.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  return "left";
}

function normalizeRow(row: string[], colCount: number) {
  const cells = row.slice(0, colCount);
  while (cells.length < colCount) cells.push("");
  return cells;
}

/** 判断 line + next 是否构成 GFM 表头 + 分隔行 */
export function looksLikeTableStart(line: string, next?: string) {
  if (!line.includes("|")) return false;
  if (!next) return false;
  const sep = next.trim();
  return (
    /^\|?\s*:?-{3,}.*?\|/.test(sep) ||
    /^:?-{3,}(\s*\|\s*:?-{3,})+\s*$/.test(sep)
  );
}

export function parseMarkdownTable(raw: string): MarkdownTable | null {
  const lines = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;
  const header = splitTableRow(lines[0]!);
  const sep = splitTableRow(lines[1]!);
  if (!isSeparatorRow(sep) || header.length === 0) return null;
  const aligns = sep.map(alignFromSep);
  const rows = lines
    .slice(2)
    .map((row) => normalizeRow(splitTableRow(row), header.length))
    .map((row) => row.map((cell) => decodeTableCellText(cell)));
  return {
    header: header.map((cell) => decodeTableCellText(cell)),
    aligns: normalizeRow(aligns, header.length) as TableAlign[],
    rows,
  };
}

export function serializeMarkdownTable(table: MarkdownTable) {
  const colCount = Math.max(0, table.header.length);
  if (!colCount) return "";
  const header = normalizeRow(table.header, colCount).map((cell) =>
    encodeTableCellText(cell),
  );
  const aligns = normalizeRow(table.aligns, colCount).map((align) => align || "left");
  const rows = table.rows.map((row) =>
    normalizeRow(row, colCount).map((cell) => encodeTableCellText(cell)),
  );
  const sep = aligns.map((align) => {
    switch (align) {
      case "center":
        return ":---:";
      case "right":
        return "---:";
      default:
        return "---";
    }
  });
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ];
  return lines.join("\n");
}

/** 将 GFM 表格源码渲染为 HTML；`tableClass` 默认 `cm-lp-table` */
export function mdTableToHtml(
  raw: string,
  tableClass = "cm-lp-table",
): string | null {
  const table = parseMarkdownTable(raw);
  if (!table) return null;
  const { header, aligns, rows } = table;
  const colCount = header.length;

  let html = `<table class="${tableClass}"><thead><tr>`;
  for (let i = 0; i < colCount; i++) {
    const align = aligns[i] ?? "left";
    html += `<th style="text-align:${align}">${escapeHtml(header[i] ?? "").replace(/\n/g, "<br>")}</th>`;
  }
  html += "</tr></thead><tbody>";
  for (const row of rows) {
    html += "<tr>";
    for (let i = 0; i < colCount; i++) {
      const align = aligns[i] ?? "left";
      html += `<td style="text-align:${align}">${escapeHtml(row[i] ?? "").replace(/\n/g, "<br>")}</td>`;
    }
    html += "</tr>";
  }
  html += "</tbody></table>";
  return html;
}
