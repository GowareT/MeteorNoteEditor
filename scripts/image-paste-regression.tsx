import {useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {mockIPC} from '@tauri-apps/api/mocks';
import {NoteMarkdownEditor,type NoteMarkdownEditorHandle} from '../src/components/NoteMarkdownEditor';
import '../src/styles/tokens.css';
let stored:Record<string,string>[]=[];
mockIPC((command,payload)=>{
 if(command==='library_root_path') return '/isolated-test';
 if(command==='store_note_asset'){stored.push(payload as Record<string,string>);return 'assets/screenshot.png';}
 throw new Error(`Unexpected test command: ${command}`);
});
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4ZkAAAAASUVORK5CYII=';
const tick=()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));
function Fixture(){
 const ref=useRef<NoteMarkdownEditorHandle>(null);
 const [value,setValue]=useState('# Note\n\n正文');
 const [readOnly,setReadOnly]=useState(false);
 const [result,setResult]=useState('Ready');
 async function run(){
  const failures:string[]=[]; stored=[];
  const view=ref.current!.getView()!;
  view.dispatch({selection:{anchor:view.state.doc.length}});view.focus();
  const bytes=Uint8Array.from(atob(png),c=>c.charCodeAt(0));
  const file=new File([bytes],'Screenshot.png',{type:'image/png'});
  const data=new DataTransfer();data.items.add(file);data.setData('text/plain','must not paste this text instead of the bitmap');
  const prevented=!view.contentDOM.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
  for(let i=0;i<50 && !view.state.doc.toString().includes('assets/screenshot.png');i++) await tick();
  if(!prevented) failures.push('Image paste was not intercepted');
  if(stored.length!==1||stored[0]?.notePath!=='Fixture/Note'||!stored[0]?.sourcePath.startsWith('data:image/png;base64,')) failures.push('Image was not saved as a current-note attachment');
  if(!view.state.doc.toString().includes('![Screenshot.png](assets/screenshot.png)')||view.state.doc.toString().includes('must not paste')) failures.push('Image Markdown was not inserted correctly');
  const text=new DataTransfer();text.setData('text/plain','普通文字');
  view.dispatch({selection:{anchor:view.state.doc.length}});
  view.contentDOM.dispatchEvent(new ClipboardEvent('paste',{clipboardData:text,bubbles:true,cancelable:true}));
  await tick();
  if(!view.state.doc.toString().includes('普通文字')) failures.push('Ordinary text paste stopped working');
  setReadOnly(true);await tick();
  const readView=ref.current!.getView()!;
  const before=readView.state.doc.toString(),count=stored.length;
  readView.contentDOM.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));await tick();
  if(readView.state.doc.toString()!==before||stored.length!==count) failures.push('Read-only mode accepted an image paste');
  setResult(JSON.stringify({passed:failures.length===0,failures},null,2));
 }
 return <><button onClick={()=>void run()}>Run image paste tests</button><pre id="result">{result}</pre><div style={{height:500}}><NoteMarkdownEditor key={readOnly?"reading":"editing"} ref={ref} value={value} onChange={setValue} readOnly={readOnly} notePath="Fixture/Note" libraryRootPath="/isolated-test" /></div></>;
}
createRoot(document.querySelector('#root')!).render(<Fixture/>);
