import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({stdin:{resolveDir:process.cwd(),contents:`
export { EditorState, EditorSelection } from '@codemirror/state';
export { markdown, markdownLanguage } from '@codemirror/lang-markdown';
export { syntaxTree } from '@codemirror/language';
export { alignmentMarkdown, alignmentBlocks, lineAlignment } from './src/lib/cm6/alignment';
export { applyFormat, detectFormatMarksAtSelection } from './src/lib/cm6/mdFormat';
export { parseOutlineHeadings } from './src/lib/outline';
`},bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
const { EditorState, EditorSelection, markdown, markdownLanguage, syntaxTree, alignmentMarkdown, alignmentBlocks, lineAlignment, applyFormat, detectFormatMarksAtSelection, parseOutlineHeadings } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const editor = (doc, anchor=0, head=anchor) => ({state:EditorState.create({doc,selection:EditorSelection.range(anchor,head),extensions:[markdown({base:markdownLanguage,extensions:[alignmentMarkdown]})]}),focus(){},dispatch(spec){this.state=this.state.update(spec).state;}});
const align=(view,value)=>applyFormat(view,{type:'align',align:value});
const wrap=(body,align='center')=>`<div align="${align}" style="text-align:${align}">\n${body}\n</div>`;
let checks=0;
for (const source of ['前文中间后文','前文中间后文\n下一行','# 标题\n\n前文中间后文\n下一行','']) {
  const start=Math.max(0,source.indexOf('中间'));
  for(const [anchor,head] of [[start,start],[start,start+(source?'中间'.length:0)],[start+(source?'中间'.length:0),start]]) {
    const view=editor(source,anchor,head);
    const selected=source.slice(Math.min(anchor,head),Math.max(anchor,head));
    for(const value of ['center','center','right','right','left','center','left']) {
      align(view,value);
      const selection=view.state.selection.main;
      assert.equal(view.state.doc.sliceString(selection.from,selection.to),selected);
      assert.equal(selection.anchor>selection.head,anchor>head);
      assert.equal(detectFormatMarksAtSelection(view.state).align,value);
      assert.equal(alignmentBlocks(view.state).length,value==='left'?0:1);
      checks++;
    }
    assert.equal(view.state.doc.toString(),source);
    assert.equal(view.state.selection.main.anchor,anchor);
    assert.equal(view.state.selection.main.head,head);
  }
}
const multiline=editor('第一行\n第二行\n第三行',0,8);
align(multiline,'center');
let source=multiline.state.doc.toString();
let position=source.indexOf('第二行');
multiline.dispatch({selection:EditorSelection.cursor(position+1)});
align(multiline,'right');
assert.equal(multiline.state.doc.toString(),wrap('第一行')+'\n'+wrap('第二行','right')+'\n第三行');
assert.equal(detectFormatMarksAtSelection(multiline.state).align,'right');
align(multiline,'left');
assert.equal(multiline.state.doc.toString(),wrap('第一行')+'\n第二行\n第三行');
checks+=3;
const nested=editor(wrap('外层\n'+wrap('内层','right')+'\n末尾'));
assert.equal(alignmentBlocks(nested.state).length,2);
assert.equal(lineAlignment(alignmentBlocks(nested.state),4),'right');
checks+=2;
const body='## 小标题\n\n**粗体**\n\n- 无序一\n- 无序二\n\n1. 有序一\n2. 有序二\n\n| A | B |\n| --- | --- |\n| C | D |\n\n```md\n<div align="right">\n代码\n</div>\n```';
const view=editor(wrap(body));
assert.equal(alignmentBlocks(view.state).length,1);
const tree=syntaxTree(view.state).toString();
for (const name of ['ATXHeading2','StrongEmphasis','BulletList','OrderedList','Table','FencedCode']) assert.ok(tree.includes(name),`${name}: ${tree}`);
assert.deepEqual(parseOutlineHeadings(view.state.doc.toString()).map(h=>h.text),['小标题']);
checks+=8;
for(const block of ['```md\n代码\n```','| A | B |\n| --- | --- |\n| C | D |','- 一级\n  - 二级\n    - 三级\n- 末项','1. 首项\n2. 第二项\n3. 末项','> 引用\n> 第二行']) {
  const source='# 标题\n\n'+block+'\n\n后文';
  const v=editor(source,source.indexOf(block)+Math.floor(block.length/2));
  align(v,'center');assert.equal(v.state.doc.toString(),'# 标题\n\n'+wrap(block)+'\n\n后文');
  align(v,'left');assert.equal(v.state.doc.toString(),source);checks+=2;
}
const literal=editor('```html\n'+wrap('字面标签')+'\n```');
assert.equal(alignmentBlocks(literal.state).length,0);checks++;
const title=editor('# 标题\n\n正文',2);align(title,'right');assert.equal(title.state.doc.toString(),'# 标题\n\n正文');checks++;
console.log(`Passed ${checks} alignment checks: paragraph and selection preservation, repeated switching, nested containers, Markdown parsing, outline, tables and fenced code.`);
