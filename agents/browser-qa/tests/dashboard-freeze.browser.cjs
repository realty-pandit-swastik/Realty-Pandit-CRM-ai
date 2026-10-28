// Isolated characterization: synthetic API responses only, never real credentials.
// node tests/dashboard-freeze.browser.cjs before|after
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../../frontend/node_modules/typescript');
const stage = process.argv[2] || 'after';
const root = path.resolve(__dirname, '../../..');
const out = path.join(process.env.TEMP, 'opencode', 'rp-dashboard-freeze');
// Match the recorded baseline date. Freeze Date only; browser timers still run.
const clockTime = '2026-10-26T15:30:00.000Z';
const normal = s => s.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').replace(/\s+/g, ' ').trim();
const componentRoot = path.join(root, 'agents/frontend/src/components');
function sourceContracts() {
  const files = ['DashboardTabs.tsx', ...fs.readdirSync(path.join(componentRoot, 'dashboard')).filter(f=>f.endsWith('.tsx')).map(f=>'dashboard/'+f), ...['FilterBar','AsyncState','clay','charts','TargetsEditor'].map(f=>'dashboard/analytics/'+f+'.tsx')];
  const contracts = {};
  for (const f of files) {
    const source = fs.readFileSync(path.join(componentRoot, f),'utf8');
    const ast = ts.createSourceFile(f, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const values = [];
    function walk(n) {
      if (ts.isCallExpression(n) && /^(get[A-Z]|updateTeamTargets|use(State|Effect|Memo|AsyncData)|React\.use|drillTo|setRange|setSortBy|setSelected)/.test(n.expression.getText(ast))) {
        // Full effect/memo bodies include presentation-only colour literals in some files.
        if (/useEffect|useMemo|useAsyncData/.test(n.expression.getText(ast))) values.push(n.expression.getText(ast));
        else values.push(n.getText(ast).replace(/\s+/g,''));
      }
      if (ts.isJsxAttribute(n) && (/^on[A-Z]/.test(n.name.getText(ast)) || ['id','data-testid','aria-label','aria-controls','aria-labelledby'].includes(n.name.getText(ast)))) values.push(n.getText(ast).replace(/\s+/g,''));
      ts.forEachChild(n,walk);
    }
    walk(ast); contracts[f]=values;
  }
  return contracts;
}
async function main() {
  fs.mkdirSync(path.join(out,stage),{recursive:true});
  const contracts=sourceContracts();
  if(stage==='before') fs.writeFileSync(path.join(out,'contracts.json'),JSON.stringify(contracts,null,2));
  else assert.deepEqual(contracts,JSON.parse(fs.readFileSync(path.join(out,'contracts.json'))),'dashboard calls/defaults/handlers/accessibility identifiers changed');
  const browser=await chromium.launch();
  const observations=[];
  let axeSource;
  if(stage==='after') { try { const res=await fetch('https://cdn.jsdelivr.net/npm/axe-core@4.10.3/axe.min.js',{signal:AbortSignal.timeout(15000)}); if(res.ok) axeSource=await res.text(); } catch {} }
  for(const role of ['super_boss','manager','employee']) {
    const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
    const requests=[],errors=[];
    let mode='ready';
    const now=clockTime;
    const perf={agent_id:'fixture-agent',agent_name:'Test Reviewer',role,leads_assigned:12,hot_leads:3,appointments_scheduled:4,appointments_completed:2,deals_closed:1,revenue_generated:250000,commission:5000,inventory_added:3,productivity_score:65,productivity_category:'Good',components:{leads:40,conversion:50,appointments:60,inventory:70}};
    await context.route('**/*',async route=>{
      const req=route.request(),u=new URL(req.url());
      if(!['localhost','127.0.0.1'].includes(u.hostname)) return route.abort();
      if(!/^\/(api|auth|public)\//.test(u.pathname)) return route.continue();
      requests.push({path:u.pathname,method:req.method(),query:Object.fromEntries(u.searchParams)});
      let d={};
      if(u.pathname==='/auth/me') d={id:'fixture-agent',name:'Test Reviewer',role,tenant_id:'test-only',permissions:['view_inventory',...(role==='employee'?[]:['view_reports','manage_team','manage_agents'])]};
      else if(u.pathname==='/api/contacts') {
        if(mode==='error') return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Test-only failure"}'});
        d=mode==='empty'?[]:[{id:'fixture-contact',name:'Test Contact',contact_type:'BUYER',lead_status:'hot',source:'manual',created_at:now,assigned_agent_id:'fixture-agent'}];
      }
      else if(u.pathname.endsWith('/market-trends')) d={leads:[{date:now,count:12}],visits:[{date:now,count:2}],sales:[{date:now,count:1}]};
      else if(u.pathname.endsWith('/alerts')) d={alerts:[{type:'stale_leads',count:2},{type:'inventory_missing_photos',count:1}]};
      else if(u.pathname.endsWith('/my-queue')) d={tasks:[{id:'test-task',task_type:'CALLBACK_REQUEST',priority:'HIGH',due_date:'2026-10-26T15:29:59.000Z',contact:{name:'Test Contact'}}]};
      else if(u.pathname==='/api/inventory') d={data:[],total:7};
      else if(u.pathname==='/api/deals/pipeline') d={data:{NEW:3,CLOSED_WON:1}};
      else if(u.pathname.endsWith('/activity')) d={shares:[{created_at:now,agent:{name:'Test Reviewer'},inventory:{location:'Test locality'}}],appointments:[]};
      else if(u.pathname.endsWith('/financial-summary')) d={total_commission:5000,total_revenue:250000};
      else if(u.pathname.endsWith('/speed-to-lead')) d={median_minutes:15,by_agent:[{agent_id:'fixture-agent',avg_minutes:15,n:3}]};
      else if(u.pathname.endsWith('/user-performance')) d={performance:[perf]};
      else if(u.pathname.endsWith('/team-performance')) d={teams:[{team_id:'test-team',team_name:'Test Team',member_count:2,leads:12,hot_leads:3,appointments:4,appointments_completed:2,deals_closed:1,revenue:250000,inventory_added:3,conversion_rate:8.3,team_score:65,team_category:'Good'}]};
      else if(u.pathname.endsWith('/distribution')) d={load:[{agent_id:'fixture-agent',agent_name:'Test Reviewer',active_leads:12}],unassigned_leads:2,by_route:[{route:'manual',count:12}],by_method:[{method:'assigned',count:12}]};
      else if(u.pathname.endsWith('/gci-forecast')) d={weighted_gci:15000,raw_ceiling:30000,with_budget:2,total_open:3,by_stage:[{stage:'NEW',probability:.5,count:2,weighted_gci:15000}],disclaimer:'Test-only directional estimate.'};
      else if(u.pathname.endsWith('/targets')) d={targets:{leads:30,appointments:15,inventory:10,conversionRate:.2}};
      else if(u.pathname.endsWith('/property-trends')) d={status_breakdown:[{status:'active',count:7}],intent_breakdown:[{intent:'sell',count:7}],type_breakdown:[{type:'apartment',count:7}],pulse:{total:7,active:7,added:2,pct_with_photos:70,avg_days_on_market:14,pct_shareable:80},needs_action:{missing_photos:1,stale_60d:2,pending_approval:1,overpriced:0,no_matched_buyer:1},ageing:[{bucket:'0–7d',count:7}],price_positioning:{under:2,at:3,over:1,unpriced:1,sample:6},supply_demand:[{sub_category:'Apartment',supply:7,demand:9,gap:2}],by_location:[{locality:'Test locality',count:7}],top_listings:[{inventory_id:'test-listing',title:'Test Listing',shares:4,visits:2,enquiries:1,score:7}]};
      else if(u.pathname.includes('notifications')) d={notifications:[],unread_count:0};
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(d)});
    });
    const page=await context.newPage();
    await page.clock.setFixedTime(new Date(clockTime));
    page.on('pageerror',e=>errors.push(e.message));
    await page.emulateMedia({reducedMotion:'reduce'});
    const tabs=role==='employee'?['main','lead-intel','users','property']:['main','lead-intel','users','teams','property'];
    for(const tab of tabs) {
      await page.goto(`http://127.0.0.1:5173/?rpDashboard=${tab}`,{waitUntil:'networkidle'});
      const panel=page.locator('#rp-dashboard-panel');
      await panel.locator('h1').waitFor();
      assert.equal(await page.getByRole('button',{name:'Today',exact:true}).getAttribute('aria-pressed'),'true');
      assert.equal(await page.getByRole('tab',{name:'Team Performance',exact:true}).count(),role==='employee'?0:1);
      for(const width of [360,768,1024,1280]) {
        await page.setViewportSize({width,height:900});
        // Mount directly at the target breakpoint. The App switches component
        // trees on resize, so a stale h1 can otherwise race its next loading state.
        await page.reload({waitUntil:'networkidle'});
        await panel.locator('h1').waitFor();
        const renderedEmoji=await page.evaluate(()=>[...document.body.innerText.matchAll(/\p{Extended_Pictographic}|\p{Regional_Indicator}/gu)].length);
        if(stage==='after') assert.equal(renderedEmoji,0,`rendered emoji: ${role}/${tab}/${width}`);
        const text=normal(await panel.innerText());
        const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
        observations.push({role,tab,width,text,overflow});
        await page.screenshot({path:path.join(out,stage,`${role}-${tab}-${width}.png`),fullPage:true});
      }
      if(stage==='after'&&axeSource&&role==='super_boss') {
        await page.addScriptTag({content:axeSource});
        const a=await page.evaluate(async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});return r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}));});
        fs.writeFileSync(path.join(out,stage,`axe-${tab}.json`),JSON.stringify(a,null,2));
      }
      if(stage==='after'&&tab==='users'&&role!=='employee') {
        await page.getByRole('button',{name:'Edit targets',exact:true}).click();
        assert.equal(await page.getByRole('spinbutton',{name:'Leads / mo',exact:true}).inputValue(),'30');
        assert.equal(await page.getByRole('spinbutton',{name:'Appointments / mo',exact:true}).inputValue(),'15');
        assert.equal(await page.getByRole('spinbutton',{name:'Inventory / mo',exact:true}).inputValue(),'10');
        assert.equal(await page.getByRole('spinbutton',{name:'Conversion %',exact:true}).inputValue(),'20');
        await page.getByRole('button',{name:'Cancel',exact:true}).click();
      }
      if(stage==='after'&&tab==='main') {
        await page.getByRole('button',{name:'Custom',exact:true}).click();
        await page.getByRole('textbox',{name:'From date',exact:true}).count();
        assert.equal(await page.locator('input[type="date"]').count(),2);
        await page.getByRole('button',{name:'Today',exact:true}).click();
        await panel.locator('h1').waitFor();
      }
    }
    await page.goto('http://127.0.0.1:5173/',{waitUntil:'networkidle'});
    await page.locator('#rp-dashboard-panel h1').waitFor();
    await page.getByRole('button',{name:'7D',exact:true}).click();
    await page.locator('#rp-dashboard-panel h1').waitFor();
    assert.ok(requests.some(r=>r.path.endsWith('/market-trends')&&r.query.from&&r.query.to));
    mode='error'; await page.reload({waitUntil:'networkidle'});
    await page.getByRole('button',{name:'Retry',exact:true}).waitFor();
    mode='ready'; await page.getByRole('button',{name:'Retry',exact:true}).click();
    await page.locator('#rp-dashboard-panel h1').waitFor();
    mode='empty'; await page.goto('http://127.0.0.1:5173/?rpDashboard=lead-intel',{waitUntil:'networkidle'});
    await page.getByText('No leads in your view yet',{exact:true}).waitFor();
    assert.deepEqual(errors,[],'runtime exceptions');
    fs.writeFileSync(path.join(out,stage,`${role}-requests.json`),JSON.stringify(requests,null,2));
    await context.close();
  }
  fs.writeFileSync(path.join(out,stage,'observations.json'),JSON.stringify(observations,null,2));
  if(stage==='after') {
    const before=JSON.parse(fs.readFileSync(path.join(out,'before','observations.json')));
    // CSS text-transform changes case without changing source labels. Medal glyphs
    // were stripped by the original capture: numeric rank1 is their explicit replacement.
    const canonical = text => text.toLowerCase().replace(/(ranked by productivity score) [123] (?=\d)/g,'$1 ');
    for(const actual of observations) {
      // A responsive branch remount raced a few old before captures. Compare to
      // the same role/tab's ready desktop baseline, whose content order is identical.
      const expected=before.find(x=>x.role===actual.role&&x.tab===actual.tab&&x.width===1280);
      assert.ok(expected&&!expected.text.startsWith('Loading'),`missing ready baseline: ${actual.role}/${actual.tab}`);
      assert.equal(canonical(actual.text),canonical(expected.text),`content/order: ${actual.role}/${actual.tab}/${actual.width}`);
    }
  }
  await browser.close();
  console.log(JSON.stringify({stage,result:'PASS',screenshots:observations.length,roles:['super_boss','manager','employee'],testMode:'synthetic only',overflow:observations.filter(o=>o.overflow.scroll>o.width+1).map(o=>({role:o.role,tab:o.tab,width:o.width})),axeAvailable:!!axeSource,output:out},null,2));
}
main().catch(e=>{console.error(e);process.exit(1)});
