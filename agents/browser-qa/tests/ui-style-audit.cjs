// Read-only lexical inventory. Counts include comments/non-rendered literals;
// inspect occurrences before changing business-significant messages or assets.
// node tests/ui-style-audit.cjs [--summary]
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const ignore = new Set(['.git','node_modules','dist','.next','coverage','graphify-out','.taste-skill']);
const patterns = {
  emoji: /\p{Extended_Pictographic}|\p{Regional_Indicator}|[\uFE0F\u20E3]|\\u\{(?:1[fF][\da-fA-F]{3}|2[\da-fA-F]{3})\}|\\u[dD]83[\da-fA-F]/gu,
  encodedEmoji: /&#(?:x([\da-f]+)|(\d+));|\\u([\da-f]{4})/gi,
  symbols: /[✓✔✕✖✗★☆●○◆◇▶▷◀◁▲▼→←↗↘•·]/gu,
  colours: /#[\da-fA-F]{3,8}\b|(?:rgb|hsl)a?\([^)]*\)|(?:bg|text|border|from|via|to)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}/g,
  untokenizedColours: /(?<!&)#[\da-fA-F]{3,8}\b|(?:rgb|hsl)a?\([^)]*\)/g,
  effects: /(?:linear|radial|conic)-gradient\(|backdrop-filter|backdropFilter|\bglow\b|\bneon\b|box-shadow|boxShadow|borderRadius:\s*['"]?(?:999\d*|[2-9]\d)\b|border-radius:\s*(?:999\d*|[2-9]\d)px/gi,
  hype: /supercharge|unlock the power|revolutioni[sz]e|game.chang|next.level|seamless(?:ly)?|effortless(?:ly)?|amazing|awesome|let['’]s go|[!！](?=[\s<'"`])/gi,
};
const files = [], palette = new Map();
function walk(dir) {
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    if(ignore.has(entry.name)||entry.name.startsWith('.env')||/auth|lock/i.test(entry.name)) continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) { walk(full); continue; }
    if(!/\.(?:tsx?|jsx?|[cm]js|css|scss|html|md|txt|json|ya?ml|py|kt)$/i.test(entry.name)) continue;
    const text=fs.readFileSync(full,'utf8'),file=path.relative(root,full).replaceAll('\\','/');
    const counts=Object.fromEntries(Object.entries(patterns).map(([name,re])=>[name,[...text.matchAll(re)].length]));
    counts.encodedEmoji=[...text.matchAll(patterns.encodedEmoji)].filter(m=>{
      const code=m[1]?parseInt(m[1],16):m[2]?Number(m[2]):parseInt(m[3],16);
      return code<=0x10ffff&&/[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3]/u.test(String.fromCodePoint(code));
    }).length;
    // CSS token declarations are allowed to own colour values. Ignore numeric
    // HTML entities, and audit utility class names separately from actual colours.
    counts.untokenizedColours=file.startsWith('agents/frontend/src/')?text.split(/\r?\n/).filter(line=>!/^\s*--[\w-]+\s*:/.test(line)).reduce((n,line)=>n+[...line.matchAll(patterns.untokenizedColours)].length,0):0;
    if(Object.values(counts).some(Boolean)) files.push({file,...counts});
    if(file.startsWith('agents/frontend/src/')) for(const match of text.matchAll(patterns.colours)) palette.set(match[0].toLowerCase(),(palette.get(match[0].toLowerCase())||0)+1);
  }
}
walk(root);
const totals = rows=>Object.fromEntries(Object.keys(patterns).map(k=>[k,rows.reduce((n,r)=>n+r[k],0)]));
const result={note:'Lexical occurrences, not confirmed rendered defects. Includes docs, comments and icon-adapter keys. Colour matches can include numeric HTML entities. Generated/vendor/secret/auth files excluded.',totals:totals(files),crmTotals:totals(files.filter(r=>r.file.startsWith('agents/frontend/'))),websiteTotals:totals(files.filter(r=>r.file.startsWith('agents/website/')))};
if(process.argv.includes('--crm')) result.files=files.filter(r=>r.file.startsWith('agents/frontend/src/')).sort((a,b)=>process.argv.includes('--colours')?b.untokenizedColours-a.untokenizedColours:b.emoji-a.emoji);
else if(!process.argv.includes('--summary')) { result.files=files; result.crmPalette=[...palette.entries()].sort((a,b)=>b[1]-a[1]); }
console.log(JSON.stringify(result,null,2));
