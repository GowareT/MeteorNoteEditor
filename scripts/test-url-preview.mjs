import assert from 'node:assert/strict';
import {build} from 'esbuild';

const result = await build({stdin: {resolveDir: process.cwd(), contents: `
  export {EditorState} from '@codemirror/state';
  export {markdown, markdownLanguage} from '@codemirror/lang-markdown';
  export {livePreviewExtension} from './src/lib/cm6/livePreview';
`}, bundle: true, write: false, platform: 'node', format: 'esm', loader: {'.css': 'empty'},
  banner: {js: "import {createRequire} from 'node:module'; const require = createRequire(process.cwd() + '/package.json');"},
  logLevel: 'silent'});
const {EditorState, markdown, markdownLanguage, livePreviewExtension} = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
);

let count = 0;
for (const readOnly of [false, true]) {
  for (const inlineOnly of [false, true]) {
    for (const [source, visible] of [
      ['https://github.com/GowareT/MeteorNoteEditor', 'https://github.com/GowareT/MeteorNoteEditor'],
      ['前文 https://example.com/path?q=hello&lang=zh 后文', '前文 https://example.com/path?q=hello&lang=zh 后文'],
      ['www.example.com', 'www.example.com'],
      ['<https://example.com>', 'https://example.com'],
      ['[官网](https://example.com)', '官网'],
      ['`https://example.com`', 'https://example.com'],
    ]) {
      const field = livePreviewExtension(null, null, inlineOnly);
      const state = EditorState.create({doc: source, extensions: [
        markdown({base: markdownLanguage}), EditorState.readOnly.of(readOnly), field,
      ]});
      const hidden = new Set();
      state.field(field).between(0, source.length, (from, to, decoration) => {
        if (from < to && !decoration.spec.class && !decoration.spec.widget) {
          for (let i = from; i < to; i++) hidden.add(i);
        }
      });
      assert.equal([...source].filter((_, i) => !hidden.has(i)).join(''), visible,
        `readOnly=${readOnly}, inlineOnly=${inlineOnly}: ${source}`);
      assert.equal(state.doc.toString(), source, 'Rendering must preserve the URL source');
      count++;
    }
  }
}
console.log(`Passed: ${count} URL visibility cases across editing, reading and table-cell previews.`);
