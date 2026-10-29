'use strict';
// Offline orchestration tests. npm, sudo, curl and PM2 are stubs; no services are touched.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const linux={skip:process.platform!=='linux'},deploy=path.resolve(__dirname,'..');
const OLD='a'.repeat(40),NEW='b'.repeat(40),DB='f'.repeat(64);
function executable(filename,text){fs.writeFileSync(filename,'#!/usr/bin/env bash\nset -eu\n'+text,{mode:0o755});}
function fixture() {
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rp-release-flow-')),root=path.join(temp,'app'),bin=path.join(temp,'bin'),source=path.join(temp,'source');
    fs.mkdirSync(path.join(root,'releases',OLD),{recursive:true});fs.mkdirSync(bin);fs.mkdirSync(source);
    fs.writeFileSync(path.join(root,'releases',OLD,'REVISION'),OLD);fs.writeFileSync(path.join(root,'releases',OLD,'keep'),'previous live files');
    fs.symlinkSync(path.join(root,'releases',OLD),path.join(root,'current'));
    for(const name of ['uploads','logs'])fs.mkdirSync(path.join(root,'shared',name),{recursive:true});
    fs.writeFileSync(path.join(root,'shared/uploads','keep'),'persistent upload');
    for(const name of ['backend','frontend','website']){
        fs.writeFileSync(path.join(root,'shared',name+'.env'),name==='frontend'?'VITE_API_BASE_URL=https://example.invalid\n':'FIXTURE=true\n',{mode:0o600});
        fs.mkdirSync(path.join(source,'agents',name),{recursive:true});fs.writeFileSync(path.join(source,'agents',name,'package.json'),'{}');
    }
    fs.mkdirSync(path.join(source,'deploy'));
    fs.writeFileSync(path.join(source,'deploy/contact-change.cjs'),`console.log(JSON.stringify({result:'SCHEMA_READY',database_fingerprint:'${DB}'}));`);
    for(const name of ['contact-guards.cjs','contact-journal.cjs','contact-evidence.cjs'])fs.writeFileSync(path.join(source,'deploy',name),'// inert test fixture');
    fs.copyFileSync(path.join(deploy,'release-safety.py'),path.join(source,'deploy/release-safety.py'));
    const archive=path.join(temp,'release.tgz');
    assert.equal(cp.spawnSync('tar',['-czf',archive,'agents/backend','agents/frontend','agents/website','deploy/contact-change.cjs','deploy/contact-guards.cjs','deploy/contact-journal.cjs','deploy/contact-evidence.cjs','deploy/release-safety.py'],{cwd:source}).status,0);
    const checksum=crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    executable(path.join(bin,'pm2'),'exit 0\n');
    executable(path.join(bin,'sleep'),'exit 0\n');
    executable(path.join(bin,'npm'),'echo "npm $*" >> "$TEST_LOG"; [[ "${FAIL_BUILD:-0}" != 1 ]]\n');
    executable(path.join(bin,'npx'),'echo "npx $*" >> "$TEST_LOG"; exit 0\n');
    executable(path.join(bin,'df'),'printf "Avail\\n%s\\n" "${TEST_FREE_BYTES:-10000000000}"\n');
    executable(path.join(bin,'sudo'),`echo "sudo $*" >> "$TEST_LOG"
if [[ "$*" == *jlist* ]]; then
  if [[ "\${TWO_WORKERS:-0}" == 1 ]]; then printf '[{"name":"realty-backend","pid":123,"pm2_env":{"status":"online","NODE_APP_INSTANCE":"0"}},{"name":"realty-backend","pid":124,"pm2_env":{"status":"online","NODE_APP_INSTANCE":"1"}}]';
  else printf '[{"name":"realty-backend","pid":123,"pm2_env":{"status":"online","NODE_APP_INSTANCE":"single"}}]'; fi
  exit 0
fi
target=$(basename "$(realpath "$HOSTINGER_DEPLOY_PATH/current")")
if [[ "$target" == "${NEW}" && "\${FAIL_RELOAD:-0}" == 1 ]]; then exit 7; fi
if [[ "\${FAIL_RECOVERY:-0}" == 1 ]]; then exit 8; fi
exit 0
`);
    executable(path.join(bin,'curl'),`echo "curl $*" >> "$TEST_LOG"
target=$(basename "$(realpath "$HOSTINGER_DEPLOY_PATH/current")")
if [[ "$*" == *"/health"* ]]; then
  status=ok; revision=$target; instance=single
  if [[ "\${TWO_WORKERS:-0}" == 1 ]]; then n=$(cat "$TEST_LOG.counter" 2>/dev/null || echo 0); instance=$((n%2)); echo $((n+1)) > "$TEST_LOG.counter"; fi
  if [[ "$target" == "${NEW}" && "\${FAIL_HEALTH:-0}" == 1 ]]; then status=degraded; fi
  if [[ "$target" == "${NEW}" && "\${STALE_WORKER:-0}" == 1 ]]; then revision=${OLD}; fi
  if [[ "$target" == "${NEW}" && "\${STALE_ONE_WORKER:-0}" == 1 && "$instance" == 1 ]]; then revision=${OLD}; fi
  printf '{"status":"%s","instance":"%s","release":"%s","db":{"status":"connected","fingerprint":"${DB}"},"redis":{"status":"connected"}}' "$status" "$instance" "$revision"
elif [[ "$*" == *"/api/inventory"* ]]; then
  if [[ "$target" == "${NEW}" && "\${PUBLIC_API:-0}" == 1 ]]; then printf 200; else printf 401; fi
fi
`);
    const env={...process.env,PATH:bin+path.delimiter+process.env.PATH,HOSTINGER_DEPLOY_PATH:root,TEST_LOG:path.join(temp,'events.log')};
    const invoke=(flags={})=>cp.spawnSync('bash',[path.join(deploy,'github-hostinger-release.sh'),'deploy',archive,NEW,'0',checksum],{env:{...env,...flags},encoding:'utf8',timeout:20000});
    return {temp,root,env,archive,checksum,invoke,cleanup:()=>fs.rmSync(temp,{recursive:true,force:true})};
}
test('successful activation retains previous releases and persistent data',linux,()=>{
    const f=fixture();try{const r=f.invoke();assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(fs.realpathSync(path.join(f.root,'current')),path.join(f.root,'releases',NEW));
        assert.ok(fs.existsSync(path.join(f.root,'releases',NEW,'.verified')));assert.ok(fs.existsSync(path.join(f.root,'releases',OLD,'keep')));
        assert.equal(fs.readFileSync(path.join(f.root,'shared/uploads/keep'),'utf8'),'persistent upload');
    }finally{f.cleanup();}
});
for(const flag of ['FAIL_RELOAD','FAIL_HEALTH','STALE_WORKER','PUBLIC_API'])test(flag+' restores the previous symlink and never deletes an attempted active release',linux,()=>{
    const f=fixture();try{const r=f.invoke({[flag]:'1'});assert.notEqual(r.status,0);assert.equal(fs.realpathSync(path.join(f.root,'current')),path.join(f.root,'releases',OLD));
        assert.ok(fs.existsSync(path.join(f.root,'releases',NEW,'REVISION')));assert.ok(fs.existsSync(path.join(f.root,'releases',OLD,'keep')));
        assert.ok(!fs.existsSync(path.join(f.root,'releases',NEW,'.verified')));
    }finally{f.cleanup();}
});
test('failed recovery retains both directories and reports manual intervention',linux,()=>{
    const f=fixture();try{const r=f.invoke({FAIL_RELOAD:'1',FAIL_RECOVERY:'1'});assert.notEqual(r.status,0);assert.match(r.stderr,/RECOVERY INCOMPLETE/);
        assert.ok(fs.existsSync(path.join(f.root,'releases',OLD,'keep')));assert.ok(fs.existsSync(path.join(f.root,'releases',NEW,'REVISION')));
    }finally{f.cleanup();}
});
test('build failure never changes the current release',linux,()=>{
    const f=fixture();try{const r=f.invoke({FAIL_BUILD:'1'});assert.notEqual(r.status,0);assert.equal(fs.realpathSync(path.join(f.root,'current')),path.join(f.root,'releases',OLD));
        assert.ok(!fs.existsSync(path.join(f.root,'releases',NEW)));assert.ok(fs.existsSync(path.join(f.root,'shared/uploads/keep')));
    }finally{f.cleanup();}
});
test('both cluster workers must be verified, not just one lucky health response',linux,()=>{
    const good=fixture();try{const r=good.invoke({TWO_WORKERS:'1'});assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(good.root,'releases',NEW,'.verified.json'))).instances,['0','1']);}finally{good.cleanup();}
    const bad=fixture();try{const r=bad.invoke({TWO_WORKERS:'1',STALE_ONE_WORKER:'1'});assert.notEqual(r.status,0);assert.equal(fs.realpathSync(path.join(bad.root,'current')),path.join(bad.root,'releases',OLD));assert.ok(fs.existsSync(path.join(bad.root,'releases',NEW)));}finally{bad.cleanup();}
});
test('capacity and checksum failures stop before extraction',linux,()=>{
    const f=fixture();try{assert.notEqual(f.invoke({TEST_FREE_BYTES:'0'}).status,0);
        const r=cp.spawnSync('bash',[path.join(deploy,'github-hostinger-release.sh'),'deploy',f.archive,NEW,'0','0'.repeat(64)],{env:f.env,encoding:'utf8'});
        assert.notEqual(r.status,0);assert.ok(!fs.existsSync(path.join(f.root,'releases',NEW)));
    }finally{f.cleanup();}
});
test('the migration flag and traversal revision are refused before any mutation',linux,()=>{
    const f=fixture();try{for(const [revision,migrations] of [[NEW,'1'],['..','0']]){
        const r=cp.spawnSync('bash',[path.join(deploy,'github-hostinger-release.sh'),'deploy',f.archive,revision,migrations,f.checksum],{env:f.env,encoding:'utf8'});
        assert.notEqual(r.status,0);assert.equal(fs.realpathSync(path.join(f.root,'current')),path.join(f.root,'releases',OLD));
        assert.ok(!fs.existsSync(path.join(f.root,'releases',NEW)));
    }}finally{f.cleanup();}
});
test('an existing change lock prevents overlapping deployment',linux,async()=>{
    const f=fixture();let holder;try{
        holder=cp.spawn('bash',['-c','umask 077; exec 9>>"$HOSTINGER_DEPLOY_PATH/.production-change.lock"; flock 9; echo READY; read -r ignored'],{env:f.env,stdio:['pipe','pipe','pipe']});
        await new Promise((resolve,reject)=>{holder.stdout.once('data',resolve);holder.once('error',reject);});
        const r=f.invoke();assert.notEqual(r.status,0);assert.match(r.stderr,/another production change/);assert.ok(!fs.existsSync(path.join(f.root,'releases',NEW)));
    }finally{if(holder){holder.stdin.end('\n');await new Promise(resolve=>holder.once('exit',resolve));}f.cleanup();}
});
