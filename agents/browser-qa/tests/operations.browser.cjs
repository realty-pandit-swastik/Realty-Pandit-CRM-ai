// Read-only, isolated synthetic smoke coverage for the operational screens.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output=path.join(process.env.TEMP,'opencode','rp-operations-verification');
const views=['Contacts','Tasks','Marketing','Workflows','Calendar','Emails','Team','Reports','My Profile','Inventory','Deal Pipeline','Ext. Leads'];
const review=process.argv.includes('--review');
const enforceAccessibility=process.argv.includes('--enforce-a11y');
const headings={Contacts:/^Contacts/,Tasks:'Task Management',Marketing:'Marketing Campaign Builder',Workflows:'AI Workflow Automation',Calendar:'Calendar & Appointments',Emails:'Email Management',Team:'Team Management',Reports:'Reports','My Profile':'My Profile','Deal Pipeline':'Deal Pipeline','Ext. Leads':'Leads'};
async function main() {
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch();
  const errors=[],requests=[],observations=[],accessibility=[];
  try {
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}});
  let axeSource,axeUnavailable;
  if(review) {
    try {
      const response=await fetch('https://cdn.jsdelivr.net/npm/axe-core@4.10.3/axe.min.js',{signal:AbortSignal.timeout(15000)});
      if(!response.ok) throw new Error(`axe download: ${response.status}`);
      axeSource=await response.text();
    } catch(error) { axeUnavailable=error.message; }
  }
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url()),p=url.pathname;
    if(!['localhost','127.0.0.1'].includes(url.hostname)) return route.abort();
    if(!/^\/(api|auth|public)\//.test(p)) return route.continue();
    requests.push({path:p,method:request.method()});
    let data={};
    if(p==='/auth/me') data={id:'test-operator',name:'Test Operator',role:'super_boss',tenant_id:'synthetic-only',permissions:['view_inventory','edit_inventory','view_reports','manage_agents','manage_team','manage_deals','act_on_deals']};
    else if(p==='/api/contacts'||/\/team\/members/.test(p)) data=[];
    else if(p==='/api/contacts/directory') data={contacts:[],total:0,counts:{}};
    else if(p.includes('recent-external')) data={leads:[],total:0};
    else if(p==='/api/inventory') data={data:[],total:0,totalPages:1};
    else if(p.includes('/appointments')) data={appointments:[],data:[],total:0};
    else if(p==='/api/deals') data={deals:[],data:[],total:0};
    else if(p.includes('notifications')) data={data:[],notifications:[],count:0,unread_count:0};
    else if(p.includes('/tasks/stats/summary')) data={total:0,by_status:{},overdue:0,high_priority:0};
    else if(p.includes('/tasks')) data={tasks:[]};
    else if(p.includes('/projects')) data={projects:[]};
    else if(p.includes('/campaigns')) data={campaigns:[]};
    else if(p.includes('/templates')) data={templates:[]};
    else if(p.includes('/workflows')) data={workflows:[]};
    else if(p.includes('/emails')) data={emails:[],total:0,stats:{},data:[]};
    else if(p.includes('/reports/')) data={data:[],summary:{},total:0};
    else if(p.startsWith('/public/')) data=[];
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-10-26T15:30:00Z'));
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const label of views) for(const width of [360,768,1024,1280]) {
    await page.setViewportSize({width,height:900});
    await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
    await page.locator('#rp-dashboard-panel h1').waitFor();
    if(width<768) {
      await page.getByRole('button',{name:'Open navigation menu',exact:true}).click();
      await page.getByRole('dialog',{name:'Navigation menu',exact:true}).getByRole('button',{name:label,exact:true}).click();
    } else {
      await page.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('button',{name:label,exact:true}).click();
    }
    if(width<768&&label==='Calendar') await page.getByText('No appointments',{exact:true}).waitFor();
    else if(width<768&&label==='Team') await page.getByText(/^Team Members \(/).waitFor();
    else if(headings[label]) await page.getByRole('heading',{name:headings[label],exact:typeof headings[label]==='string'}).first().waitFor();
    else await page.getByRole('button',{name:width<768?'Add Property':'+ Add Property',exact:true}).first().waitFor();
    await page.waitForFunction(()=>{
      const main=document.querySelector('#main-content');
      return main&&!main.querySelector('[aria-busy="true"]')&&![...main.querySelectorAll('*')].some(e=>!e.children.length&&/^Loading[^\n]*(?:\.{3}|…)$/.test(e.textContent.trim()));
    });
    const metrics=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,emoji:[...document.body.innerText.matchAll(/\p{Extended_Pictographic}|\p{Regional_Indicator}/gu)].length}));
    observations.push({view:label,...metrics});
    await page.screenshot({path:path.join(output,`${label.toLowerCase().replaceAll(' ','-').replaceAll('.','')}-${width}.png`),fullPage:true});
    assert.ok(metrics.scroll<=width+1,`page overflow: ${label}/${width}`);
    assert.equal(metrics.emoji,0,`rendered application emoji: ${label}/${width}`);
    if(label==='Reports') {
      const refresh=await page.getByRole('button',{name:'Refresh',exact:true}).boundingBox();
      assert.ok(refresh&&refresh.x>=0&&refresh.x+refresh.width<=width+1,`report Refresh clipped at ${width}`);
      await page.getByRole('combobox',{name:'Report type',exact:true}).waitFor();
      if(width<768) {
        const categories=page.getByRole('button',{name:'Show report categories',exact:true});
        const toggle=await categories.boundingBox();
        const visits=await page.getByRole('navigation',{name:'Primary mobile navigation'}).getByRole('button',{name:'Visits',exact:true}).boundingBox();
        assert.ok(toggle&&visits&&toggle.y+toggle.height<=visits.y,`report categories overlaps mobile navigation at ${width}`);
        await categories.focus();
        await page.keyboard.press('Enter');
        await page.getByRole('navigation',{name:'Report categories',exact:true}).waitFor();
        assert.equal(await page.getByRole('button',{name:'Hide report categories',exact:true}).getAttribute('aria-expanded'),'true');
        await page.getByRole('button',{name:'Hide report categories',exact:true}).click();
      }
    }
    if(axeSource&&[360,1280].includes(width)) {
      await page.addScriptTag({content:axeSource});
      const violations=await page.evaluate(async()=>{
        const result=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});
        return result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));
      });
      accessibility.push({view:label,width,violations});
    }
  }
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({result:'COMPLETED',errors,observations,requests,accessibility,axeUnavailable},null,2));
  assert.deepEqual(errors,[],'runtime errors');
  if(enforceAccessibility) {
    assert.ok(axeSource,`accessibility not run: ${axeUnavailable}`);
    assert.deepEqual(accessibility.filter(a=>a.violations.length),[],'operational accessibility violations');
  }
  console.log(JSON.stringify({result:'PASS',mode:'read-only synthetic responses; no real authentication',screenshots:observations.length,remainingRenderedEmoji:observations.filter(o=>o.emoji),accessibility:accessibility.map(a=>({view:a.view,width:a.width,violations:a.violations.map(v=>v.id)})),axeUnavailable,output},null,2));
  } catch(error) {
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({result:'FAIL',failure:error.message,errors,observations,requests,accessibility},null,2));
    throw error;
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exit(1)});
