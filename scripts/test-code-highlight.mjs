import assert from "node:assert/strict";
import { build } from "esbuild";

const result = await build({entryPoints:["src/lib/codeHighlight.ts"],bundle:true,write:false,platform:"node",format:"esm",logLevel:"silent"});
const {highlightCodeTokens,resolveCodeLanguage,CODE_LANGUAGE_OPTIONS}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
const cases=[
  ["python", 'def hello():\n    print("Hello")\n    return True', "def", "tok-keyword"],
  ["js", 'const greeting = "Hello";\nconsole.log(greeting);', "const", "tok-keyword"],
  ["ts", 'const value: number = 42;', "42", "tok-number"],
  ["json", '{"name": "test", "count": 42}', "42", "tok-number"],
  ["bash", 'echo "hello" # comment', "# comment", "tok-comment"],
  ["csharp", 'public class Test { public int value = 42; }', "42", "tok-number"],
];
for(const [language,code,word,style] of cases){
  const tokens=await highlightCodeTokens(code,language);
  assert.ok(tokens.some(t=>code.slice(t.from,t.to)===word&&t.className.includes(style)),`${language}: missing ${word}`);
  let previous=0;
  for(const token of tokens){assert.ok(token.from>=previous&&token.to>token.from&&token.to<=code.length);previous=token.to;}
}
for(const [value] of CODE_LANGUAGE_OPTIONS){if(value)assert.ok(resolveCodeLanguage(value),value);}
for(const language of ["", "text", "plaintext", "unknown-language"]){assert.deepEqual(await highlightCodeTokens("const x = 42",language),[]);}
assert.equal(resolveCodeLanguage("PYTHON"),resolveCodeLanguage("python"));
assert.equal(resolveCodeLanguage("py"),resolveCodeLanguage("python"));
assert.equal(resolveCodeLanguage("js"),resolveCodeLanguage("javascript"));
assert.equal(resolveCodeLanguage("c#"),resolveCodeLanguage("csharp"));
console.log("Passed: Python, JavaScript, TypeScript, JSON, Bash, C#, language options, aliases, plain text fallback, token ranges.");
