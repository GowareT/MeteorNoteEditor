import assert from "node:assert/strict";
import { build } from "esbuild";

const result = await build({ stdin: { resolveDir: process.cwd(), contents: `
  export { EditorState, EditorSelection } from '@codemirror/state';
  export { markdown, markdownLanguage } from '@codemirror/lang-markdown';
  export { applyFormat, detectFormatMarksAtSelection } from './src/lib/cm6/mdFormat';
  export { parseMarkdownTable, serializeMarkdownTable } from './src/lib/mdTable';
` }, bundle:true, write:false, platform:"node", format:"esm", logLevel:"silent" });
const { EditorState, EditorSelection, markdown, markdownLanguage, applyFormat, detectFormatMarksAtSelection, parseMarkdownTable, serializeMarkdownTable } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
function editor(doc, word="组合文本") {
  const from = doc.indexOf(word);
  return { state: EditorState.create({doc, selection:EditorSelection.range(from,from+word.length), extensions:[markdown({base:markdownLanguage})]}), focus(){}, dispatch(spec){this.state=this.state.update(spec).state;} };
}
function select(view, word="组合文本") {
  const from=view.state.doc.toString().indexOf(word);
  assert.ok(from >= 0, view.state.doc.toString());
  view.dispatch({selection:EditorSelection.range(from,from+word.length)});
}
function permutations(items) { return items.length ? items.flatMap((item,i)=>permutations(items.filter((_,j)=>i!==j)).map(rest=>[item,...rest])) : [[]]; }
let count=0;
for (const prefix of ["", "> ", "> [!note:#fff6d6:lightbulb] ", "# "]) {
  const quote=prefix === "> ";
  for (const decoration of ["underline","strike"]) {
    const commands=["bold","italic",decoration,...(quote?[]:["color","highlight"])];
    for (const order of permutations(commands)) {
      const view=editor(prefix+"前文组合文本后文");
      for(const type of order) {
        select(view); applyFormat(view,{type,...(type==="color"?{color:"#ff3b30"}:type==="highlight"?{color:"#ffe1a6"}:{})});
      }
      select(view);
      const marks=detectFormatMarksAtSelection(view.state);
      for(const type of commands) assert.ok(marks[type], `${prefix} ${order}: missing ${type}: ${view.state.doc}`);
      assert.ok(view.state.doc.toString().startsWith(prefix));
      for (const type of [decoration,"italic","bold"]) { select(view); applyFormat(view,{type}); select(view); assert.ok(!detectFormatMarksAtSelection(view.state)[type], `remove ${type}: ${view.state.doc}`); }
      count++;
    }
  }
}
for (const first of ["underline","strike"]) {
  const view=editor("组合文本");
  for(const type of ["bold","italic",first,first==="underline"?"strike":"underline"]) { select(view); applyFormat(view,{type}); }
  select(view); const marks=detectFormatMarksAtSelection(view.state);
  assert.ok(marks.bold && marks.italic && !marks[first]);
}
const partial=editor("**前文组合文本后文**");
applyFormat(partial,{type:"bold"});
select(partial); assert.ok(!detectFormatMarksAtSelection(partial.state).bold);
select(partial,"前文"); assert.ok(detectFormatMarksAtSelection(partial.state).bold);
const table={header:["**粗体**","*斜体*"],aligns:["left","right"],rows:[["<u>***组合文本***</u>",'<mark style="background-color:#ffe1a6">A | B\n换行</mark>']]};
assert.deepEqual(parseMarkdownTable(serializeMarkdownTable(table)),table);
const quote=editor("> 组合文本");
applyFormat(quote,{type:"color",color:"#ff0000"}); assert.equal(quote.state.doc.toString(),"> 组合文本");
const multi=editor("> [!note:#fff6d6:lightbulb] 组合文本\n> 第二行");
multi.dispatch({selection:EditorSelection.range(0,multi.state.doc.length)});
applyFormat(multi,{type:"bold"});
assert.equal(multi.state.doc.toString(),"> [!note:#fff6d6:lightbulb] **组合文本**\n> **第二行**");
applyFormat(multi,{type:"bold"});
assert.equal(multi.state.doc.toString(),"> [!note:#fff6d6:lightbulb] 组合文本\n> 第二行");
console.log(`Passed: ${count} format permutations and removals, mutually exclusive decorations, partial selection, quote restrictions, table roundtrip.`);

for (const [source, cursor, expected, expectedCursor] of [
  ['', 0, '- [ ] ', 6],
  ['# 标题\n', 5, '# 标题\n- [ ] ', 11],
  ['正文', 0, '- [ ] 正文', 6],
  ['正文', 1, '- [ ] 正文', 7],
  ['正文', 2, '- [ ] 正文', 8],
  ['  正文', 2, '  - [ ] 正文', 8],
  ['- 正文', 0, '- [ ] 正文', 6],
  ['1. 正文', 4, '- [ ] 正文', 7],
  ['- [x] 正文', 7, '正文', 1],
  ['- [ ] ', 6, '', 0],
]) {
  const view=editor(source, '');
  view.dispatch({selection:EditorSelection.cursor(cursor)});
  applyFormat(view,{type:'todo'});
  assert.equal(view.state.doc.toString(), expected);
  assert.equal(view.state.selection.main.head, expectedCursor, `cursor: ${JSON.stringify(source)}`);
  assert.ok(view.state.selection.main.empty);
}
for (const reverse of [false,true]) {
  const view=editor('甲乙\n丙丁', '');
  view.dispatch({selection:EditorSelection.range(reverse?5:1,reverse?1:5)});
  applyFormat(view,{type:'todo'});
  assert.equal(view.state.doc.toString(), '- [ ] 甲乙\n- [ ] 丙丁');
  assert.equal(view.state.selection.main.anchor,reverse?17:7);
  assert.equal(view.state.selection.main.head,reverse?7:17);
}
console.log('Passed: task insertion, cursor preservation, list conversion, removal and forward/backward selections.');

