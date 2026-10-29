import assert from 'node:assert/strict';
import {build} from 'esbuild';
const result=await build({entryPoints:['src/lib/cm6/tableSelection.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {nextTableCell}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const cells=Array.from({length:3},(_,row)=>Array.from({length:3},(_,col)=>({row,col,rowSpan:1,colSpan:1}))).flat();
const before=JSON.stringify(cells);
for(const [direction,expected] of [['up',{row:0,col:1}],['down',{row:2,col:1}],['left',{row:1,col:0}],['right',{row:1,col:2}],['next',{row:1,col:2}],['previous',{row:1,col:0}]]) {
 assert.deepEqual(nextTableCell(cells,{row:1,col:1},direction),expected);
}
assert.deepEqual(nextTableCell(cells,{row:0,col:2},'next'),{row:1,col:0});
assert.deepEqual(nextTableCell(cells,{row:1,col:0},'previous'),{row:0,col:2});
for(const direction of ['up','left','previous']) assert.equal(nextTableCell(cells,{row:0,col:0},direction),null);
for(const direction of ['down','right','next']) assert.equal(nextTableCell(cells,{row:2,col:2},direction),null);
const merged=cells.filter(c=>!(c.row>=1&&c.col<2));merged.push({row:1,col:0,rowSpan:2,colSpan:2});
assert.deepEqual(nextTableCell(merged,{row:0,col:1},'down'),{row:1,col:0});
assert.deepEqual(nextTableCell(merged,{row:1,col:2},'left'),{row:1,col:0});
assert.deepEqual(nextTableCell(merged,{row:1,col:0},'right'),{row:1,col:2});
assert.deepEqual(nextTableCell(merged,{row:1,col:0},'next'),{row:1,col:2});
assert.equal(nextTableCell(merged,{row:1,col:0},'down'),null);
assert.equal(JSON.stringify(cells),before,'Navigation must not mutate table data');
assert.equal(nextTableCell([],{row:0,col:0},'next'),null);
console.log('Passed: directional cell navigation, Tab row wrapping, reverse navigation, table edges, merged cells and immutable source data.');
