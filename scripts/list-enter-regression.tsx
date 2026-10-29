import {useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {undo} from '@codemirror/commands';
import {syntaxTree} from '@codemirror/language';
import {NoteMarkdownEditor,type NoteMarkdownEditorHandle} from '../src/components/NoteMarkdownEditor';
import '../src/styles/tokens.css';
const source='# Note\n\n- **免费内容体验1**\n- **免费内容体验2**';
const tick=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
function Fixture(){
 const ref=useRef<NoteMarkdownEditorHandle>(null),[value,setValue]=useState(source),[result,setResult]=useState('Ready');
 async function run(){
  const checks:string[]=[],failures:string[]=[];
  const check=(ok:boolean,label:string)=>(ok?checks:failures).push(label);
  const view=ref.current!.getView()!;
  const enter=()=>view.contentDOM.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}));
  view.focus();view.dispatch({selection:{anchor:source.indexOf('1**')+1}});enter();await tick();
  check(view.state.doc.toString()==='# Note\n\n- **免费内容体验1**\n- \n- **免费内容体验2**','Visible end of bold first item creates a new list item without breaking either original style');
  let bold=0;syntaxTree(view.state).iterate({enter(node){if(node.name==='StrongEmphasis')bold++;}});
  check(bold===2,'Both original items remain parsed as bold');
  undo(view);await tick();check(view.state.doc.toString()===source,'One undo restores original list');
  view.dispatch({selection:{anchor:source.indexOf('体验1')}});enter();await tick();
  check(view.state.doc.toString()==='# Note\n\n- **免费内容**\n- **体验1**\n- **免费内容体验2**','Splitting the middle preserves bold on both halves and the next item');
  check(view.state.doc.sliceString(view.state.selection.main.head-2,view.state.selection.main.head)==='**','Caret is inside the new bold text');
  check(view.dom.querySelectorAll('.cm-lp-strong').length>=3,'Bold styles stay visible after splitting');
  setResult(JSON.stringify({passed:failures.length===0,checks,failures},null,2));
 }
 return <><button onClick={()=>void run()}>Run formatted list Enter tests</button><pre id="result">{result}</pre><div style={{height:500}}><NoteMarkdownEditor ref={ref} value={value} onChange={setValue}/></div></>;
}
createRoot(document.querySelector('#root')!).render(<Fixture/>);
