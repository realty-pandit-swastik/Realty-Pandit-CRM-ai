'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const g=require('../contact-guards.cjs');
const {argumentsFor,runtimeRevision,boundedConnection}=require('../contact-change.cjs');
const NOW=Date.parse('2026-10-26T12:00:00Z'),iso=delta=>new Date(NOW+delta).toISOString();
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const clone=value=>structuredClone(value);
function fixture(count=2) {
    const target={database:g.DATABASE,cluster_id:'1234567890123456789',database_oid:'123',read_only:false,in_recovery:false};
    const schemaHash=g.sha256('schema'),archiveHash=g.sha256('archive'),proofHash=g.sha256('proof');
    const testClock={now:NOW};
    const context={target,schemaHash,activeRevision:'a'.repeat(40),testClock,clock:()=>testClock.now};
    const rows=Array.from({length:count},(_,n)=>({id:id(n+1),tenant_id:'tenant-1',updated_at:iso(-120000),ownership_type:'OWNER',referral_partner_id:id(n+100),
        snapshot_hash:g.sha256('before-'+n),identity_hash:g.sha256('identity-'+n),preserved_hash:g.sha256('preserved-'+n),partner_hash:g.sha256('partner-'+n),
        owner_known:true,owner_staff:false,partner_staff:true,contact_exists:true}));
    const plan={version:2,mode:'DRY_RUN',tenant:'tenant-1',target,active_revision:context.activeRevision,schema_sha256:schemaHash,captured_at:iso(-120000),candidates:rows.map(r=>({inventory_id:r.id,tenant_id:r.tenant_id,expected_updated_at:r.updated_at,
        snapshot_hash:r.snapshot_hash,identity_hash:r.identity_hash,can_propose:true,proposed_changes:{referral_partner_id:null},original_values:{referral_partner_id:r.referral_partner_id}}))};
    context.subjectHash=g.sha256(JSON.stringify(plan));
    const approved={version:1,approved:true,operation:'repair-partners',operation_id:id(900),approved_by:'Test reviewer',reason:'Reviewed exact synthetic test rows',approved_at:iso(-60000),expires_at:iso(600000),
        active_revision:context.activeRevision,subject_sha256:context.subjectHash,target,tenant:plan.tenant,approved_row_ids:rows.map(r=>r.id)};
    context.evidenceBundle={archiveHash,proofHash,manifest:{version:2,database:g.DATABASE,target,consistent_snapshot:true,format:'PostgreSQL custom archive',bytes:100,sha256:archiveHash,completed_at:iso(-300000),schema_sha256:schemaHash},
        proof:{version:2,result:'PASS',target,archive_sha256:archiveHash,completed_at:iso(-240000),source_schema_sha256:schemaHash,counts_verified:true,cleanup:{database_absent:true,role_absent:true},
            source_counts:{'public.inventory':'2'},restored_counts:{'public.inventory':'2'},steps:['restore','forward_migration','rollback','reapply'].map(step=>({step,result:'PASS'})),migration_sha256:g.sha256('sql'),rollback_sha256:g.sha256('rollback')},
        receipt:{version:2,result:'PASS',archive_sha256:archiveHash,proof_sha256:proofHash,offsite:{sha256:archiveHash,encrypted:true,location_id:'test-offsite',verified_at:iso(-180000)}}};
    return {context,rows,plan,approved};
}
function harness(f) {
    let actual=new Map(f.rows.map(r=>[r.id,clone(r)]));
    const events=[],records=new Map(),options={};let writes=0,activeId;
    const journal={
        create:async record=>{if(records.has(record.operation_id))throw new g.GuardError('OPERATION_EXISTS','already exists');activeId=record.operation_id;records.set(record.operation_id,clone(record));events.push('intent');},
        save:async record=>{if(record.status==='prepared'&&options.failPrepared)throw Error('disk unavailable');if(record.status==='committed'&&options.failFinalize)throw Error('finalize unavailable');records.set(record.operation_id,clone(record));events.push(record.status);},
        abort:async()=>{const r=records.get(activeId);if(r)r.status='aborted_before_commit';},
    };
    const db={transaction:async work=>{
        const staged=new Map([...actual].map(([k,v])=>[k,clone(v)]));let writeNumber=0;
        const result=await work({
            lock:async()=>!options.locked,target:async()=>options.target||f.context.target,schemaHash:async()=>options.schema||f.context.schemaHash,
            columns:async()=>g.COLUMNS.map(([table,column])=>({table,column,type:'text',nullable:'YES',default:null})),
            safeTable:async()=>!options.unsafeTable,
            row:async(id,tenant)=>{const r=staged.get(id);if(options.expireAfterRead)f.context.testClock.now=NOW+20*60000;return r?.tenant_id===tenant?clone(r):null;},
            partnerUnchanged:async()=>!options.identityChanged,
            change:async(id,tenant,partner,expected)=>{
                writeNumber++;writes++;if(options.failAt===writeNumber)throw Error('simulated mid-batch failure');
                const row=staged.get(id);assert.equal(row.tenant_id,tenant);assert.equal(row.snapshot_hash,expected);
                row.referral_partner_id=partner;row.updated_at=iso(1000+writeNumber);
                row.snapshot_hash=g.sha256('after-'+id+'-'+partner+'-'+writes);row.identity_hash=g.sha256('after-identity-'+partner);
                if(options.extraWrite)row.preserved_hash=g.sha256('unexpected edit');return clone(row);
            },
        });
        events.push('COMMIT');actual=staged;
        if(options.lostAck)throw Error('connection lost after commit');return result;
    }};
    return {db,journal,options,events,records,get rows(){return [...actual.values()].map(clone);},edit(id,fn){fn(actual.get(id));},get writes(){return writes;}};
}
const run=(f,h)=>g.executeRepair({...f,db:h.db,journal:h.journal});
test('repair is atomic and journals the full prepared outcome durably before COMMIT',async()=>{
    const f=fixture(),h=harness(f),result=await run(f,h);
    assert.equal(result.changed,2);assert.ok(h.rows.every(r=>r.referral_partner_id===null));
    assert.ok(h.events.indexOf('prepared')<h.events.indexOf('COMMIT'));assert.equal(h.records.get(f.approved.operation_id).status,'committed');
    assert.ok(h.records.get(f.approved.operation_id).changes.every(c=>g.validHash(c.original_partner_hash)));
});
for(const [name,mutate,code] of [
    ['wrong database',f=>{f.approved.target={...f.context.target,database:'postgres'};},'TARGET_UNPROVEN'],
    ['wrong cluster',f=>{f.approved.target={...f.context.target,cluster_id:'999'};},'WRONG_TARGET'],
    ['replica',f=>{f.context.target={...f.context.target,in_recovery:true};},'READ_ONLY_TARGET'],
    ['read-only connection',f=>{f.context.target={...f.context.target,read_only:true};},'READ_ONLY_TARGET'],
    ['expired approval',f=>{f.approved.expires_at=iso(-1);},'EXPIRED_APPROVAL'],
    ['changed plan bytes',f=>{f.approved.subject_sha256='f'.repeat(64);},'SUBJECT_CHANGED'],
    ['new active revision',f=>{f.context.activeRevision='b'.repeat(40);},'REVISION_CHANGED'],
    ['wrong tenant',f=>{f.approved.tenant='other';},'WRONG_TENANT'],
    ['unreviewed owner replacement',f=>{f.plan.candidates[0].proposed_changes={owner_id:id(777)};},'AMBIGUOUS_REPAIR'],
    ['ambiguous record',f=>{f.plan.candidates[0].can_propose=false;},'AMBIGUOUS_REPAIR'],
    ['duplicate selection',f=>{f.approved.approved_row_ids=[id(1),id(1)];},'INVALID_SELECTION'],
    ['unknown selection',f=>{f.approved.approved_row_ids=[id(777)];},'AMBIGUOUS_REPAIR'],
    ['stale plan',f=>{f.plan.captured_at=iso(-16*60000);},'STALE_EVIDENCE'],
    ['stale backup',f=>{f.context.evidenceBundle.manifest.completed_at=iso(-61*60000);},'STALE_EVIDENCE'],
    ['corrupt archive',f=>{f.context.evidenceBundle.archiveHash='f'.repeat(64);},'BACKUP_CHANGED'],
    ['v1 proof with no target binding',f=>{f.context.evidenceBundle.proof.version=1;},'EVIDENCE_VERSION'],
    ['missing offsite recovery',f=>{delete f.context.evidenceBundle.receipt.offsite;},'OFFSITE_RECOVERY_UNPROVEN'],
    ['modified proof file',f=>{f.context.evidenceBundle.proofHash='f'.repeat(64);},'INVALID_PROOF'],
    ['schema drift from backup',f=>{f.context.schemaHash='f'.repeat(64);},'SCHEMA_DRIFT'],
])test('blocks '+name+' before creating a journal or writing rows',async()=>{
    const f=fixture();mutate(f);const h=harness(f);
    await assert.rejects(run(f,h),error=>error.code===code);assert.equal(h.writes,0);assert.equal(h.records.size,0);
});
test('hard cap prevents approving 51 rows',async()=>{const f=fixture(51),h=harness(f);await assert.rejects(run(f,h),e=>e.code==='INVALID_SELECTION');assert.equal(h.writes,0);});
test('rechecks the target and schema inside the transaction',async()=>{
    for(const option of ['target','schema']){const f=fixture(),h=harness(f);h.options[option]=option==='target'?{...f.context.target,cluster_id:'2'}:'f'.repeat(64);
        await assert.rejects(run(f,h));assert.equal(h.writes,0);}
});
test('a held advisory lock blocks all writes',async()=>{const f=fixture(),h=harness(f);h.options.locked=true;await assert.rejects(run(f,h),e=>e.code==='CHANGE_LOCKED');assert.equal(h.writes,0);});
test('unexpected database triggers/rules/RLS/generated behavior blocks writes',async()=>{const f=fixture(),h=harness(f);h.options.unsafeTable=true;await assert.rejects(run(f,h),e=>e.code==='UNEXPECTED_DATABASE_BEHAVIOR');assert.equal(h.writes,0);});
test('changed complete row hash is caught even if updated_at was not changed',async()=>{const f=fixture(),h=harness(f);h.edit(id(2),r=>r.snapshot_hash='f'.repeat(64));await assert.rejects(run(f,h),e=>e.code==='ROW_CHANGED');assert.equal(h.writes,0);});
test('changed linked identity or unresolved owner cannot be repaired',async()=>{
    for(const change of [r=>r.identity_hash='f'.repeat(64),r=>r.owner_known=false]){const f=fixture(),h=harness(f);h.edit(id(2),change);await assert.rejects(run(f,h));assert.equal(h.writes,0);}
});
test('mid-batch error rolls back earlier changes',async()=>{const f=fixture(),h=harness(f);h.options.failAt=2;await assert.rejects(run(f,h));assert.deepEqual(h.rows,f.rows);assert.ok(!h.events.includes('COMMIT'));});
test('failure to fsync the prepared journal rolls back the transaction',async()=>{const f=fixture(),h=harness(f);h.options.failPrepared=true;await assert.rejects(run(f,h));assert.deepEqual(h.rows,f.rows);assert.ok(!h.events.includes('COMMIT'));});
test('a trigger-like extra edit fails the preservation check and rolls back',async()=>{const f=fixture(),h=harness(f);h.options.extraWrite=true;await assert.rejects(run(f,h),e=>e.code==='UNEXPECTED_WRITE');assert.deepEqual(h.rows,f.rows);});
test('expiry while waiting on rows aborts before updates',async()=>{const f=fixture(),h=harness(f);h.options.expireAfterRead=true;await assert.rejects(run(f,h));assert.equal(h.writes,0);});
test('lost COMMIT acknowledgement requires reconciliation and cannot be blindly retried',async()=>{
    const f=fixture(),h=harness(f);h.options.lostAck=true;await assert.rejects(run(f,h));
    const journal=h.records.get(f.approved.operation_id);assert.equal(journal.status,'prepared');assert.equal(g.reconciliation(journal,h.rows),'COMMITTED');
    await assert.rejects(run(f,h),e=>e.code==='OPERATION_EXISTS');assert.equal(h.writes,2);
});
test('post-commit journal finalization failure does not claim the data rolled back',async()=>{
    const f=fixture(),h=harness(f);h.options.failFinalize=true;await assert.rejects(run(f,h),e=>e.code==='COMMIT_NEEDS_RECONCILIATION');
    assert.equal(g.reconciliation(h.records.get(f.approved.operation_id),h.rows),'COMMITTED');
});
test('reconciliation distinguishes rollback, commit and a newer/mixed state',()=>{
    const before=g.sha256('before'),after=g.sha256('after');
    const record={version:1,tenant:'tenant-1',status:'prepared',operation:'repair-partners',operation_id:id(900),changes:[{inventory_id:id(1),before_hash:before,after_hash:after}]};
    assert.equal(g.reconciliation(record,[{id:id(1),snapshot_hash:before}]),'NOT_APPLIED');
    assert.equal(g.reconciliation(record,[{id:id(1),snapshot_hash:after}]),'COMMITTED');
    assert.equal(g.reconciliation(record,[{id:id(1),snapshot_hash:'newer'}]),'MANUAL_REVIEW_REQUIRED');
    assert.equal(g.reconciliation({...record,status:'committed'},[{id:id(1),snapshot_hash:before}]),'MANUAL_REVIEW_REQUIRED');
    assert.throws(()=>g.reconciliation({version:1,changes:[{}]},[]),e=>e.code==='INVALID_JOURNAL');
});
async function forwardAndRollbackFixture(){
    const f=fixture(),h=harness(f);await run(f,h);const original=clone(h.records.get(f.approved.operation_id));
    const approved={...clone(f.approved),operation:'rollback-partners',operation_id:id(901),subject_sha256:g.sha256(JSON.stringify(original))};
    const context={...f.context,subjectHash:approved.subject_sha256};return {f,h,original,approved,context};
}
test('rollback restores only the exact original links in one transaction',async()=>{
    const {f,h,original,approved,context}=await forwardAndRollbackFixture();
    await g.executeRollback({db:h.db,journal:h.journal,original,approved,context});
    assert.deepEqual(h.rows.map(r=>r.referral_partner_id),f.rows.map(r=>r.referral_partner_id));
});
test('rollback refuses newer row edits and changed partner profiles',async()=>{
    for(const mode of ['row','identity']){const {h,original,approved,context}=await forwardAndRollbackFixture();const prior=h.rows;
        if(mode==='row')h.edit(id(1),r=>r.snapshot_hash='f'.repeat(64));else h.options.identityChanged=true;
        const before=h.rows;await assert.rejects(g.executeRollback({db:h.db,journal:h.journal,original,approved,context}));assert.deepEqual(h.rows,before);assert.equal(h.rows[0].referral_partner_id,null);}
});
test('migration evidence is bound to exact forward and rollback SQL hashes',()=>{
    const f=fixture(),context={...f.context,now:NOW,operation:'migration-check',migrationHash:g.sha256('different'),rollbackHash:g.sha256('rollback')};
    assert.throws(()=>g.evidence(f.context.evidenceBundle,context),e=>e.code==='SQL_CHANGED');
});
test('timestamps in canonical fingerprints do not collapse to empty objects',()=>{assert.notEqual(g.canonical(new Date(0)),g.canonical(new Date(1)));});
test('CLI rejects unknown force/bypass flags and execution of read-only commands',()=>{
    assert.throws(()=>argumentsFor(['inspect','--force']));assert.throws(()=>argumentsFor(['schema','--execute']),e=>e.code==='NO_AUTOMATIC_DDL');
    assert.equal(argumentsFor(['repair','--backend','/installed/backend']).execute,false);
});
test('runtime verification visits every backend worker and closes probe connections',async()=>{
    const original=global.fetch;let calls=0;
    global.fetch=async(_url,options)=>{assert.equal(options.headers.Connection,'close');return new Response(JSON.stringify({status:'ok',release:'a'.repeat(40),instance:String(calls++%2),db:{status:'connected',fingerprint:'f'.repeat(64)},redis:{status:'connected'}}));};
    try{await runtimeRevision('a'.repeat(40),'f'.repeat(64),['0','1']);assert.ok(calls>=4);}finally{global.fetch=original;}
});
test('one stale worker or an oversized health body blocks runtime verification',async()=>{
    const original=global.fetch;let calls=0;
    try{
        global.fetch=async()=>new Response(JSON.stringify({status:'ok',release:calls++?'b'.repeat(40):'a'.repeat(40),instance:String((calls-1)%2),db:{status:'connected',fingerprint:'f'.repeat(64)},redis:{status:'connected'}}));
        await assert.rejects(runtimeRevision('a'.repeat(40),'f'.repeat(64),['0','1']),e=>e.code==='REVISION_UNPROVEN');
        global.fetch=async()=>new Response('x'.repeat(65537));
        await assert.rejects(runtimeRevision('a'.repeat(40),'f'.repeat(64),['single']),e=>e.code==='HEALTH_RESPONSE_TOO_LARGE');
    }finally{global.fetch=original;}
});
test('operational clients cannot request an unbounded pool or connection wait',()=>{
    const url=new URL(boundedConnection('postgresql://fixture@localhost/reality_pandit?connection_limit=999&connect_timeout=0&pool_timeout=0&schema=public'));
    assert.equal(url.searchParams.get('connection_limit'),'2');assert.equal(url.searchParams.get('connect_timeout'),'5');assert.equal(url.searchParams.get('pool_timeout'),'5');assert.equal(url.searchParams.get('schema'),'public');
});
test('the complete modeled contract catches missing columns, type/nullability and enum drift',()=>{
    const model={models:[{name:'Entry',dbName:'entries',fields:[{name:'id',kind:'scalar',type:'String',isRequired:true},{name:'tags',kind:'scalar',type:'String',isList:true,isRequired:true},{name:'role',kind:'enum',type:'Role',isRequired:false}]}],enums:[{name:'Role',values:[{name:'OWNER'},{name:'AGENT'}]}]};
    const columns=[{table_name:'entries',column_name:'id',data_type:'text',udt_name:'text',is_nullable:'NO'},{table_name:'entries',column_name:'tags',data_type:'ARRAY',udt_name:'_text',is_nullable:'YES'},{table_name:'entries',column_name:'role',data_type:'USER-DEFINED',udt_name:'Role',is_nullable:'YES'}];
    const enums=[{typname:'Role',enumlabel:'OWNER'},{typname:'Role',enumlabel:'AGENT'}];
    assert.deepEqual(g.modelContract(model,columns,enums),[]);
    assert.ok(g.modelContract(model,columns.slice(1),enums).includes('entries.id:missing'));
    assert.ok(g.modelContract(model,[{...columns[0],is_nullable:'YES'},...columns.slice(1)],enums).includes('entries.id:nullability'));
    assert.ok(g.modelContract(model,[{...columns[0],udt_name:'int4'},...columns.slice(1)],enums).includes('entries.id:scalar-type'));
    assert.ok(g.modelContract(model,columns,enums.slice(0,1)).includes('entries.role:enum-type'));
});
test('migration history requires exact applied bytes and only explicitly allowed pending work',()=>{
    const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{migrationFiles}=require('../contact-change.cjs');
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'rp-history-test-'));
    try{
        for(const [name,sql] of [['001','SELECT 1;'],[g.MIGRATION,'SELECT 2;']]){fs.mkdirSync(path.join(root,'prisma/migrations',name),{recursive:true});fs.writeFileSync(path.join(root,'prisma/migrations',name,'migration.sql'),sql);}
        const rows=[{migration_name:'001',checksum:g.sha256('SELECT 1;'),finished_at:new Date(),rolled_back_at:null}];
        migrationFiles(root,rows,[g.MIGRATION]);
        assert.throws(()=>migrationFiles(root,rows,[]),e=>e.code==='UNEXPECTED_MIGRATIONS');
        fs.writeFileSync(path.join(root,'prisma/migrations/001/migration.sql'),'changed');
        assert.throws(()=>migrationFiles(root,rows,[g.MIGRATION]),e=>e.code==='MIGRATION_HISTORY_CHANGED');
    }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('SQL and operational tools share the same transaction advisory lock',()=>{
    const fs=require('node:fs'),path=require('node:path');
    for(const file of [path.resolve(__dirname,'../../agents/backend/prisma/migrations',g.MIGRATION,'migration.sql'),path.resolve(__dirname,'../../docs/agent/contact-roles-rollback.sql')]){
        const sql=fs.readFileSync(file,'utf8');assert.match(sql,new RegExp('pg_try_advisory_xact_lock\\('+g.LOCK[0]+',\\s*'+g.LOCK[1]+'\\)'));
    }
});
