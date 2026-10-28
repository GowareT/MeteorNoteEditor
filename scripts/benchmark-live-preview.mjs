// Isolated Markdown decoration benchmark; does not include rendering or disk I/O.
import {build} from 'esbuild';
const result=await build({stdin:{resolveDir:process.cwd(),contents:`
export {EditorState} from '@codemirror/state';
export {markdown,markdownLanguage} from '@codemirror/lang-markdown';
export {livePreviewExtension} from './src/lib/cm6/livePreview';
`},bundle:true,write:false,platform:'node',format:'esm',loader:{'.css':'empty'},banner:{js:"import {createRequire} from 'node:module'; const require=createRequire(process.cwd()+'/package.json');"},logLevel:'silent'});
const {EditorState,markdown,markdownLanguage,livePreviewExtension}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const source=Array.from({length:2500},(_,i)=>`第${i}段 **粗体内容** *斜体* ***组合*** 与 <u>下划线</u>。`).join('\n\n');
let state=EditorState.create({doc:source,extensions:[markdown({base:markdownLanguage}),livePreviewExtension()]});
const timings=[];
for(let i=0;i<12;i++){let start=performance.now();state=state.update({changes:{from:10,insert:'字'}}).state;timings.push(performance.now()-start);}
timings.sort((a,b)=>a-b);console.log(JSON.stringify({characters:source.length,lines:state.doc.lines,medianMs:timings[6],maxMs:timings.at(-1)}));
