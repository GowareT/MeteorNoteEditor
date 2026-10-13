import { EditorState, EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { livePreviewExtension } from '../src/lib/cm6/livePreview';
import { meteorNoteEditorTheme } from '../src/lib/cm6/theme';
import '../src/components/NoteMarkdownEditor.css';
import '../src/styles/tokens.css';
const view = new EditorView({parent: document.querySelector('#fixture')!, state: EditorState.create({extensions: [markdown(), livePreviewExtension(), meteorNoteEditorTheme(15, false)]})});
const tick = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const failures: string[] = [];
async function check(source: string) {
  view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: source}, selection: EditorSelection.cursor(source.length)});
  await tick();
  const markers = view.contentDOM.querySelectorAll('.cm-lp-list-source-num');
  if (view.contentDOM.querySelector('.cm-lp-list-num')) failures.push(`${source}: duplicate number widget`);
  if (source.includes(' ') && markers.length !== 1) failures.push(`${source}: missing or duplicate source number`);
  if (view.contentDOM.textContent?.trim() !== source.trim()) failures.push(`${source}: visible number differs from source`);
}
for (const source of ['1', '1.', '1. ', '1. 正文', '10. ', '100) 正文', '1. ', '1.', '1']) await check(source);
view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: '1. 中文\n2. 正文'}, selection: EditorSelection.cursor(0)});
await tick();
if (view.contentDOM.querySelectorAll('.cm-lp-list-source-num').length !== 2 || view.contentDOM.querySelector('.cm-lp-list-num')) failures.push('Multiple lines contain duplicate number widgets');
const report = {passed: failures.length === 0, failures};
document.querySelector('#result')!.textContent = JSON.stringify(report);
(window as any).webkit?.messageHandlers?.result?.postMessage(report);
