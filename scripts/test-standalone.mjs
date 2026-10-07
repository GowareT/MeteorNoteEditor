import assert from "node:assert/strict";
import {readFileSync,readdirSync,lstatSync} from "node:fs";
import {join,resolve,dirname,sep} from "node:path";
import ts from "typescript";

const pkg=JSON.parse(readFileSync('package.json','utf8'));
const config=JSON.parse(readFileSync('src-tauri/tauri.conf.json','utf8'));
assert.equal(pkg.license,'MIT');
assert.equal(config.identifier,'org.meteornote.editor');
assert.equal(config.build.devUrl,'http://localhost:5183');
assert.ok(config.app.security.assetProtocol.scope.every(scope=>!scope.includes('MeteorNote/')&&!scope.includes('$HOME/**')));
const sources=[];
function walk(dir) {
  for(const entry of readdirSync(dir,{withFileTypes:true})) {
    const file=join(dir,entry.name);
    assert.ok(!lstatSync(file).isSymbolicLink(),`source depends on symlink: ${file}`);
    if(entry.isDirectory())walk(file); else if(/\.[jt]sx?$/.test(file))sources.push(file);
  }
}
walk('src');
for(const file of sources) {
  const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  for(const node of source.statements) if(ts.isImportDeclaration(node)) {
    const name=node.moduleSpecifier.text;
    assert.ok(!/^\//.test(name),`${file}: absolute import ${name}`);
    if(name.startsWith('.')) assert.ok(resolve(dirname(file),name).startsWith(resolve('src')+sep),`${file}: external relative import ${name}`);
    assert.ok(!/llmChat|noteCanvas|AIChatPanel|embedding_models|ResourceLibraryView/.test(name),`${file}: excluded feature ${name}`);
  }
}
const rust=readFileSync('src-tauri/src/lib.rs','utf8');
const handler=rust.match(/generate_handler!\[([\s\S]*?)\]/)[1];
const api=readFileSync('src/lib/api.ts','utf8');
for(const match of api.matchAll(/invoke(?:<[^>]+>)?\("([a-z_]+)"/g)) assert.ok(handler.includes(match[1]),`missing native handler ${match[1]}`);
assert.match(readFileSync('src-tauri/src/models.rs','utf8'),/base\.join\("MeteorNoteEditor"\)/);
console.log(`Passed: standalone identity, data scope, native API coverage and ${sources.length} source import boundaries.`);
