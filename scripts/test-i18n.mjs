import assert from 'node:assert/strict';
import { build } from 'esbuild';
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
const values=new Map();
const events=new Map();
let fail=false;
globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>{if(fail)throw new Error('Storage full');values.set(key,value);}};
globalThis.window={addEventListener:(name,fn)=>events.set(name,fn)};
const result=await build({stdin:{resolveDir:process.cwd(),contents:`
 export * from './src/lib/i18n';
 export { en } from './src/lib/locales/en';
 export { APPEARANCE_OPTIONS } from './src/lib/settingsPrefs';
 export { NOTE_SORT_OPTIONS } from './src/lib/noteSort';
 export { EditorState } from '@codemirror/state';
 export { applyFormat } from './src/lib/cm6/mdFormat';
`},bundle:true,write:false,format:'esm',platform:'node'});
const module=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
globalThis.document={documentElement:{lang:""}};
const {getLocale,setLocale,subscribeLocale,t,errorMessage,en,LANGUAGE_KEY,APPEARANCE_OPTIONS,NOTE_SORT_OPTIONS,EditorState,applyFormat}=module;
assert.equal(getLocale(),'zh-CN');assert.equal(t('设置'),'设置');
let changes=0;const unsubscribe=subscribeLocale(()=>changes++);
setLocale('en');assert.equal(getLocale(),'en');assert.equal(document.documentElement.lang,'en');assert.equal(values.get(LANGUAGE_KEY),'en');assert.equal(changes,1);
assert.equal(t('{0} 篇笔记',1),'1 note');assert.equal(t('{0} 篇笔记',2),'2 notes');
assert.equal(t('设置'),'Settings');assert.equal(t('__proto__'),'__proto__');assert.equal(t('constructor'),'constructor');
assert.equal(APPEARANCE_OPTIONS[0].label,'System');assert.equal(NOTE_SORT_OPTIONS[0].label,'Manual order');
assert.equal(t('已导入 {0} 篇笔记到「{1}」',2,'资料/中文笔记'),'Imported 2 notes into “资料/中文笔记”');
assert.equal(errorMessage('图片不存在：图片'),'The image does not exist: 图片');
assert.equal(errorMessage(new Error('笔记本不存在')),'The notebook does not exist.');
assert.equal(errorMessage('无法读取笔记：Error: 笔记不存在'),'Cannot read the note: Error: The note does not exist.');
assert.equal(errorMessage('notebook / 中文.md'),'notebook / 中文.md');
assert.match(errorMessage('CONFLICT: 笔记已被其他窗口或软件修改，原文件未覆盖'),/^CONFLICT: Another window/);
const editor={state:EditorState.create({doc:''}),focus(){},dispatch(spec){this.state=this.state.update(spec).state;}};
applyFormat(editor,{type:'insert',kind:'table'});assert.match(editor.state.doc.toString(),/Column 1/);assert.doesNotMatch(editor.state.doc.toString(),/[\u4e00-\u9fff]/);
fail=true;assert.throws(()=>setLocale('zh-CN'),/Storage full/);assert.equal(getLocale(),'en');fail=false;
values.set(LANGUAGE_KEY,'zh-CN');events.get('storage')({key:LANGUAGE_KEY});assert.equal(getLocale(),'zh-CN');assert.equal(APPEARANCE_OPTIONS[0].label,'跟随系统');assert.equal(NOTE_SORT_OPTIONS[0].label,'默认顺序');
unsubscribe();const last=changes;setLocale('en');assert.equal(changes,last);
// A reload uses the stored language, including defensive fallback for invalid data.
delete globalThis.document;
const fresh=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text+'\n// reload').toString('base64')}`);assert.equal(fresh.getLocale(),'en');
values.set(LANGUAGE_KEY,'invalid');events.get('storage')({key:LANGUAGE_KEY});assert.equal(fresh.getLocale(),'zh-CN');
// Guard every literal translation key and placeholder against missing/incomplete English.
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(dir,entry.name)):[path.join(dir,entry.name)]);}
let keys=0;
for(const file of files('src').filter(file=>/\.tsx?$/.test(file)&&!file.includes('/locales/'))){
 const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 function visit(node){
  if(ts.isCallExpression(node)&&node.expression.getText(ast)==='t'&&ts.isStringLiteral(node.arguments[0])){
   const key=node.arguments[0].text;assert.ok(Object.hasOwn(en,key),`Missing English: ${file}: ${key}`);keys++;
   assert.deepEqual([...en[key].matchAll(/\{\d+\}/g)].map(m=>m[0]).sort(),[...key.matchAll(/\{\d+\}/g)].map(m=>m[0]).sort(),`Placeholders: ${key}`);
  }
  ts.forEachChild(node,visit);
 }visit(ast);
}
console.log(`Passed: ${keys} translation call sites, persistence, live options, cross-window sync, storage failure, English snippets and errors preserving user paths.`);
