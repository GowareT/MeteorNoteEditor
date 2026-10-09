import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorView } from '@codemirror/view';
import { NoteMarkdownEditor, type NoteMarkdownEditorHandle } from '../src/components/NoteMarkdownEditor';
import '../src/styles/tokens.css';

const sample = `# 点击定位测试
> [!note:#fff6d6:lightbulb] 一个简单的本地 Markdown 笔记本，专注于记录、整理和阅读。
不需要注册账号或配置服务端。笔记以 Markdown 文件保存在自己的电脑上，可以按笔记本整理，也可以导出到其他工具。
$E = mc^2$
### 主要功能
- 清晰显示模式：实时预览、阅读模式和 Markdown 源码。
- 日常写作：**标题、列表、任务、引用、代码高亮、表格、图片**和数学公式。
- 笔记整理：多层笔记本、收藏、全文搜索、标签页、分屏与独立窗口。
- 列表排序：<mark style="background-color:#dbe8ff">手动排序，按创建时间、更新时间或名称升序/降序。</mark>
- 本地保存：自动保存、历史版本、恢复站、外部修改检测和草稿恢复。
- 文件流转：导入／导出Markdown与图片附件，备份／恢复完整笔记库；
- [x] 舒适阅读：浅色／深色外观、编辑器主题与字号设置。

> [!note:#e8f2ff:lightbulb] 第二个提示块
> 多行内容，也要保持后续段落点击位置一致。
再次检查后续正文的点击位置。
`;
function Fixture() {
  const options = new URLSearchParams(location.search);
  const fontSize = Number(options.get('font')) || 15;
  const width = Number(options.get('width')) || 940;
  const editor = useRef<NoteMarkdownEditorHandle>(null);
  const [value, setValue] = useState(sample);
  const [result, setResult] = useState('Not run');
  const tick = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  async function run() {
    const view = editor.current!.getView()!;
    const failures: string[] = [];
    const geometry: unknown[] = [];
    let passed = 0;
    const mouse = (type: string, x: number, y: number, detail = 1, modifiers: MouseEventInit = {}) => {
      x = Math.round(x); y = Math.round(y);
      const target = type === 'mousedown' ? document.elementFromPoint(x, y) : document;
      target?.dispatchEvent(new MouseEvent(type, {clientX:x, clientY:y, button:0, buttons:type === 'mouseup' ? 0 : 1, detail, bubbles:true, cancelable:true, view:window, ...modifiers}));
    };
    const click = (x: number, y: number, detail = 1) => {
      mouse('mousedown', x, y, detail);
      mouse('mouseup', x, y, detail);
    };
    try {
      // Include the asynchronously rendered formula in the measured layout.
      for (let frame = 0; !view.contentDOM.querySelector('.katex') && frame < 120; frame++) await tick();
      for (const prefix of ['本地保存', '文件流转', '再次检查']) {
        const pos = sample.indexOf(prefix), sourceLine = view.state.doc.lineAt(pos);
        view.dispatch({ selection: {anchor: sample.indexOf('文件流转') + 10}, effects: EditorView.scrollIntoView(pos, {y:'center'}) });
        await tick();
        const line = [...view.contentDOM.children].find(el => el.classList.contains('cm-line') && el.textContent?.includes(prefix))!;
        const rect = line.getBoundingClientRect(), block = view.lineBlockAt(pos);
        geometry.push({prefix, domTop:rect.top, mappedTop:view.documentTop + block.top, domBottom:rect.bottom, mappedBottom:view.documentTop + block.bottom});
        if (Math.abs(rect.top - (view.documentTop + block.top)) < .5 && Math.abs(rect.bottom - (view.documentTop + block.bottom)) < .5) passed++;
        else failures.push(`${prefix}: rendered and measured line boxes disagree`);
        for (const offset of [3, 10, 20].filter(n => pos + n < sourceLine.to)) {
          const point = view.coordsAtPos(pos + offset)!;
          for (const [band, y] of [['top', point.top + 2], ['middle', (point.top + point.bottom) / 2], ['bottom', point.bottom - 2]] as const) {
            view.dispatch({selection:{anchor:sample.indexOf('文件流转') + 10}});
            click(point.left + 1, y);
            await tick();
            const head = view.state.selection.main.head;
            if (view.state.doc.lineAt(head).number === sourceLine.number && Math.abs(head - (pos + offset)) <= 1) passed++;
            else failures.push(`${prefix}/${offset}/${band}: expected ${pos + offset}, got ${head} (line ${view.state.doc.lineAt(head).number})`);
          }
        }
      }
      const first = sample.indexOf('本地保存') + 5, second = sample.indexOf('文件流转') + 20;
      view.dispatch({ selection: {anchor: 0}, effects: EditorView.scrollIntoView(first, {y:'center'}) });
      await tick();
      for (const reverse of [false, true]) {
        const anchor = reverse ? second : first, head = reverse ? first : second;
        const start = view.coordsAtPos(anchor)!, end = view.coordsAtPos(head)!;
        mouse('mousedown', start.left + 1, (start.top + start.bottom) / 2);
        mouse('mousemove', end.left + 1, (end.top + end.bottom) / 2);
        mouse('mouseup', end.left + 1, (end.top + end.bottom) / 2);
        await tick();
        if (view.state.selection.main.anchor === anchor && view.state.selection.main.head === head) passed++;
        else failures.push(`List drag ${reverse ? 'backward' : 'forward'} selects the wrong lines`);
      }
      view.dispatch({selection:{anchor:second}});
      const firstPoint = view.coordsAtPos(first)!;
      mouse('mousedown', firstPoint.left + 1, (firstPoint.top + firstPoint.bottom) / 2, 1, {shiftKey:true});
      mouse('mouseup', firstPoint.left + 1, (firstPoint.top + firstPoint.bottom) / 2, 1, {shiftKey:true});
      await tick();
      if (view.state.selection.main.anchor === second && view.state.selection.main.head === first) passed++;
      else failures.push('Shift-click from the second list item to the first moved the wrong endpoint');
      const wordStart = sample.indexOf('Markdown 源码');
      view.dispatch({effects: EditorView.scrollIntoView(wordStart, {y:'center'})});
      await tick();
      const wordPoint = view.coordsAtPos(wordStart + 3)!;
      click(wordPoint.left + 1, (wordPoint.top + wordPoint.bottom) / 2, 2);
      await tick();
      if (view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to) === 'Markdown') passed++;
      else failures.push('Double-click after a callout does not select the pointed word');
      if (view.state.doc.toString() === sample) passed++;
      else failures.push('Pointer gestures changed the document');
    } catch (error) { failures.push(String(error)); }
    const report = {passed, failures, geometry};
    setResult(JSON.stringify(report, null, 2));
    (window as unknown as {webkit?: {messageHandlers?: {pointerResult?: {postMessage(value: unknown): void}}}}).webkit?.messageHandlers?.pointerResult?.postMessage(report);
  }
  useEffect(() => { if (location.search.includes('autorun')) void document.fonts.ready.then(tick).then(run); }, []);
  return <><button onClick={() => void run()}>Run offset checks</button><pre>{result}</pre><div style={{height:600,width,maxWidth:'95vw',display:'flex',margin:'0 auto'}}><NoteMarkdownEditor ref={editor} value={value} onChange={setValue} fontSize={fontSize} titleMeta={{timeLabel:'12:00'}} /></div></>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
