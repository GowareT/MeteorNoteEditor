import type { MarkdownConfig } from '@lezer/markdown';
import { syntaxTree } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { Text, type EditorState } from '@codemirror/state';
import type { Tree } from '@lezer/common';

export type TextAlign = 'left' | 'center' | 'right';
export const ALIGN_OPEN_RE = /^<div\s+align=["'](left|center|right)["'](?:\s+style=["'][^"']*["'])?>\s*$/i;
export const ALIGN_CLOSE_RE = /^<\/div>\s*$/i;
const isBoundary = (text: string) => ALIGN_OPEN_RE.test(text.trim()) || ALIGN_CLOSE_RE.test(text.trim());

// Alignment is a Markdown container, not an opaque HTML block. Its contents
// must still produce headings, lists, tables and inline formatting nodes.
export const alignmentMarkdown: MarkdownConfig = {
  defineNodes: ['AlignmentBoundary'],
  parseBlock: [{
    name: 'AlignmentBoundary',
    before: 'HTMLBlock',
    parse(context, line) {
      if (!isBoundary(line.text)) return false;
      context.addElement(context.elt('AlignmentBoundary', context.lineStart, context.lineStart + line.text.length));
      context.nextLine();
      return true;
    },
    endLeaf: (_context, line) => isBoundary(line.text),
  }],
};

export const alignmentParser = markdown({base: markdownLanguage, extensions: [alignmentMarkdown]}).language.parser;

export type AlignmentBlock = {
  from: number; to: number; openLine: number; closeLine: number;
  innerFrom: number; innerTo: number; align: TextAlign;
};

export function alignmentBlocks(state: EditorState): AlignmentBlock[] {
  return collectAlignmentBlocks(state.doc, syntaxTree(state));
}

export function sourceAlignmentBlocks(source: string): AlignmentBlock[] {
  return collectAlignmentBlocks(Text.of(source.split('\n')), alignmentParser.parse(source));
}

function collectAlignmentBlocks(doc: Text, tree: Tree): AlignmentBlock[] {
  const stack: Array<{from: number; line: number; align: TextAlign}> = [];
  const blocks: AlignmentBlock[] = [];
  tree.iterate({enter(node) {
    if (node.name !== 'AlignmentBoundary') return;
    const line = doc.lineAt(node.from);
    const open = ALIGN_OPEN_RE.exec(line.text.trim());
    if (open) stack.push({from: line.from, line: line.number, align: open[1]!.toLowerCase() as TextAlign});
    else if (ALIGN_CLOSE_RE.test(line.text.trim())) {
      const start = stack.pop();
      if (start) blocks.push({
        from: start.from, to: line.to, openLine: start.line, closeLine: line.number,
        innerFrom: doc.line(start.line + 1).from,
        innerTo: doc.line(Math.max(start.line + 1, line.number - 1)).to,
        align: start.align,
      });
    }
  }});
  return blocks.sort((a, b) => a.from - b.from || b.to - a.to);
}

export function lineAlignment(blocks: readonly AlignmentBlock[], line: number): TextAlign {
  let align: TextAlign = 'left';
  for (const block of blocks) if (line > block.openLine && line < block.closeLine) align = block.align;
  return align;
}
