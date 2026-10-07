import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const lock = JSON.parse(readFileSync(join(root,"package-lock.json"),"utf8"));
const sections = [];
function record(name, version, license, directory, extra = []) {
  const files = [...new Set([...readdirSync(directory).filter(file => /^(licen[sc]e|copying|notice)([._-]|$)/i.test(file)), ...extra])];
  const texts = files.filter(file => existsSync(join(directory,file))).flatMap(file => {
    try {return [`### ${basename(file)}\n\n\`\`\`text\n${readFileSync(join(directory,file),'utf8').trim()}\n\`\`\``];} catch {return [];}
  });
  sections.push(`## ${name} ${version}\n\nLicense: ${license || 'See upstream package'}\n\n${texts.length ? texts.join('\n\n') : 'License text is not bundled in the installed package; consult its upstream distribution before binary redistribution.'}`);
}
for (const [relative, info] of Object.entries(lock.packages)) {
  if (!relative || info.dev || !relative.includes('node_modules/')) continue;
  const dir=join(root,relative);
  if (!existsSync(join(dir,'package.json'))) continue;
  const pkg=JSON.parse(readFileSync(join(dir,'package.json'),'utf8'));
  record(pkg.name,pkg.version,pkg.license,dir);
}
const rustHost = execFileSync('rustc',['-vV'],{encoding:'utf8'}).match(/^host: (.+)$/m)[1];
const metadata=JSON.parse(execFileSync('cargo',['metadata','--locked','--offline','--format-version','1','--filter-platform',rustHost],{cwd:join(root,'src-tauri'),encoding:'utf8',maxBuffer:30*1024*1024}));
const resolved=new Set(metadata.resolve.nodes.map(node=>node.id));
for(const pkg of metadata.packages) {
  if(!pkg.source || !resolved.has(pkg.id))continue;
  record(pkg.name,pkg.version,pkg.license,dirname(pkg.manifest_path),pkg.license_file?[pkg.license_file]:[]);
}
sections.sort();
writeFileSync(join(root,'THIRD_PARTY_NOTICES.md'),`# Third-party notices\n\nGenerated from installed production npm packages and the locked Rust dependency graph for ${rustHost}. Dependencies retain their own licenses; the project MIT license does not replace them. Development tooling and other platform targets may add licenses. Regenerate with \`node scripts/generate-notices.mjs\` after installing dependencies and fetching Rust crates.\n\nUI icons use Lucide (ISC), including the upstream attribution in its license below. Original notebook icons retain the MIT notice in \`src/assets/library-icons/LICENSE.md\`.\n\n${sections.join('\n\n')}\n`);
console.log(`Wrote notices for ${sections.length} packages.`);
