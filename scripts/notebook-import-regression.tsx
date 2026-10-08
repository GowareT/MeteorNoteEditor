import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { LibraryNotebook, SidebarPage } from '../src/types/library';
import '../src/styles/tokens.css';
import '../src/styles/pages.css';

// Isolated fixture: native dialogs and storage are simulated, never real files.
const child: LibraryNotebook = {id:'工作/资料',name:'资料',parentPath:'工作',icon:'folder',colorHex:null,children:[],notes:[]};
const root: LibraryNotebook = {id:'工作',name:'工作',parentPath:null,icon:'folder',colorHex:null,children:[child],notes:[]};
let mode='success';
let report=(text:string)=>{void text;};
let counter=0;
mockWindows('main');
mockIPC((command,payload)=>{
  if(command==='plugin:dialog|open') return mode==='cancel'?null:['/fixture/模拟导入.md'];
  if(command==='list_notebooks') return structuredClone([root]);
  if(command==='library_stats') return {noteCount:root.notes.length+child.notes.length,notebookCount:2,trashCount:0};
  if(command==='transfer_library') {
    const args=payload as {operation:string;paths:string[];targetNotebookPath:string};
    report(JSON.stringify(args));
    if(mode==='failure') throw new Error('模拟导入失败');
    const target=[root,child].find(book=>book.id===args.targetNotebookPath);
    if(args.operation!=='import'||!target) throw new Error('导入目标无效');
    const title=`模拟导入 ${++counter}`;
    target.notes.push({id:`${target.id}/${title}`,title,notebookPath:target.id,icon:'document'});
    return {path:target.id,noteCount:1};
  }
  throw new Error(`Unexpected fixture command: ${command}`);
},{shouldMockEvents:true});
const {PageContent}=await import('../src/components/PageContent');
const {useAppStore}=await import('../src/store/appStore');
useAppStore.setState({notebooks:[root]});
function Fixture() {
  const [page,setPage]=useState<SidebarPage>({notebook:child.id});
  const [request,setRequest]=useState('尚未导入');
  report=setRequest;
  return <div style={{padding:16}}>
    <h1>Notebook import regression</h1>
    <nav style={{display:'flex',gap:16,marginBottom:16}}>
      <button onClick={()=>setPage('workspaceHome')}>全部笔记</button>
      <button onClick={()=>setPage({notebook:root.id})}>打开工作</button>
      <button onClick={()=>setPage({notebook:child.id})}>打开资料</button>
      <select aria-label="模拟选择结果" onChange={event=>{mode=event.target.value;}} defaultValue="success">
        <option value="success">正常导入</option><option value="cancel">取消选择</option><option value="failure">导入失败</option>
      </select>
    </nav>
    <div style={{height:360,border:'1px solid var(--mn-border)'}}><PageContent page={page} /></div>
    <pre aria-label="最近导入请求">{request}</pre>
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
