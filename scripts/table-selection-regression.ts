import {EditorState} from '@codemirror/state';
import {EditorView, keymap} from '@codemirror/view';
import {markdown, markdownLanguage} from '@codemirror/lang-markdown';
import {history, historyKeymap, undo, redo} from '@codemirror/commands';
import {livePreviewExtension} from '../src/lib/cm6/livePreview';
import {meteorNoteEditorTheme} from '../src/lib/cm6/theme';
import {tableCellRange} from '../src/lib/cm6/tableSelection';
import {getActiveEditorToolbarTarget} from '../src/lib/editorToolbarTarget';
import '../src/components/NoteMarkdownEditor.css';
import '../src/styles/tokens.css';

const table = '| A | B | C |\n| --- | --- | --- |\n| one | two | three |\n| four | five | six |';
const source = `Before\n\n${table}\n\nAfter`;
const tick = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const create = (doc = source, readOnly = false) => {
  const host = document.createElement('div');
  host.className = `mn-cm-editor ${readOnly ? 'is-reading' : ''}`;
  host.style.cssText = 'width:720px;max-width:95vw;margin:16px 0';
  document.querySelector('#fixtures')!.append(host);
  return new EditorView({parent:host, state:EditorState.create({doc, extensions:[
    markdown({base:markdownLanguage}), history(), keymap.of(historyKeymap),
    EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly),
    livePreviewExtension(), meteorNoteEditorTheme(15,false),
  ]})});
};
const cell = (view:EditorView, key:string) => view.dom.querySelector<HTMLElement>(`[data-cell="${key}"]`)!;
const wrap = (view:EditorView) => view.dom.querySelector<HTMLElement>('.cm-lp-table-wrap')!;
const count = (view:EditorView) => view.dom.querySelectorAll('[data-cell].is-selected').length;
const down = (target:HTMLElement, shiftKey=false) => {
  const rect=target.getBoundingClientRect();
  target.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0,buttons:1,shiftKey,clientX:rect.left+15,clientY:rect.top+15}));
};
const up = () => window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,button:0}));
const choose = (view:EditorView, first:string, last:string) => {down(cell(view,first)); up(); down(cell(view,last),true); up();};
const key = (target:HTMLElement, value:string, extra:KeyboardEventInit={}) => target.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true,...extra}));
const action = (view:EditorView, label:string) => Array.from(view.dom.querySelectorAll<HTMLButtonElement>('.cm-lp-table-controls button')).find(b=>b.textContent===label)!.click();
const dispose = (view:EditorView) => {const host=view.dom.parentElement!; view.destroy();host.remove();};
create();

