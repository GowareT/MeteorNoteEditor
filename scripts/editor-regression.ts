import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { CompletionContext } from '@codemirror/autocomplete';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { livePreviewExtension } from '../src/lib/cm6/livePreview';
import { applyFormat } from '../src/lib/cm6/mdFormat';
import { slashCompletions } from '../src/lib/cm6/slashCommands';
import { getActiveEditorToolbarTarget } from '../src/lib/editorToolbarTarget';
import { SimpleMarkdown } from '../src/components/SimpleMarkdown';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { meteorNoteEditorTheme } from '../src/lib/cm6/theme';
import { defaultKeymap, undo } from '@codemirror/commands';
import { language } from '@codemirror/language';
import { alignmentMarkdown } from '../src/lib/cm6/alignment';
import { markdownEditingKeymap } from '../src/lib/cm6/markdownEditingKeys';
import '../src/components/NoteMarkdownEditor.css';
import '../src/components/EditorMedia.css';
import '../src/styles/tokens.css';

const parent=document.querySelector('#fixtures')!;
const results=document.querySelector('#results')!;
const create=(doc:string,inline=false,fontSize=16,readOnly=false)=> {
  const host=document.createElement('div');host.className='mn-cm-editor';host.style.cssText='width:750px;max-width:95vw;min-height:100px;margin:20px 0';parent.append(host);
  if(readOnly) host.classList.add('is-reading');
  return new EditorView({parent:host,state:EditorState.create({doc,extensions:[EditorState.readOnly.of(readOnly),EditorView.editable.of(!readOnly),EditorState.transactionFilter.of(tr=>readOnly&&tr.docChanged?[]:tr),markdown({base:markdownLanguage,extensions:[alignmentMarkdown]}),livePreviewExtension(null,null,inline),meteorNoteEditorTheme(fontSize,false),keymap.of([...markdownEditingKeymap,...defaultKeymap]),EditorView.lineWrapping]})});
};
const layoutTests=document.createElement('button');
layoutTests.textContent='Run table and list layout tests';
results.before(layoutTests);
layoutTests.addEventListener('click',async()=>{
  layoutTests.disabled=true;
  const checks:string[]=[]; const failures:string[]=[];
  const table='| 列一 | 列二 |\n| --- | --- |\n| 内容 | 内容 |';
  const tick=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  const check=(condition:boolean,label:string)=>{ (condition?checks:failures).push(label); };
  const dispose=(view:EditorView)=>{const host=view.dom.parentElement!;view.destroy();host.remove();};
  try {
    const doc=`前文\n\n${table}\n\n后文`;
    const view=create(doc);
    await tick();
    const blanks=Array.from(view.contentDOM.children).filter(el=>el.classList.contains('cm-line')&&!el.textContent).length;
    check(blanks===2,`table has only source blank lines (actual ${blanks})`);
    dispose(view);
    for(const [label,source,position,key] of [
      ['Backspace before table',`前文\n\n${table}`,3,'Backspace'],
      ['Delete before table',`前文\n\n${table}`,3,'Delete'],
      ['Backspace after table',`${table}\n\n`,table.length+1,'Backspace'],
      ['Delete after table',`${table}\n\n`,table.length+1,'Delete'],
    ] as const) {
      const editor=create(source);
      editor.dispatch({selection:EditorSelection.cursor(position)});
      editor.focus();
      editor.contentDOM.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
      await tick();
      check(editor.state.doc.toString()===source.replace('\n\n','\n'),`${label}: removes exactly one blank line`);
      check(editor.state.doc.toString().includes(table),`${label}: deleting blank line preserves table source`);
      check(editor.dom.querySelectorAll('table.cm-lp-table').length===1,`${label}: deleting blank line preserves table preview`);
      dispose(editor);
    }
    for(const fontSize of [13,16,20]) for(const width of [320,750]) {
      const source=`${table}\n\n正文第一行\n正文第二行\n\n- 无序第一行\n- 无序第二行\n\n1. 有序第一行\n2. 有序第二行\n\n- 长列表${'很长的列表内容'.repeat(12)}\n- 最后一行\n`;
      const editor=create(source,false,fontSize);
      editor.dom.parentElement!.style.width=`${width}px`;
      editor.dom.scrollIntoView();
      await tick();
      const lines=Array.from(editor.contentDOM.children).filter((el):el is HTMLElement=>el instanceof HTMLElement&&el.classList.contains('cm-line'));
      const paragraph=lines.find(el=>el.textContent==='正文第一行')!;
      for(const text of ['无序第一行','无序第二行','有序第一行','有序第二行']) {
        const line=lines.find(el=>el.textContent?.endsWith(text))!;
        check(Math.abs(line.getBoundingClientRect().height-paragraph.getBoundingClientRect().height)<1,`${fontSize}px/${width}px: ${text} matches paragraph height`);
      }
      for(const line of lines.filter(el=>el.textContent?.includes('第一行')||el.textContent?.includes('第二行')||el.textContent?.includes('长列表')||el.textContent?.includes('最后一行'))) {
        line.scrollIntoView({block:'center'});
        await tick();
        const text=Array.from(line.childNodes).find(node=>node.nodeType===Node.TEXT_NODE&&node.textContent!.trim().length>0)!;
        const offset=Math.min(2,text.textContent!.length-1);
        const range=document.createRange();range.setStart(text,offset);range.setEnd(text,offset+1);
        const bounds=range.getBoundingClientRect();
        const expected=source.indexOf(text.textContent!)+offset;
        const actual=editor.posAtCoords({x:bounds.left+1,y:(bounds.top+bounds.bottom)/2});
        check(actual!=null&&Math.abs(actual-expected)<=1,`${fontSize}px/${width}px: mouse hits ${text.textContent!.slice(0,8)} (expected ${expected}, actual ${actual})`);
      }
      dispose(editor);
    }
  } catch(error) { failures.push(String(error)); }
  finally {layoutTests.disabled=false;results.textContent=JSON.stringify({passed:checks.length,failures},null,2);}
});
const consistencyTests=document.createElement('button');
consistencyTests.textContent='Run reading consistency tests';
results.before(consistencyTests);
consistencyTests.addEventListener('click',async()=>{
  const checks:string[]=[]; const failures:string[]=[];
  const cases=[
    '# 标题\n\n***组合*** <u>**下划线**</u> ~~***删除线***~~\n\n末行',
    '# 标题\n\n> 引用 **粗体** *斜体*\n> 第二行\n\n末行',
    '# 标题\n\n> [!note:#fff6d6:lightbulb] <mark style="background-color:#ffeeaa"><span style="color:#ff3b30">***组合***</span></mark>\n\n末行',
    '# 标题\n\n1. 项目 **粗体**\n   - 嵌套\n- [ ] 未完成\n- [x] 已完成\n\n末行',
    '# 标题\n\n```javascript\nconst a = 1;\nconsole.log(a);\n```\n\n末行',
    '# 标题\n\n| 标题 | 内容 |\n| --- | --- |\n| ***组合*** | <u>**测试**</u> |\n\n末行',
  ];
  for(const source of cases){
    const live=create(source), reader=create(source,false,16,true);
    const hosts=[live.dom.parentElement!,reader.dom.parentElement!];
    try {
      live.dispatch({selection:EditorSelection.cursor(source.length)});
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const text=(view:EditorView)=>view.contentDOM.textContent;
      if(text(live)!==text(reader)) throw Error('visible content mismatch: '+text(reader));
      for(const selector of ['.cm-lp-strong','.cm-lp-em','.cm-lp-strike','.cm-lp-taskbox','.cm-lp-table','.cm-lp-callout-head-widget']) {
        if(live.dom.querySelectorAll(selector).length!==reader.dom.querySelectorAll(selector).length) throw Error('format mismatch '+selector);
      }
      reader.dispatch({changes:{from:0,insert:'forbidden'}});
      for(const cell of reader.dom.querySelectorAll('.cm-lp-cell-editor .cm-editor')) {
        const inner=EditorView.findFromDOM(cell)!;
        const before=inner.state.doc.toString(); inner.dispatch({changes:{from:0,insert:'forbidden'}});
        if(inner.state.doc.toString()!==before)throw Error('reading table remained editable');
      }
      (reader.dom.querySelector('.cm-lp-taskbox') as HTMLButtonElement|null)?.click();
      if(reader.state.doc.toString()!==source) throw Error('reader changed source');
      checks.push(source.split('\n')[2]);
    }catch(error){failures.push(String(error));}
    finally {live.destroy();reader.destroy();hosts.forEach(host=>host.remove());}
  }
  results.textContent=JSON.stringify({checks,failures},null,2);
});
const taskTests=document.createElement('button');
taskTests.textContent='Run task layout tests';
results.before(taskTests);
taskTests.addEventListener('click',async()=>{
  taskTests.disabled=true;
  let passed=0, maxShift=0, maxCenterOffset=0;
  const failures:string[]=[];
  const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  for(const size of [13,16,20]) for(const width of [240,750]) {
    for(const body of ['待办事项','**加粗待办**','*斜体待办*','多行待办内容，检查自动换行后的方框和正文位置。'.repeat(4),'']) {
      const source=`- [ ] ${body}\n- [ ] 后续任务`;
      const view=create(source,false,size), host=view.dom.parentElement!;
      host.style.width=`${width}px`;
      const measure=()=>{
        const rows=view.dom.querySelectorAll<HTMLElement>('.cm-lp-task-item');
        const row=rows[0].getBoundingClientRect();
        const box=rows[0].querySelector('.cm-lp-taskbox')!.getBoundingClientRect();
        const walker=document.createTreeWalker(rows[0],NodeFilter.SHOW_TEXT);
        let text:Node|null=null;
        while((text=walker.nextNode())) if(text.textContent?.trim() && !text.parentElement?.closest('button')) break;
        const range=document.createRange();
        if(text) range.selectNodeContents(text);
        if(text) {
          const textRect=range.getClientRects()[0];
          const offset=Math.abs((box.top+box.bottom-textRect.top-textRect.bottom)/2);
          maxCenterOffset=Math.max(maxCenterOffset,offset);
          if(offset>1) throw new Error(`checkbox is off text center by ${offset}px`);
        }
        return [box.top-row.top,box.left-row.left,box.width,box.height,row.height,
          rows[1].getBoundingClientRect().top-row.top,text?range.getBoundingClientRect().top-row.top:0];
      };
      try {
        await frame();
        const baseline=measure();
        for(let toggle=0;toggle<4;toggle++) {
          view.dom.querySelector<HTMLButtonElement>('.cm-lp-taskbox')!.click();
          await frame();
          const checked=view.dom.querySelector('.cm-lp-taskbox')!.classList.contains('is-checked');
          if(checked !== (toggle%2===0)) throw new Error('checkbox did not toggle');
          const shift=Math.max(...measure().map((value,index)=>Math.abs(value-baseline[index])));
          maxShift=Math.max(maxShift,shift);
          if(shift>0.1) throw new Error(`layout shifted ${shift}px`);
        }
        if(view.state.doc.toString()!==source) throw new Error('task text changed');
        passed++;
      } catch(error) { failures.push(`${size}px / ${width}px / ${body.slice(0,12)}: ${error}`); }
      finally { view.destroy();host.remove(); }
    }
  }
  results.textContent=JSON.stringify({passed,maxShift,maxCenterOffset,failures},null,2);
  taskTests.disabled=false;
});
const permutations=(items:string[]):string[][]=>items.length ? items.flatMap((item,i)=>permutations(items.filter((_,j)=>i!==j)).map(rest=>[item,...rest])):[[]];
document.querySelector('#run')!.addEventListener('click',()=>{
  let passed=0;const failures:string[]=[];
  for (const inline of [false,true]) {
  const view=create('',inline);
  for(const prefix of inline ? [''] : ['', '> ', '> [!note:#fff6d6:lightbulb] ']) {
    for(const decor of ['underline','strike']) {
      for(const order of permutations(['bold','italic',decor,...(prefix==='> '?[]:['color','highlight'])])) {
        view.dispatch({changes:{from:0,to:view.state.doc.length,insert:prefix+'前文组合文本后文'}});
        for(const type of order) {
          const from=view.state.doc.toString().indexOf('组合文本');
          view.dispatch({selection:EditorSelection.range(from,from+4)});
          applyFormat(view,{type,color:type==='color'?'#ff3b30':'#ffe1a6'} as Parameters<typeof applyFormat>[1]);
        }
        const visible=view.contentDOM.textContent || '';
        if(/[~*<>]|\[!/.test(visible)) failures.push(`${prefix} ${order}: ${visible}`); else passed++;
        const reading = document.createElement('div');
        reading.innerHTML=renderToStaticMarkup(createElement(SimpleMarkdown,{source:view.state.doc.toString()}));
        if (/[~*<>]|\[!/.test(reading.textContent || '')) failures.push(`reader ${prefix} ${order}: ${reading.textContent}`);
      }
    }
  }
  view.destroy();view.dom.parentElement?.remove();
  }
  results.textContent=JSON.stringify({passed,failures},null,2);
});
document.querySelector('#interactions')!.addEventListener('click',async()=>{
  const checks:string[]=[];
  const expect=(condition:unknown,label:string)=>{if(!condition)throw new Error(label);checks.push(label);};
  const checkLiteralBrackets = () => { for (const inline of [false, true]) {
    const literal = create('[[保留原文]] [普通链接](https://example.com)', inline);
    const host = literal.dom.parentElement!;
    try {
      expect(literal.contentDOM.textContent?.includes('[[保留原文]]'), `literal brackets stay visible, inline=${inline}`);
      expect(literal.dom.querySelectorAll('.cm-lp-link').length === 1, `only ordinary links are styled, inline=${inline}`);
      expect(literal.state.doc.toString() === '[[保留原文]] [普通链接](https://example.com)', `rendering keeps source intact, inline=${inline}`);
    } finally { literal.destroy(); host.remove(); }
  } };
  const tick=()=>new Promise(resolve=>setTimeout(resolve,180));
  const view=create('前文\n\n| 标题 | 标题2 |\n| --- | --- |\n| 组合文本 | 其他内容 |\n\n正文');
  try {
    checkLiteralBrackets();
    for(const route of ['toolbar','slash']) {
      const task=create(route==='slash'?'/':'');
      const host=task.dom.parentElement!;
      try {
        if(route==='toolbar') applyFormat(task,{type:'todo'});
        else {
          task.dispatch({selection:EditorSelection.cursor(1)});
          const result=slashCompletions()(new CompletionContext(task.state,1,true))!;
          const completion=result.options.find(option=>option.label==='/任务')!;
          if(typeof completion.apply==='function') completion.apply(task,completion,0,1);
        }
        task.focus();task.dom.scrollIntoView();await tick();
        expect(task.state.selection.main.head===6,`${route}: task cursor is after Markdown prefix`);
        const box=task.dom.querySelector<HTMLButtonElement>('.cm-lp-taskbox')!;
        expect(task.coordsAtPos(6)!.left>=box.getBoundingClientRect().right,`${route}: caret is visually right of checkbox`);
        box.click();await tick();
        expect(task.coordsAtPos(task.state.selection.main.head)!.left>=task.dom.querySelector('.cm-lp-taskbox')!.getBoundingClientRect().right,`${route}: completing task keeps caret on right`);
        task.dispatch(task.state.replaceSelection('待办内容'));
        expect(task.state.doc.toString()==='- [x] 待办内容',`${route}: typing adds text after checkbox`);
      } finally { task.destroy();host.remove(); }
    }
    for(const route of ['toolbar','slash']) {
      const block=create('- [ ] **待办内容**');
      const host=block.dom.parentElement!;
      const slash=(label:string,position:number)=>{
        block.dispatch({changes:{from:position,insert:label},selection:EditorSelection.cursor(position+label.length)});
        const result=slashCompletions()(new CompletionContext(block.state,position+label.length,true))!;
        const completion=result.options.find(option=>option.label===label)!;
        if(typeof completion.apply==='function') completion.apply(block,completion,position,position+label.length);
      };
      try {
        block.dispatch({selection:EditorSelection.cursor(6)});
        if(route==='toolbar') applyFormat(block,{type:'insert',kind:'callout'});
        else slash('/提示',6);
        await tick();
        expect(block.dom.querySelectorAll('.cm-lp-callout-head-widget').length===1 && !block.dom.querySelector('.cm-lp-taskbox'),`${route}: task becomes callout without checkbox`);
        expect(block.contentDOM.textContent?.trim()==='待办内容',`${route}: callout keeps text without leaked Markdown markers`);
        if(route==='toolbar') applyFormat(block,{type:'todo'});
        else slash('/任务',block.state.doc.toString().indexOf('] ')+2);
        await tick();
        expect(block.dom.querySelectorAll('.cm-lp-taskbox').length===1 && !block.dom.querySelector('.cm-lp-callout-head-widget'),`${route}: callout becomes task without callout icon`);
        expect(block.state.doc.toString()==='- [ ] **待办内容**',`${route}: roundtrip preserves inline formatting`);
      } finally {block.destroy();host.remove();}
    }
    const cell=view.dom.querySelector('[data-cell="1:0"] .cm-content') as HTMLElement;
    const inner=EditorView.findFromDOM(cell)!;
    inner.focus(); inner.dispatch({selection:EditorSelection.range(0,4)});
    expect(getComputedStyle(inner.dom).outlineStyle==='none','focused table editor has no dotted outline');
    expect(getComputedStyle(cell.closest('td')!).borderBottomStyle==='solid','table cell keeps its normal border');
    for (const type of ['bold','italic','underline','color','highlight'] as const) {
      getActiveEditorToolbarTarget()!.applyFormat({type,color:type==='color'?'#ff3b30':'#ffe1a6'});
    }
    await tick();
    expect(view.dom.querySelector('[data-cell="1:0"] .cm-content')===cell,'table keeps editable DOM and focus after formatting');
    expect(cell.textContent==='组合文本','table combinations hide all markers');
    expect(view.state.doc.toString().includes('<mark'),'table format saved into Markdown');
    inner.dispatch(inner.state.replaceSelection('中文输入'));
    await tick();
    expect(view.dom.querySelector('[data-cell="1:0"] .cm-content')===cell,'Chinese text update retains editor');
    expect(getComputedStyle(inner.dom).outlineStyle==='none','typing in table does not restore dotted outline');
    const before=window.scrollY;
    const handle=view.dom.querySelector('[data-cell="0:1"] .cm-lp-table-resize--col')!;
    const rect=handle.getBoundingClientRect();
    handle.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:rect.x,clientY:rect.y}));
    window.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:rect.x-100,clientY:rect.y}));
    window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:rect.x-100,clientY:rect.y}));
    await tick();
    expect(Math.abs(window.scrollY-before)<2,'table resizing preserves page scroll');
    expect(view.dom.querySelector('[data-cell="1:0"] .cm-content')===cell,'table resize preserves cell DOM');
    inner.contentDOM.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true}));
    await tick();
    expect(inner.state.doc.toString().includes('\n'),'Shift+Enter creates cell line break');
    expect(inner.hasFocus,'Shift+Enter retains cell focus');
    inner.contentDOM.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    await tick();
    expect(!view.dom.querySelector('.cm-lp-table-wrap')!.contains(document.activeElement),'Enter exits to normal paragraph');
    const independent=create('| A | B |\n| --- | --- |\n| 甲 | 乙 |');
    const independentHost=independent.dom.parentElement!;
    try {
      const cells=Array.from(independent.dom.querySelectorAll('.cm-lp-cell-editor .cm-content')).map(el=>EditorView.findFromDOM(el)!);
      expect(new Set(cells.map(editor=>editor.state.facet(language))).size===1,'table cells reuse one language configuration');
      const left=cells[2],right=cells[3];
      left.dispatch({changes:{from:0,to:left.state.doc.length,insert:'左侧修改'}});
      right.dispatch({changes:{from:0,to:right.state.doc.length,insert:'右侧修改'}});
      undo(left);
      expect(left.state.doc.toString()==='甲'&&right.state.doc.toString()==='右侧修改','shared configuration keeps undo independent');
      undo(right);
      expect(right.state.doc.toString()==='乙','each cell retains its own undo history');
    } finally {independent.destroy();independentHost.remove();}
    const quote=create('> 引用中间的文字');
    quote.dom.scrollIntoView(); await tick();
    const word=quote.state.doc.toString().indexOf('中间');
    const bounds=quote.coordsAtPos(word+1)!;
    expect(Math.abs((quote.posAtCoords({x:bounds.left,y:(bounds.top+bounds.bottom)/2}) ?? 0)-(word+1))<=1,'quote middle text is individually addressable');
    quote.destroy();
    results.textContent=JSON.stringify({checks,passed:true},null,2);
  } catch(error) { results.textContent=JSON.stringify({checks,error:String(error)},null,2); }
});
create('# 测试\n\n> [!note:#fff6d6:lightbulb] *<u>**<span style="color:#ff3b30"><mark style="background-color:#ffe1a6">高亮块组合文字</mark></span>**</u>*\n\n> 引用中的 ***组合文字*** 和 <u>***下划线组合***</u> 可编辑\n\n- [ ] 未完成\n- [x] 已完成\n\n```python\ndef hello():\n    print("Hello")\n```\n\n| 标题 | 内容 |\n| --- | --- |\n| 中文输入 | ***~~格式组合~~*** |\n\n正文');
create('![测试图片|300](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2MDAiIGhlaWdodD0iNDAwIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQwMCIgZmlsbD0iI2RhNTM1MyIvPjxyZWN0IHg9IjMwMCIgd2lkdGg9IjMwMCIgaGVpZ2h0PSI0MDAiIGZpbGw9IiM0MDkwY2MiLz48L3N2Zz4=)');

