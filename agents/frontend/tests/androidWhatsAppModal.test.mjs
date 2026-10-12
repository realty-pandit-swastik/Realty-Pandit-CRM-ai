import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { setImmediate } from 'node:timers/promises';
import * as files from '../src/lib/personalWhatsAppFiles.ts';
import * as handoff from '../src/lib/androidWhatsAppHandoff.ts';
import * as phone from '../src/lib/phone.ts';

// Exercise the real modal with synthetic files and controlled API/hook state, without sending.
function modal() {
 const hooks=[], effects=[], posts=[], launches=[];
 let cursor=0, props={inventoryIds:['one'],onClose(){}}, response, expiry;
 const client={defaults:{baseURL:'https://api.realtypandit.in'},get:async path=>({data:{id:path.split('/').at(-1),media_urls:['/uploads/photo.jpg']}}),post:(path,body)=>{posts.push({path,body});return path.endsWith('/cancel')?Promise.resolve({}):new Promise(resolve=>{response=resolve;});}};
 const react={...React,
  useState(value){const i=cursor++;hooks[i]??={value};return [hooks[i].value,next=>{hooks[i].value=typeof next==='function'?next(hooks[i].value):next;}];},
  useCallback(fn,deps){const i=cursor++,old=hooks[i];if(!old||deps.some((d,j)=>d!==old.deps[j]))hooks[i]={deps,fn};return hooks[i].fn;},
  useRef(value){const i=cursor++;hooks[i]??={current:value};return hooks[i];},
  useEffect(fn,deps){const i=cursor++,old=hooks[i];if(!old||deps.some((d,j)=>d!==old.deps[j]))effects.push(()=>{old?.cleanup?.();hooks[i]={deps,cleanup:fn()};});},
 };
 const source=ts.transpileModule(fs.readFileSync(new URL('../src/components/PersonalWhatsAppShareModal.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(source,{module,exports:module.exports,require(name){
  if(name==='react')return react;if(name==='react/jsx-runtime')return {jsx:(type,props)=>React.createElement(type,props),jsxs:(type,props)=>React.createElement(type,props)};
  if(name.endsWith('/client'))return {default:client};if(name.endsWith('/phone'))return phone;
  if(name.endsWith('/personalWhatsAppFiles'))return files;if(name.endsWith('/androidWhatsAppHandoff'))return handoff;
  if(name.endsWith('/buildWhatsAppShareText'))return {buildWhatsAppShareText:()=>'Synthetic property details'};
  return name.endsWith('.css')?{}:{default:()=>null,ContactSearchField:()=>null};
 },navigator:{userAgent:'Android Chrome/140'},window:{location:{origin:'https://admin.realtypandit.in',assign:url=>launches.push(url)},setTimeout:fn=>{expiry=fn;return 1;},clearTimeout:()=>{}},document:{activeElement:null},setTimeout,Date,console});
 const walk=node=>!node||typeof node!=='object'?[]:[node,...(Array.isArray(node.props?.children)?node.props.children.flat(Infinity):[node.props?.children]).flatMap(walk)];
 const nodes=()=>{cursor=0;const tree=module.exports.default(props);effects.splice(0).forEach(fn=>fn());return walk(tree);};
 return {posts,launches,nodes,button:text=>nodes().find(n=>n.type==='button'&&String(n.props.children).includes(text)),
  setPhone:value=>nodes().find(n=>n.type==='input'&&n.props.type==='tel').props.onChange({target:{value}}),
  selectPhoto:()=>nodes().find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange(),
  flush:async()=>{await setImmediate();nodes();},resolve:value=>response({data:value}),
  expire:()=>expiry(), changeApp:()=>nodes().find(n=>n.type==='select').props.onChange({target:{value:'com.whatsapp.w4b'}}), changeIds:ids=>{props={...props,inventoryIds:ids};nodes();},unmount:()=>hooks.forEach(h=>h?.cleanup?.())};
}
const prepared=()=>({launch_token:'a'.repeat(64),expires_at:Date.now()+60_000});
test('helper requires recipient; explicit launch; property changes cancel preparation',async()=>{
 const m=modal();m.nodes();await m.flush();m.selectPhoto();
 await m.button('Prepare selected').props.onClick();assert.equal(m.posts.length,0);
 m.setPhone('9876543210');const pending=m.button('Prepare selected').props.onClick();m.resolve(prepared());await pending;
 assert.equal(m.posts[0].body.recipient,'+919876543210');assert.equal(m.launches.length,0);
 m.button('Open My WhatsApp').props.onClick();assert.equal(m.launches.length,1);
 m.changeIds(['two']);assert.equal(m.posts[1].path,'/api/personal-whatsapp/handoffs/cancel');assert.equal(m.button('Open My WhatsApp'),undefined);m.unmount();
});
test('obsolete recipient and closed preparation cancel without allowing launch',async()=>{
 for(const close of [false,true]){
  const m=modal();m.nodes();await m.flush();m.selectPhoto();m.setPhone('9876543210');const pending=m.button('Prepare selected').props.onClick();
  if(close)m.unmount();else m.setPhone('9999999999');m.resolve(prepared());await pending;
  assert.equal(m.posts.length,2);assert.equal(m.posts[1].path,'/api/personal-whatsapp/handoffs/cancel');assert.equal(m.launches.length,0);
  if(!close){assert.equal(m.button('Open My WhatsApp'),undefined);m.unmount();}
 }
});

test('duplicate preparation is suppressed; expiry and app/file changes revoke a ready capability',async()=>{
 for(const action of ['expire','changeApp','selectPhoto']){
  const m=modal();m.nodes();await m.flush();m.selectPhoto();m.setPhone('9876543210');
  const prepare=m.button('Prepare selected').props.onClick;const pending=prepare();await prepare();assert.equal(m.posts.length,1);
  m.resolve(prepared());await pending;m.nodes();m[action]();
  assert.equal(m.posts[1].path,'/api/personal-whatsapp/handoffs/cancel');assert.equal(m.button('Open My WhatsApp'),undefined);assert.equal(m.launches.length,0);m.unmount();
 }
});
