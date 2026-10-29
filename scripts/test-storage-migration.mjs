import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
const cache=new Map();
globalThis.localStorage={getItem:key=>cache.get(key)??null,setItem:(key,value)=>cache.set(key,value)};
const events=[];
globalThis.window={dispatchEvent:event=>{events.push(event.type);return true;},addEventListener(){}};
const children=[{id:'Book',name:'Book',notes:[],children:[{id:'Book/Child',name:'Child',notes:[],children:[]}]}];
globalThis.__storeApi={loadLibrary:async()=>children,listTrash:async()=>[]};
const source=await readFile('src/store/appStore.ts','utf8');
const names=[...new Set([...source.matchAll(/api\.(\w+)/g)].map(m=>m[1]))];
const storeBundle=await build({stdin:{resolveDir:process.cwd(),contents:`export {useAppStore} from './src/store/appStore'; export * from './src/lib/notebookExpansion';`},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'test-api',setup(b){
 b.onResolve({filter:/^@\/lib\/api$/},()=>({path:'api',namespace:'test'}));
 b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:names.map(name=>`export const ${name} = (...args) => globalThis.__storeApi.${name}(...args);`).join('\n')}));
}}]});
const {useAppStore,NOTEBOOK_EXPANSION_KEY,readNotebookExpansion,writeNotebookExpansion}=await import(`data:text/javascript;base64,${Buffer.from(storeBundle.outputFiles[0].text).toString('base64')}`);
assert.equal(readNotebookExpansion(),null);
await useAppStore.getState().bootstrap();
assert.deepEqual([...useAppStore.getState().expandedNotebooks],['Book']);
useAppStore.getState().toggleNotebook('Book/Child');
await useAppStore.getState().bootstrap();
assert.deepEqual([...useAppStore.getState().expandedNotebooks],['Book','Book/Child']);
useAppStore.getState().toggleNotebook('Book');useAppStore.getState().toggleNotebook('Book/Child');
await useAppStore.getState().bootstrap();
assert.deepEqual([...useAppStore.getState().expandedNotebooks],[],'All collapsed survives reopening');
writeNotebookExpansion(new Set(['Book/Child','Deleted']));
await useAppStore.getState().bootstrap();assert.deepEqual([...useAppStore.getState().expandedNotebooks],['Book/Child']);
cache.set(NOTEBOOK_EXPANSION_KEY,'broken');await useAppStore.getState().bootstrap();assert.deepEqual([...useAppStore.getState().expandedNotebooks],['Book']);

const calls=[];let failSave=false;
globalThis.__invoke=async(name,args)=>{
 calls.push(name);
 if(name==='read_note')return '# Note\nold';
 if(name==='write_note'){if(failSave)throw Error('save failed');return;}
 if(name==='change_library_location'){assert.equal(args.folder,'/chosen');return '/chosen/MeteorNoteEditor/Notebooks';}
 throw Error(name);
};
const apiBundle=await build({entryPoints:['src/lib/api.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'native-mock',setup(b){
 b.onResolve({filter:/^@tauri-apps\/api\/(core|window)$/},args=>({path:args.path,namespace:'test'}));
 b.onLoad({filter:/.*/,namespace:'test'},args=>({contents:args.path.endsWith('/core')?'export const invoke=globalThis.__invoke; export const isTauri=()=>false;':'export const getCurrentWindow=()=>({label:"main"});'}));
}}]});
const api=await import(`data:text/javascript;base64,${Buffer.from(apiBundle.outputFiles[0].text).toString('base64')}`);
await api.documents.open('Book/Note');api.documents.stage('Book/Note','# Note\nnew');
assert.equal(await api.changeLibraryLocation('/chosen'),'/chosen/MeteorNoteEditor/Notebooks');
assert.ok(calls.indexOf('write_note')<calls.indexOf('change_library_location'));
assert.equal(api.getCachedLibraryRootPath(),'/chosen/MeteorNoteEditor/Notebooks');
assert.ok(events.includes('mne-library-root-changed'));
api.documents.stage('Book/Note','# Note\nunsaved'); failSave=true;calls.length=0;
await assert.rejects(()=>api.changeLibraryLocation('/chosen'),/save failed/);
assert.ok(!calls.includes('change_library_location'),'Failed draft save must prevent migration');
console.log('Passed: tree reopening/collapsed state, stale IDs, corrupt preferences, draft-save ordering, root cache/event updates and save-failure migration protection.');
