import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({stdin:{resolveDir:process.cwd(),contents:`
 export {EditorState} from '@codemirror/state';
 export {markdown,markdownLanguage} from '@codemirror/lang-markdown';
 export {continueFormattedList} from './src/lib/cm6/markdownEditingKeys';
`},bundle:true,write:false,format:'esm',platform:'node'});
const {EditorState,markdown,markdownLanguage,continueFormattedList}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const second='\n- **免费内容体验2**';
let count=0;
for(const [before,after] of [
 ['- **免费内容体验1¦**'+second,'- **免费内容体验1**\n- ¦'+second],
 ['- **免费内容¦体验1**'+second,'- **免费内容**\n- **¦体验1**'+second],
 ['- **¦免费内容体验1**'+second,'- \n- ¦**免费内容体验1**'+second],
 ['- ***甲¦乙***','- ***甲***\n- ***¦乙***'],
 ['- __甲¦乙__','- __甲__\n- __¦乙__'],
 ['- **甲 *乙¦丙* 丁**','- **甲 *乙***\n- ***¦丙* 丁**'],
 ['1. **甲¦乙**','1. **甲**\n2. **¦乙**'],
 ['  + **甲¦乙**','  + **甲**\n  + **¦乙**'],
 ['- [x] **甲¦乙**','- [x] **甲**\n- [ ] **¦乙**'],
 ['- ~~甲¦乙~~','- ~~甲~~\n- ~~¦乙~~'],
 ['- `甲¦乙`','- `甲`\n- `¦乙`'],
]){
 const head=before.indexOf('¦'),doc=before.replace('¦','');
 const view={state:EditorState.create({doc,selection:{anchor:head},extensions:[markdown({base:markdownLanguage})]}),composing:false,dom:{closest:()=>null},dispatch(spec){this.state=this.state.update(spec).state;}};
 assert.equal(continueFormattedList(view),true,before);
 assert.equal(view.state.doc.toString(),after.replace('¦',''),before);
 assert.equal(view.state.selection.main.head,after.indexOf('¦'),before);
 count++;
}
for(const doc of ['- plain','- **done**','normal **text**','- ']){
 const view={state:EditorState.create({doc,selection:{anchor:doc.length},extensions:[markdown({base:markdownLanguage})]}),dom:{closest:()=>null},dispatch(){throw Error('Must keep native Markdown behavior');}};
 assert.equal(continueFormattedList(view),false,doc);
}
console.log(`Passed: ${count} formatted list splits, nested styles, ordered/task lists, cursor positions and native fallback.`);