const alignmentTests=document.createElement('button');
alignmentTests.textContent='Run alignment tests';
results.before(alignmentTests);
alignmentTests.addEventListener('click',async()=>{
  alignmentTests.disabled=true;
  const checks:string[]=[],failures:string[]=[];
  const check=(condition:boolean,label:string)=>{(condition?checks:failures).push(label);};
  const tick=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  const dispose=(view:EditorView)=>{const host=view.dom.parentElement!;view.destroy();host.remove();};
  const wrap=(text:string,align='center')=>`<div align="${align}" style="text-align:${align}">\n${text}\n</div>`;
  const table='| 列一 | 列二 |\n| --- | --- |\n| 内容一 | 内容二 |';
  try {
    for(const font of [13,16,20]) for(const width of [320,750]) for(const align of ['center','right'] as const) {
      const body=`## 小标题\n\n正文第一行\n正文第二行\n\n- 无序第一行\n- 无序第二行\n\n1. 有序第一行\n2. 有序第二行\n\n- 长列表${'很长的列表内容'.repeat(12)}\n\n${table}\n\n表格后的正文`;
      const source=`# 标题\n\n${wrap(body,align)}\n\n末行`;
      const editor=create(source,false,font);
      editor.dom.parentElement!.style.width=`${width}px`;
      editor.dispatch({selection:EditorSelection.cursor(source.length)});
      editor.dom.scrollIntoView();await tick();
      check(editor.dom.querySelectorAll('.cm-lp-align-boundary').length===2,`${font}/${width}/${align}: both wrappers hidden`);
      for(const boundary of editor.dom.querySelectorAll('.cm-lp-align-boundary')) check(boundary.getBoundingClientRect().height<1,`${font}/${width}/${align}: no phantom boundary height`);
      check(!!editor.dom.querySelector('.cm-lp-heading-line.cm-lp-align-'+align),`${font}/${width}/${align}: heading still formatted`);
      check(editor.dom.querySelectorAll('.cm-lp-list-item.cm-lp-align-'+align).length===5,`${font}/${width}/${align}: lists still formatted`);
      check(editor.dom.querySelectorAll('table.cm-lp-table').length===1,`${font}/${width}/${align}: table still rendered`);
      const lines=Array.from(editor.contentDOM.children).filter((el):el is HTMLElement=>el instanceof HTMLElement&&el.classList.contains('cm-line'));
      for(const line of lines.filter(el=>/正文|无序|有序|长列表/.test(el.textContent??''))) {
        line.scrollIntoView({block:'center'});await tick();
        check(getComputedStyle(line).textAlign===align,`${font}/${width}/${align}: text is aligned`);
        const text=Array.from(line.childNodes).find(node=>node.nodeType===Node.TEXT_NODE&&node.textContent!.trim().length>0)!;
        const range=document.createRange();range.setStart(text,1);range.setEnd(text,2);
        const bounds=range.getBoundingClientRect();
        const expected=source.indexOf(text.textContent!)+1;
        const actual=editor.posAtCoords({x:bounds.left+1,y:(bounds.top+bounds.bottom)/2});
        check(actual!=null&&Math.abs(actual-expected)<=1,`${font}/${width}/${align}: mouse hits ${text.textContent!.slice(0,8)} (${expected}/${actual})`);
      }
      dispose(editor);
    }
    for(const key of ['Backspace','Delete']) {
      const editor=create(wrap('正文'));
      const start=editor.state.doc.toString().indexOf('正文');
      editor.dispatch({selection:EditorSelection.cursor(start+(key==='Delete'?2:0))});editor.focus();
      editor.contentDOM.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));await tick();
      check(editor.state.doc.toString()==='正文',`${key}: boundary removes alignment without corrupting content`);
      dispose(editor);
    }
    for(const key of ['Backspace','Delete']) {
      const source='前文\n'+wrap('正文')+'\n后文';
      const editor=create(source);
      editor.dispatch({selection:EditorSelection.cursor(key==='Backspace'?source.indexOf('后文'):2)});editor.focus();
      editor.contentDOM.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));await tick();
      check(editor.state.doc.toString()===source,`${key}: outside boundary does not join text to hidden tags`);
      check(editor.state.selection.main.head===source.indexOf('正文')+(key==='Backspace'?2:0),`${key}: outside boundary enters visible paragraph`);
      dispose(editor);
    }
    const readSource='# 标题\n\n'+wrap('正文\n\n- 列表\n\n'+table,'right');
    const live=create(readSource),reader=create(readSource,false,16,true);
    await tick();
    check(live.contentDOM.textContent===reader.contentDOM.textContent,'reading mode retains aligned Markdown');
    check(live.dom.querySelectorAll('.cm-lp-align-right').length===reader.dom.querySelectorAll('.cm-lp-align-right').length,'reading mode retains alignment');
    dispose(live);dispose(reader);
    const cellEditor=create(table);
    await tick();
    const cell=cellEditor.dom.querySelector('[data-cell="1:0"] .cm-content')!;
    const inner=EditorView.findFromDOM(cell)!;inner.focus();
    for(const align of ['center','right','left'] as const) {
      getActiveEditorToolbarTarget()!.applyFormat({type:'align',align});await tick();
      check(getComputedStyle(cell.closest('td')!).textAlign===align,`cell ${align}: updates cell immediately`);
      check(getComputedStyle(inner.contentDOM).textAlign===align,`cell ${align}: aligns editor`);
      check(getActiveEditorToolbarTarget()!.getFormatMarks().align===align,`cell ${align}: toolbar state matches`);
      check(cell.textContent==='内容一',`cell ${align}: preserves content`);
    }
    dispose(cellEditor);
    const printable=renderToStaticMarkup(createElement(SimpleMarkdown,{source:'前文\n'+wrap('## 标题\n\n- 列表\n\n'+table+'\n\n```md\n<div align="right">\n代码\n</div>\n```')+'\n后文'}));
    for(const marker of ['mn-md-align','mn-md-heading','mn-md-list','mn-md-table','mn-md-codeblock']) check(printable.includes(marker),`export keeps ${marker}`);
    check(printable.includes('前文')&&printable.includes('后文'),`export preserves surrounding paragraphs`);
  } catch(error) {failures.push(String(error));}
  finally {alignmentTests.disabled=false;results.textContent=JSON.stringify({passed:checks.length,failures},null,2);}
});
