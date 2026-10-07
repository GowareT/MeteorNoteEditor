import { markdownLanguage } from "@codemirror/lang-markdown";

export type OutlineHeading = { id: string; level: number; text: string; offset: number };

export function parseOutlineHeadings(markdown: string): OutlineHeading[] {
  const headings: OutlineHeading[] = [];
  markdownLanguage.parser.parse(markdown).iterate({
    enter(node) {
      const match = /^(?:ATX|Setext)Heading([1-6])$/.exec(node.name);
      if (!match) return;
      const text = markdown.slice(node.from, node.to).trim()
        .replace(/^#{1,6}[\t ]+/, "")
        .replace(/[\t ]+#+[\t ]*$/, "")
        .replace(/\r?\n[\t ]*[=-]+[\t ]*$/, "")
        .replace(/\[\[([^\[\]]+)\]\]/g, "$1")
        .replace(/[*_`]/g, "")
        .trim();
      headings.push({ id: `h-${node.from}`, level: Number(match[1]), text, offset: node.from });
    },
  });
  return headings;
}