document.querySelector('#run')!.addEventListener('click',async()=>{
  const checks:string[]=[], failures:string[]=[];
  const check=(ok:boolean,label:string)=>(ok?checks:failures).push(label);
  const views:EditorView[]=[];
  const make=(doc=source,readOnly=false)=>{const view=create(doc,readOnly);views.push(view);return view;};
  try {
    let view=make(); await tick();
    choose(view,'1:0','1:1');
    check(count(view)===2,'Shift-click selects two cells');
    wrap(view).dispatchEvent(new MouseEvent('mouseleave'));
    check(count(view)===2,'Selection survives mouse leaving table');
    key(wrap(view),'Backspace'); await tick();
    check(view.state.doc.toString().includes('|  |  | three |'),'Partial selection clears only selected contents');
    check(view.state.doc.toString().startsWith('Before\n\n')&&view.state.doc.toString().endsWith('\n\nAfter'),'Partial deletion preserves surrounding prose');
    undo(view); await tick(); check(view.state.doc.toString()===source,'Undo restores cell contents');
    redo(view); await tick(); check(!view.state.doc.toString().includes('one'),'Redo clears the same cells');
    undo(view); await tick();
    action(view,'全选表格'); check(count(view)===9,'Select-table button selects every cell');
    key(wrap(view),'Delete'); await tick();
    check(!view.dom.querySelector('table')&&view.state.doc.toString()==='Before\n\n\n\nAfter','Delete removes only the whole table');
    undo(view); await tick(); check(view.state.doc.toString()===source&&count(view)===0,'Undo restores whole table without stale selection');
    action(view,'删除表格'); await tick(); check(!view.dom.querySelector('table'),'Delete-table button works without first selecting cells');

    view=make(); await tick();
    const editor=EditorView.findFromDOM(cell(view,'1:0').querySelector('.cm-content')!)!;
    editor.focus(); editor.dispatch({selection:{anchor:1}});
    const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? {metaKey:true} : {ctrlKey:true};
    key(editor.contentDOM,'a',mod);
    check(editor.state.selection.main.from===0&&editor.state.selection.main.to===3&&count(view)===1,'First Mod-A selects text in one cell');
    key(editor.contentDOM,'a',mod);
    check(count(view)===9,'Second Mod-A selects the whole table');
    key(wrap(view),'Escape'); check(count(view)===1&&editor.hasFocus,'Escape returns to cell editing');
    editor.dispatch({changes:{from:0,to:3,insert:'edited'}});
    choose(view,'1:0','2:1');
    await new Promise(resolve=>setTimeout(resolve,180)); await tick();
    check(count(view)===4,'Pending cell save preserves multiple-cell selection');
    key(wrap(view),'Delete'); await tick(); undo(view); await tick();
    check(view.state.doc.toString().includes('edited'),'Undo multi-cell deletion preserves latest unsaved typing');

    view=make(); await tick(); view.dom.scrollIntoView(); await tick();
    down(cell(view,'0:0')); const target=cell(view,'2:1'), rect=target.getBoundingClientRect();
    target.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,cancelable:true,buttons:1,clientX:rect.left+15,clientY:rect.top+15})); up();
    check(count(view)===6,'Dragging across cells selects a rectangle');
    document.body.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
    check(count(view)===0,'Clicking outside clears selection');

    const meta='\n<!-- mn-table '+encodeURIComponent(JSON.stringify({cells:{'1:0':{colSpan:2},'1:1':{hidden:true}}}))+' -->';
    view=make(`Before\n\n${table}${meta}\n\nAfter`); await tick();
    choose(view,'0:0','1:0'); check(count(view)===3,'Merged-cell selection expands to complete cells');
    action(view,'全选表格'); key(wrap(view),'Delete'); await tick();
    check(view.state.doc.toString()==='Before\n\n\n\nAfter','Whole-table delete also removes hidden table metadata');
    undo(view); await tick(); check(view.state.doc.toString().includes(meta),'Undo restores merge metadata');
    const range=tableCellRange({row:0,col:0},{row:1,col:0},[{row:1,col:0,rowSpan:1,colSpan:2},{row:0,col:1,rowSpan:3,colSpan:1}]);
    check(range.bottom===2&&range.right===1,'Intersecting merged cells expand selection transitively');

    view=make(); await tick(); choose(view,'1:0','1:1');
    getActiveEditorToolbarTarget()?.applyFormat({type:'bold'}); await tick();
    check(view.state.doc.toString().includes('| **one** | **two** | three |')&&count(view)===2,'Formatting applies to every selected cell and preserves selection');
    getActiveEditorToolbarTarget()?.applyFormat({type:'align',align:'right'}); await tick();
    check(cell(view,'1:0').style.textAlign==='right'&&cell(view,'1:1').style.textAlign==='right'&&cell(view,'1:2').style.textAlign!=='right','Alignment changes only selected cells');
    down(cell(view,'2:0')); up(); down(cell(view,'2:0'),true); up();
    check(!cell(view,'2:0').hasAttribute('aria-selected'),'Shift-click within a single cell keeps native text selection');

    view=make(); await tick(); choose(view,'1:0','2:1');
    action(view,'合并所选单元格'); await tick();
    const merged=cell(view,'1:0') as HTMLTableCellElement;
    check(merged.colSpan===2&&merged.rowSpan===2,'Multi-cell merge creates a rectangular span');
    check(['one','two','four','five'].every(text=>merged.textContent!.includes(text)),'Multi-cell merge keeps every cell content');
    check(!view.dom.querySelector('[data-cell="1:1"]')&&cell(view,'1:2').textContent!.includes('three'),'Merged cells hide only the selected region');
    undo(view); await tick(); check(view.state.doc.toString()===source,'Undo restores all original cells and content after merge');
    choose(view,'0:0','1:1');
    check(Array.from(view.dom.querySelectorAll<HTMLButtonElement>('.cm-lp-table-controls button')).find(b=>b.textContent==='合并所选单元格')!.disabled,'Cross-header merge is disabled rather than creating invalid row spans');
    choose(view,'0:0','0:1'); action(view,'合并所选单元格'); await tick();
    check((cell(view,'0:0') as HTMLTableCellElement).colSpan===2&&cell(view,'0:0').textContent!.includes('B'),'Header cells can merge horizontally');
    undo(view); await tick();
    choose(view,'1:0','2:1');
    cell(view,'1:0').querySelector<HTMLButtonElement>('.cm-lp-table-cell-trigger')!.click();
    Array.from(view.dom.querySelectorAll<HTMLButtonElement>('.cm-lp-table-actions button')).find(b=>b.textContent==='合并所选单元格')!.click();
    await tick(); check((cell(view,'1:0') as HTMLTableCellElement).rowSpan===2,'Cell menu keeps the multi-selection when merging');

    view=make(source,true); await tick();
    choose(view,'0:0','2:2'); key(wrap(view),'Delete'); await tick();
    check(view.state.doc.toString()===source,'Read-only selection cannot delete content');
    check(!view.dom.querySelector('.cm-lp-table-controls'),'Read-only table has no destructive controls');
  } catch(error) {failures.push(String(error));}
  finally {views.forEach(dispose);}
  document.querySelector('#result')!.textContent=JSON.stringify({passed:failures.length===0,checks,failures},null,2);
});
