import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('telemetry redacts handoff bodies, capability sessions and navigation fragments',()=>{
 const text=fs.readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
 const start=text.indexOf('function maskPhone'),end=text.indexOf('if (GLITCHTIP_DSN)');
 const source=ts.transpileModule(text.slice(start,end)+'\nexport {scrubObject,scrubHandoffUrl};',{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const result={};vm.runInNewContext(source,{exports:result});
 const token='a'.repeat(64), data={launch_token:token,handoff_token:token,session_token:token,session:token,authorization:`Bearer ${token}`, body:JSON.stringify({launch_token:token}),
  nested:{from:'https://admin.realtypandit.in/my-whatsapp/open.html#token='+token,to:'intent://admin.realtypandit.in/my-whatsapp/open.html#Intent;S.handoff_token='+token+';end'},
  url:'https://admin.realtypandit.in/my-whatsapp/open.html#token='+token,normal:'normal property description'};
 result.scrubObject(data);assert.ok(!JSON.stringify(data).includes(token));assert.equal(data.normal,'normal property description');
 assert.equal(result.scrubHandoffUrl('https://example.test/property'),'https://example.test/property');
 assert.match(text,/typeof event\.request\?\.data === 'string'/);
 assert.match(text,/if \(breadcrumb\.data\) scrubObject\(breadcrumb\.data\)/);
});
