import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {mockIPC} from '@tauri-apps/api/mocks';
import {SettingsView} from '../src/views/SettingsView';
import {t} from '../src/lib/i18n';
import '../src/styles/tokens.css';
let root='/isolated/original/Notebooks';
const calls:string[]=[];let pickedDirectory=false;
mockIPC((command,args)=>{
 if(command==='library_root_path')return root;
 if(command==='plugin:dialog|open'){
  const options=args.options as {directory?:boolean};
  if(options.directory){pickedDirectory=true;return '/isolated/chosen';}
  return '/isolated/data.mnebackup';
 }
 if(command==='plugin:dialog|save')return '/isolated/data.mnebackup';
 if(command==='change_library_location') {calls.push(command);root='/isolated/chosen/MeteorNoteEditor/Notebooks';return root;}
 if(command==='list_notebooks'||command==='list_trash')return [];
 if(command==='transfer_library'){calls.push(String(args.operation));return {path:'/isolated/data.mnebackup',noteCount:3};}
 throw new Error(`Unexpected isolated command: ${command}`);
});
window.confirm=()=>true;
const tick=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
const button=(label:string)=>Array.from(document.querySelectorAll<HTMLButtonElement>('.mne-settings button')).find(b=>b.textContent===label)!;
function Fixture(){
 const [result,setResult]=useState('Ready');
 async function run(){
  const checks:string[]=[],failures:string[]=[];
  const check=(ok:boolean,label:string)=>(ok?checks:failures).push(label);
  try {
   await tick();button(t('更改位置')).click();await tick();
   check(pickedDirectory,'Change location opens a native directory picker');
   check(!!button(t('确认迁移'))&&!calls.includes('change_library_location'),'Picking a folder shows explicit confirmation without migrating yet');
   check(document.querySelector('.mne-storage-confirm')!.textContent!.includes('/isolated/chosen/MeteorNoteEditor'),'Confirmation shows the destination before migration');
   button(t('取消')).click();await tick();
   check(!document.querySelector('.mne-storage-confirm')&&!calls.includes('change_library_location'),'Cancel leaves storage untouched');
   button(t('更改位置')).click();await tick();button(t('确认迁移')).click();await tick();
   check(calls.includes('change_library_location')&&!document.querySelector('.mne-storage-confirm'),'Confirmation commits location change');
   check(document.querySelector('.mne-settings__storage')!.textContent!.includes(root),'Settings show the new actual notes location');
   button(t('导出全部数据（迁移包）')).click();await tick();
   check(calls.includes('backup'),'Export-all button uses whole-library backup');
   button(t('导入迁移包')).click();await tick();
   check(calls.includes('restore'),'Import button restores the whole package');
  }catch(error){failures.push(String(error));}
  setResult(JSON.stringify({passed:failures.length===0,checks,failures},null,2));
 }
 return <><button onClick={()=>void run()}>Run storage settings tests</button><pre id="result">{result}</pre><SettingsView/></>;
}
createRoot(document.querySelector('#root')!).render(<Fixture/>);
