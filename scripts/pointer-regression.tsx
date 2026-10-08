import { useEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { createRoot } from 'react-dom/client';
import { NoteMarkdownEditor, type NoteMarkdownEditorHandle } from '../src/components/NoteMarkdownEditor';
import '../src/styles/tokens.css';
const sample = '# Document title\n\n## Heading alpha\n### Heading beta\nFirst paragraph apple\nNext paragraph banana\n- Bullet cherry\n- Bullet dates\n1. Ordered elderberry\n2. Ordered fig\n\n<div align="center" style="text-align:center">\nCentered grape\n</div>\n<div align="right" style="text-align:right">\nRight aligned honey\n</div>\n\nA wrapped paragraph ' + 'wrapping words 中文换行 '.repeat(16) + '\n\n## A wrapped heading ' + 'heading words 中文标题 '.repeat(12) + '\n\nLast paragraph kiwi';
function Fixture() {
    const editor = useRef<NoteMarkdownEditorHandle>(null);
    const [value, setValue] = useState(sample);
    const [font, setFont] = useState(Number(new URLSearchParams(location.search).get("font")) || 16);
    const [width, setWidth] = useState(Number(new URLSearchParams(location.search).get("width")) || 760);
    const [source, setSource] = useState(new URLSearchParams(location.search).has("source"));
    const [inspection, setInspection] = useState('');
    const [results, setResults] = useState('Not run');
    const tick = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const inspect = () => { const view = editor.current?.getView(); if (view) {
        const r = view.state.selection.main;
        setInspection(JSON.stringify({ anchor: r.anchor, head: r.head, anchorLine: view.state.doc.lineAt(r.anchor).number, headLine: view.state.doc.lineAt(r.head).number, text: view.state.sliceDoc(r.from, r.to) }));
    } };
    async function run() {
        const view = editor.current!.getView()!;
        const failures: string[] = [];
        let passed = 0;
        const check = (ok: boolean, label: string) => { if (ok)
            passed++;
        else
            failures.push(label); };
        const dispatch = (type: string, x: number, y: number, detail = 1) => {
            const target = type === 'mousedown' ? document.elementFromPoint(x, y) : document;
            target?.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, buttons: type === 'mouseup' ? 0 : 1, detail, bubbles: true, cancelable: true, view: window }));
        };
        const prepare = async (pos: number) => { view.dispatch({ selection: { anchor: 0 }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) }); await tick(); };
        try {
            for (const text of ['Heading alpha', 'Heading beta', 'First paragraph apple', 'Next paragraph banana', 'Bullet cherry', 'Bullet dates', 'Ordered elderberry', 'Ordered fig', 'Centered grape', 'Right aligned honey', 'Last paragraph kiwi']) {
                await prepare(view.state.doc.toString().indexOf(text));
                const line = Array.from(view.contentDOM.children).find(el => el.classList.contains('cm-line') && el.textContent?.includes(text)) as HTMLElement;
                line.scrollIntoView({ block: 'center' });
                await tick();
                let box = line.getBoundingClientRect();
                const from = view.state.doc.toString().indexOf(text);
                const to = from + text.length;
                for (const [band, y] of [['top', box.top + 1], ['middle', (box.top + box.bottom) / 2], ['bottom', box.bottom - 1]] as const) {
                    const x = box.right - 5;
                    dispatch('mousedown', x, y);
                    dispatch('mouseup', x, y);
                    await tick();
                    check(view.state.selection.main.head === to, `${text}/${band}: end click expected ${to}, got ${view.state.selection.main.head}`);
                }
                for (const gutter of ['near', 'far']) {
                    await prepare(from);
                    box = line.getBoundingClientRect();
                    const x = gutter === 'near' ? box.right + 10 : view.scrollDOM.getBoundingClientRect().left + view.scrollDOM.clientWidth - 8;
                    const y = (box.top + box.bottom) / 2;
                    dispatch('mousedown', x, y);
                    dispatch('mouseup', x, y);
                    await tick();
                    check(view.state.selection.main.head === to, `${text}: outside-line whitespace expected ${to}, got ${view.state.selection.main.head}`);
                }
                const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
                let node: Node | null;
                let target: Text | null = null;
                while (node = walker.nextNode())
                    if (node.textContent?.includes(text)) {
                        target = node as Text;
                        break;
                    }
                if (!target) {
                    failures.push('Missing visible text ' + text);
                    continue;
                }
                const offset = target.data.indexOf(text) + text.lastIndexOf(' ') + 2;
                const range = document.createRange();
                range.setStart(target, offset);
                range.setEnd(target, offset + 1);
                const bounds = range.getBoundingClientRect();
                const x = (bounds.left + bounds.right) / 2;
                for (const [band, y] of [['text', (bounds.top + bounds.bottom) / 2], ['padding', box.bottom - 1]] as const) {
                    dispatch('mousedown', x, y, 2);
                    dispatch('mouseup', x, y, 2);
                    await tick();
                    const selected = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
                    check(selected === text.split(' ').at(-1), `${text}/${band}: double click selected ${JSON.stringify(selected)}`);
                }
                const gutterX = view.scrollDOM.getBoundingClientRect().left + view.scrollDOM.clientWidth - 8;
                dispatch('mousedown', gutterX, (box.top + box.bottom) / 2, 2);
                dispatch('mouseup', gutterX, (box.top + box.bottom) / 2, 2);
                await tick();
                check(editor.current!.getSelection() === text.split(' ').at(-1), `${text}: double click in outer gutter`);
                // Exercise the full CodeMirror gesture, including a drag starting in line padding.
                const start = view.coordsAtPos(from)!, end = view.coordsAtPos(to)!;
                dispatch('mousedown', start.left + 1, box.bottom - 1);
                dispatch('mousemove', end.left + 1, box.bottom - 1);
                dispatch('mouseup', end.left + 1, box.bottom - 1);
                await tick();
                check(view.state.selection.main.from === from && view.state.selection.main.to === to, `${text}: drag expected ${from}-${to}, got ${view.state.selection.main.from}-${view.state.selection.main.to}`);
            }
            for (const [first, last] of [['First paragraph apple', 'Next paragraph banana'], ['Bullet cherry', 'Bullet dates'], ['Heading alpha', 'Heading beta']]) {
                const source = view.state.doc.toString(), from = source.indexOf(first) + first.length, to = source.indexOf(last) + last.length;
                view.dispatch({ effects: EditorView.scrollIntoView(from, { y: 'center' }) });
                await tick();
                for (const reverse of [false, true]) {
                    const a = view.coordsAtPos(reverse ? to : from)!, b = view.coordsAtPos(reverse ? from : to)!;
                    const x = view.scrollDOM.getBoundingClientRect().left + view.scrollDOM.clientWidth - 8;
                    dispatch('mousedown', x, (a.top + a.bottom) / 2);
                    dispatch('mousemove', x, (b.top + b.bottom) / 2);
                    dispatch('mouseup', x, (b.top + b.bottom) / 2);
                    await tick();
                    check(view.state.selection.main.anchor === (reverse ? to : from) && view.state.selection.main.head === (reverse ? from : to), `${first}: ${reverse ? 'backward' : 'forward'} gutter drag stays on the pointed lines`);
                }
            }
            for (const prefix of ['A wrapped paragraph', 'A wrapped heading']) {
                const source = view.state.doc.toString(), from = source.indexOf(prefix), line = view.state.doc.lineAt(from);
                for (const fraction of [.1, .5, .9]) {
                    const pos = from + Math.floor((line.to - from) * fraction);
                    await prepare(pos);
                    const bounds = view.coordsAtPos(pos)!;
                    const y = (bounds.top + bounds.bottom) / 2;
                    dispatch('mousedown', bounds.left + 1, y);
                    dispatch('mouseup', bounds.left + 1, y);
                    await tick();
                    check(Math.abs(view.state.selection.main.head - pos) <= 1, `${prefix}: wrapped text click at ${pos} got ${view.state.selection.main.head}`);
                    const contentLine = Array.from(view.contentDOM.children).find(el => el.classList.contains('cm-line') && el.textContent?.includes(prefix))!;
                    const walker = document.createTreeWalker(contentLine, NodeFilter.SHOW_TEXT);
                    let node: Node | null;
                    let end = from;
                    while (node = walker.nextNode()) {
                        if (!node.textContent?.includes(prefix))
                            continue;
                        const text = node as Text;
                        for (let i = 0; i < text.length; i++) {
                            const range = document.createRange();
                            range.setStart(text, i);
                            range.setEnd(text, i + 1);
                            const rect = range.getBoundingClientRect();
                            if (rect.top < y && rect.bottom > y && rect.width > 0)
                                end = view.posAtDOM(text, i + 1);
                        }
                    }
                    const x = view.scrollDOM.getBoundingClientRect().left + view.scrollDOM.clientWidth - 8;
                    dispatch('mousedown', x, y);
                    dispatch('mouseup', x, y);
                    await tick();
                    check(Math.abs(view.state.selection.main.head - end) <= 1, `${prefix}: wrapped row end expected ${end}, got ${view.state.selection.main.head}`);
                }
            }
            check(view.state.doc.toString() === sample, 'Pointer gestures must not insert text or extra blank lines');
        }
        catch (error) {
            failures.push(error instanceof Error ? error.message + "\n" + error.stack : String(error));
        }
        const result = { passed, failures };
        setResults(JSON.stringify(result, null, 2));
        inspect();
        (window as unknown as {
            webkit?: {
                messageHandlers?: {
                    pointerResult?: {
                        postMessage: (value: unknown) => void;
                    };
                };
            };
        }).webkit?.messageHandlers?.pointerResult?.postMessage(result);
    }
    useEffect(() => { if (new URLSearchParams(location.search).has('autorun'))
        void document.fonts.ready.then(tick).then(run); }, []);
    return <><header style={{ position: 'sticky', top: 0, zIndex: 100, background: 'white', padding: 10, display: 'flex', gap: 12 }}>
 <button onClick={() => void run()}>Run pointer checks</button>
 <button onClick={() => { setValue(sample); }}>Reset document</button>
 <label>Font <select value={font} onChange={e => setFont(Number(e.target.value))}>{[13, 16, 20].map(n => <option key={n}>{n}</option>)}</select></label>
 <label>Width <select value={width} onChange={e => setWidth(Number(e.target.value))}>{[320, 760, 1100].map(n => <option key={n}>{n}</option>)}</select></label>
 <label><input type="checkbox" checked={source} onChange={e => setSource(e.target.checked)}/>Source mode</label>
 </header><pre id="results">{results}</pre><output aria-label="Selection">{inspection}</output>
 <div style={{ display: 'flex', height: 500, width, maxWidth: '95vw', margin: '20px auto', border: '1px solid #ccc' }} onMouseUp={() => requestAnimationFrame(inspect)} onKeyUp={inspect}>
 <NoteMarkdownEditor ref={editor} value={value} onChange={setValue} fontSize={font} sourceMode={source} titleMeta={{ timeLabel: '12:00:00' }}/>
 </div></>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
