import {useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {EditorView} from '@codemirror/view';
import {NoteMarkdownEditor,type NoteMarkdownEditorHandle} from '../src/components/NoteMarkdownEditor';
import '../src/styles/tokens.css';

const image='data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#daeaff"/><text x="120" y="450" font-size="100">Image fixture</text></svg>');
const source='# Note\n\n'+ '短文编辑测试。'.repeat(40)+'\n\n![Image|220]('+image+')\n\n| A | B |\n| --- | --- |\n| one | two |\n\n> 引用第一行\n> 引用第二行\n\n引用下方正文\n';
const tick=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
function Fixture(){
 const ref=useRef<NoteMarkdownEditorHandle>(null);
 const [value,setValue]=useState(source),[time,setTime]=useState('Saved'),[report,setReport]=useState('Ready');
 async function run(){
  const checks:string[]=[],failures:string[]=[];
  const check=(ok:boolean,label:string)=>(ok?checks:failures).push(label);
  const view=ref.current!.getView()!;
  try {
   await tick();
   const img=view.dom.querySelector('.cm-lp-image'), cell=view.dom.querySelector('[data-cell="1:0"] .cm-content');
   const timings:number[]=[];
   for(let i=0;i<20;i++){
    const start=performance.now();view.dispatch({changes:{from:10,insert:'字'}});timings.push(performance.now()-start);
    await tick();
    check(view.dom.querySelector('.cm-lp-image')===img,`Typing ${i}: reuses loaded image`);
    check(view.dom.querySelector('[data-cell="1:0"] .cm-content')===cell,`Typing ${i}: reuses table cell editor`);
   }
   const beforeSave=view.dom.querySelector('.cm-lp-image');setTime('Saved again');await tick();
   check(view.dom.querySelector('.cm-lp-image')===beforeSave&&view.dom.querySelector('[data-cell="1:0"] .cm-content')===cell,'Save-time label updates preserve media DOM');
   const imageWrap=view.dom.querySelector<HTMLElement>('.cm-lp-image-wrap')!;
   imageWrap.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}));await tick();
   const selection=view.state.selection.main;
   check(view.state.doc.sliceString(selection.from,selection.to)===`![Image|220](${image})`,'Image selection uses updated offsets after typing');
   check(view.dom.querySelector('.cm-lp-image')===img,'Selecting image does not reload it');
   imageWrap.querySelector<HTMLButtonElement>('[title="恢复原图"]')!.click();await tick();
   check(view.state.doc.toString().includes(`![Image](${image})`),'Image actions edit the correct shifted source');
   const inner=EditorView.findFromDOM(cell!)!;
   inner.dispatch({changes:{from:0,insert:'new '}});
   view.dispatch({changes:{from:10,insert:'移动'}});
   await new Promise(resolve=>setTimeout(resolve,160));await tick();
   check(view.state.doc.toString().includes('| new one | two |'),'Pending table edits target correct shifted offsets');
   const quotes=view.dom.querySelectorAll<HTMLElement>('.cm-lp-quote');
   check(quotes.length===2&&!quotes[0].classList.contains('cm-lp-quote-last')&&quotes[1].classList.contains('cm-lp-quote-last'),'Only last quote line receives the bottom gap');
   check(parseFloat(getComputedStyle(quotes[1]).borderBottomWidth)>=10,'Quote bottom gap is visible and included in measured line height');
   const after=view.state.doc.toString().indexOf('引用下方正文');
   view.dispatch({selection:{anchor:after},scrollIntoView:true});await tick();
   const rect=view.coordsAtPos(after+3)!;
   const hit=view.posAtCoords({x:rect.left,y:(rect.top+rect.bottom)/2});
   check(hit!==null&&Math.abs(hit-(after+3))<=1,'Click coordinates below quote remain aligned');
   timings.sort((a,b)=>a-b);
   setReport(JSON.stringify({passed:failures.length===0,checks:checks.length,failures,typingMedianMs:timings[10],typingMaxMs:timings.at(-1)},null,2));
  } catch(error){setReport(JSON.stringify({passed:false,checks:checks.length,failures:[...failures,String(error)]},null,2));}
 }
 return <><button onClick={()=>void run()}>Run media and quote tests</button><pre id="result">{report}</pre><div style={{height:650}}><NoteMarkdownEditor ref={ref} value={value} onChange={setValue} titleMeta={{timeLabel:time}}/></div></>;
}
createRoot(document.querySelector('#root')!).render(<Fixture/>);
