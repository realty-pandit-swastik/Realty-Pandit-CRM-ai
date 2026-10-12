import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { androidHandoffPayload, androidHandoffLaunch, validateAndroidHandoff, ANDROID_HANDOFF_PAGE } from '../src/lib/androidWhatsAppHandoff.ts';
const base = 'https://api.realtypandit.in';
const invs = [{id:'one',media_urls:['/uploads/one.jpg','/uploads/two.jpg'],video_urls:['/uploads/movie.mp4']},{id:'two'}];
const selection = {one:{urls:[`${base}/uploads/one.jpg`,`${base}/uploads/movie.mp4`,`${base}/uploads/two.jpg`],firstPhoto:`${base}/uploads/two.jpg`,pdf:true},two:{urls:[],firstPhoto:'',pdf:true}};
const token = 'a'.repeat(64);
test('payload normalizes unsaved recipient; exact cover order, video and PDF-only', () => {
 const value = androidHandoffPayload('9876543210','com.whatsapp.w4b',invs,selection,base);
 assert.equal(androidHandoffPayload('+35451234','com.whatsapp',invs,selection,base).recipient,'+35451234');
 assert.equal(androidHandoffPayload('+6581234567','com.whatsapp',invs,selection,base).recipient,'+6581234567');
 assert.equal(value.recipient,'+919876543210'); assert.equal(value.sending_app,'com.whatsapp.w4b');
 assert.deepEqual(value.properties,[{inventory_id:'one',media_urls:[`${base}/uploads/two.jpg`,`${base}/uploads/one.jpg`,`${base}/uploads/movie.mp4`],first_photo:`${base}/uploads/two.jpg`,pdf:true},{inventory_id:'two',media_urls:[],first_photo:'',pdf:true}]);
 assert.deepEqual(androidHandoffPayload('+12025550123','com.whatsapp',[invs[0]],{one:{urls:[`${base}/uploads/movie.mp4`],firstPhoto:'',pdf:false}},base).properties[0].media_urls,[`${base}/uploads/movie.mp4`]);
});
test('invalid recipient, empty selections, stale URLs and unselected cover fail', () => {
 for (const phone of ['','PENDING-9876543210','Chirag','+1']) assert.throws(()=>androidHandoffPayload(phone,'com.whatsapp',invs,selection,base),/recipient/);
 assert.throws(()=>androidHandoffPayload('9876543210','com.whatsapp',invs,{},base),/Choose/);
 assert.throws(()=>androidHandoffPayload('9876543210','com.whatsapp',invs,{one:{urls:[`${base}/uploads/foreign.mp4`],firstPhoto:'',pdf:false}},base));
 assert.throws(()=>androidHandoffPayload('9876543210','com.whatsapp',invs,{one:{urls:[`${base}/uploads/one.jpg`],firstPhoto:`${base}/uploads/two.jpg`,pdf:false}},base),/first photo/);
});
test('capability stays in fragment; fallback URL never contains it', () => {
 const launch = androidHandoffLaunch(token,'Android Chrome/140');
 assert.match(launch,/^intent:\/\/admin\.realtypandit\.in\/my-whatsapp\/open\.html#Intent;/);
 assert.match(launch,/package=com.realtypandit.mywhatsapp;/); assert.match(launch,new RegExp(`S.handoff_token=${token};`));
 const fallback = decodeURIComponent(launch.match(/S.browser_fallback_url=([^;]+)/)[1]); assert.equal(fallback,ANDROID_HANDOFF_PAGE); assert.ok(!fallback.includes(token));
 const regular = new URL(androidHandoffLaunch(token,'Android Firefox/140')); assert.equal(regular.search,''); assert.equal(regular.hash,`#token=${token}`);
 assert.throws(()=>androidHandoffLaunch('bad;evil','Android Chrome/140'));
});
test('expired handoff rejected; fallback removes fragment without trackers', () => {
 assert.throws(()=>validateAndroidHandoff({launch_token:token,expires_at:100},100),/expired/);
 assert.throws(()=>validateAndroidHandoff({launch_token:'bad',expires_at:101},100));
 assert.equal(validateAndroidHandoff({launch_token:token,expires_at:101},100).launch_token,token);
 const html = readFileSync(new URL('../public/my-whatsapp/open.html',import.meta.url),'utf8');
 assert.match(html,/history\.replaceState\(null, '', location\.pathname\)/);
 assert.match(html,/name="referrer" content="no-referrer"/); assert.doesNotMatch(html,/<script[^>]+src=|sentry|analytics|location\.search/i);
});
test('modal invalidates obsolete and closed preparation; helper never marks sent', () => {
 const modal = readFileSync(new URL('../src/components/PersonalWhatsAppShareModal.tsx',import.meta.url),'utf8');
 assert.match(modal,/handoffs\/cancel/); assert.match(modal,/generation\.current !== current/); assert.match(modal,/active\.current = false; generation\.current\+\+; cancelPrepared\(\)/);
 const helper = modal.slice(modal.indexOf('async function prepareAndroid'),modal.indexOf('function update')); assert.doesNotMatch(helper,/onSent|status: 'sent'/);
});