const calloutPrefix='> [!note:#fff6d6:lightbulb] ';
for(const source of ['- [ ] 内容','- [x] 内容','  - [ ] 内容',calloutPrefix+'内容',
  '- [ ] '+calloutPrefix+'内容','- [ ] \\'+calloutPrefix+'内容']) {
  const view=editor(source,'内容');
  applyFormat(view,{type:'insert',kind:'callout'});
  assert.equal(view.state.doc.toString(),calloutPrefix+'内容');
  applyFormat(view,{type:'todo'});
  assert.equal(view.state.doc.toString(),'- [ ] 内容');
  assert.equal(view.state.selection.main.from,6);
  assert.equal(view.state.selection.main.to,8);
}
for(const source of [calloutPrefix+'内容','> 内容','- [ ] '+calloutPrefix+'内容', '- [ ] \\'+calloutPrefix+'内容']) {
  const view=editor(source,'内容');
  applyFormat(view,{type:'todo'});
  assert.equal(view.state.doc.toString(),'- [ ] 内容');
}
const emptyTask=editor('- [ ] ','');
emptyTask.dispatch({selection:EditorSelection.cursor(6)});
applyFormat(emptyTask,{type:'insert',kind:'callout'});
assert.equal(emptyTask.state.doc.toString(),calloutPrefix+'在这里输入内容');
const taskBlock=editor('前文\n- [ ] **甲**\n- [x] *乙*\n后文','');
taskBlock.dispatch({selection:EditorSelection.range(3,24)});
applyFormat(taskBlock,{type:'insert',kind:'callout'});
assert.equal(taskBlock.state.doc.toString(),'前文\n'+calloutPrefix+'**甲**\n> *乙*\n后文');
applyFormat(taskBlock,{type:'todo'});
assert.equal(taskBlock.state.doc.toString(),'前文\n- [ ] **甲**\n- [ ] *乙*\n后文');
const partialTask=editor('- [ ] 前文**内容**后文','内容');
applyFormat(partialTask,{type:'insert',kind:'callout'});
assert.equal(partialTask.state.doc.toString(),calloutPrefix+'前文**内容**后文');
const inlineHighlight=editor('- [ ] 内容','内容');
applyFormat(inlineHighlight,{type:'highlight',color:'#ffe1a6'});
assert.ok(inlineHighlight.state.doc.toString().startsWith('- [ ] '));
assert.ok(inlineHighlight.state.doc.toString().includes('<mark'));
console.log('Passed: task/callout exclusivity, existing malformed prefixes, partial and multiline conversions, inline highlight compatibility.');

// Paragraph commands preserve text, inline formatting, containers and selection.
for (const [source, expectedHeading, expectedBody] of [
  ['内容', '## 内容', '内容'],
  ['### **内容**', '## **内容**', '**内容**'],
  ['###### 内容 ###', '## 内容', '内容'],
  ['> 内容', '> ## 内容', '> 内容'],
  ['- 内容', '- ## 内容', '- 内容'],
  ['内容\n===', '## 内容', '内容'],
]) {
  const view = editor(source, '内容');
  applyFormat(view, { type: 'heading', level: 2 });
  assert.equal(view.state.doc.toString(), expectedHeading);
  assert.equal(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to), '内容');
  assert.equal(detectFormatMarksAtSelection(view.state).heading, 2);
  applyFormat(view, { type: 'heading', level: 2 });
  assert.equal(view.state.doc.toString(), expectedHeading, 'Selecting the same level must be idempotent');
  applyFormat(view, { type: 'heading', level: 0 });
  assert.equal(view.state.doc.toString(), expectedBody);
  assert.equal(detectFormatMarksAtSelection(view.state).heading, 0);
}
for (const reverse of [false, true]) {
  const view = editor('甲乙\n### 丙丁\n末行', '');
  view.dispatch({selection:EditorSelection.range(reverse?9:1,reverse?1:9)});
  assert.equal(detectFormatMarksAtSelection(view.state).heading, undefined);
  applyFormat(view, {type:'heading',level:1});
  assert.equal(view.state.doc.toString(), '# 甲乙\n# 丙丁\n末行');
  assert.equal(view.state.selection.main.anchor, reverse?9:3);
  assert.equal(view.state.selection.main.head, reverse?3:9);
}
for (const level of [1, 2, 3, 0]) {
  const view = editor('', '');
  applyFormat(view, {type:'heading',level});
  assert.equal(view.state.doc.toString(), level?'#'.repeat(level)+' ':'');
  assert.equal(view.state.selection.main.head, view.state.doc.length);
}
for (const source of ['```md\n# 内容\n```', '    # 内容']) {
  const view = editor(source, '内容');
  applyFormat(view, {type:'heading',level:2});
  assert.equal(view.state.doc.toString(), source, 'Code contents must remain literal');
}
const readonlyHeading = editor('内容', '内容');
readonlyHeading.state = EditorState.create({doc:'内容',extensions:[EditorState.readOnly.of(true)]});
applyFormat(readonlyHeading, {type:'heading',level:1});
assert.equal(readonlyHeading.state.doc.toString(), '内容');
console.log('Passed: heading levels, body text, idempotence, inline formatting, containers, Setext conversion, selection direction, empty lines and code/read-only protection.');
