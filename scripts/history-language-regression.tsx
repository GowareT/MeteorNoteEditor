import { useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC } from "@tauri-apps/api/mocks";
import { NoteHistoryPanel } from "../src/components/NoteHistoryPanel";
import { getLocale, setLocale, subscribeLocale } from "../src/lib/i18n";
import "../src/styles/tokens.css";

// All writes remain in this fixture's memory. No real notebook is touched.
const rich = '# 历史标题 History\n\n## Section\n\nParagraph with **bold** and *italic*.\n\n- First item\n- Second item\n\n1. Numbered item\n\n- [ ] Read-only task\n\n| Name | Count |\n| --- | --- |\n| Example | 2 |\n\n> [!note:#fff6d6:lightbulb] A callout\n\n```js\nconst answer = 42;\n```\n\n![Logo](http://localhost:5183/logo.png)\n';
const bodies: Record<string,string> = {rich,slow:'# Slow version\n\nOLD RESPONSE',recent:'# Recent version\n\nLATEST RESPONSE'};
let saved = '# Current note\n\nCurrent content';
let writes=0;
mockIPC(async (command,payload) => {
 const args=payload as Record<string,string>;
 if(command==='list_note_versions')return ['rich','slow','recent','broken'].map((id,index)=>({id,createdAt:`2026-10-0${index+1} 12:00:00`,preview:id}));
 if(command==='read_note_version') {
  if(args.versionId==='slow') await new Promise(resolve=>setTimeout(resolve,800));
  if(args.versionId==='broken') throw '版本不存在';
  return bodies[args.versionId];
 }
 if(command==='read_note')return saved;
 if(command==='write_note'){saved=args.content;writes++;return;}
 throw new Error(`Unexpected command: ${command}`);
});
function Fixture(){
 const locale=useSyncExternalStore(subscribeLocale,getLocale);
 const [open,setOpen]=useState(true);
 const [result,setResult]=useState('No restore');
 return <><header style={{padding:12,display:'flex',gap:16}}>
  <button onClick={()=>setLocale('zh-CN')}>简体中文</button><button onClick={()=>setLocale('en')}>English</button>
  <button onClick={()=>setOpen(true)}>Open history</button><output>{result}</output>
 </header><div style={{position:'relative',height:'78vh'}}>
 <NoteHistoryPanel key={locale} open={open} notePath="Fixture/历史标题" onClose={()=>setOpen(false)} onRestore={body=>setResult(`Restored exact Markdown: ${body===rich}; writes: ${writes}`)} />
 </div><details><summary>Latest saved Markdown</summary><pre>{saved}</pre></details></>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
