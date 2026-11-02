'use strict';
// Explicit opt-in, synthetic-only PostgreSQL cluster; never falls back to DATABASE_URL.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {createRequire}=require('node:module');
const g=require('../contact-guards.cjs'),cli=require('../contact-change.cjs'),evidence=require('../contact-evidence.cjs');
const {FileJournal,secureRead}=require('../contact-journal.cjs');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
async function main(){
    const backend=process.env.GUARD_TEST_BACKEND,appRoot=process.env.GUARD_TEST_APP_ROOT,urlText=process.env.GUARD_TEST_DATABASE_URL,forbidden=process.env.GUARD_FORBIDDEN_CLUSTER;
    assert.ok(backend&&appRoot&&urlText&&forbidden,'All explicit synthetic-cluster settings are required');
    const url=new URL(urlText),socket=url.searchParams.get('host');
    assert.equal(decodeURIComponent(url.pathname.slice(1)),g.DATABASE);assert.ok(socket?.includes('/rp-contact-guard-'));assert.notEqual(url.port,'5432');
    process.env.DATABASE_URL=urlText;
    const r=createRequire(path.join(backend,'package.json'));r('ts-node').register({transpileOnly:true,project:path.join(backend,'tsconfig.json')});
    const {PrismaClient}=r('@prisma/client'),db=new PrismaClient({datasources:{db:{url:urlText}},log:[]});
    const deploy=path.resolve(__dirname,'..'),migration=path.join(backend,'prisma/migrations',g.MIGRATION,'migration.sql'),rollback=path.join(deploy,'contact-roles-rollback.sql');
    const env={...process.env,PGHOST:socket,PGPORT:url.port,PGUSER:decodeURIComponent(url.username),PGDATABASE:g.DATABASE};delete env.PGPASSWORD;
    const sql=(database,text)=>cp.spawnSync('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-f','-'],{env:{...env,PGDATABASE:database},input:text,encoding:'utf8',timeout:15000});
    const flags=[];const passed=name=>flags.push(name);
    let probe;
    try{
        const target=await cli.identity(db);assert.notEqual(target.cluster_id,forbidden,'Test cluster must differ from production');
        const setup=`
CREATE TABLE contacts(phone_number text PRIMARY KEY,tenant_id text NOT NULL,name text,contact_type text,client_role text);
CREATE TABLE owners(id text PRIMARY KEY,contact_phone text REFERENCES contacts(phone_number));
CREATE TABLE agents(id text PRIMARY KEY,tenant_id text,phone text,role text,status text);
CREATE TABLE partner_agents(id text PRIMARY KEY,phone_number text REFERENCES contacts(phone_number),name text,status text,managing_agent_id text);
CREATE TABLE inventory(id text PRIMARY KEY,tenant_id text,owner_phone text REFERENCES contacts(phone_number),owner_contact_id text,owner_id text REFERENCES owners(id),referral_partner_id text REFERENCES partner_agents(id),ownership_type text,updated_at timestamp(3) DEFAULT timezone('UTC',clock_timestamp()),price numeric);
CREATE TABLE transactions(id text PRIMARY KEY);
CREATE TABLE _prisma_migrations(migration_name text,checksum text,finished_at timestamptz,rolled_back_at timestamptz,started_at timestamptz DEFAULT now());
INSERT INTO contacts VALUES ('+919000000001','test-tenant','Synthetic owner','LANDLORD','OWNER'),('+919000000002','test-tenant','Synthetic employee','PARTNER_AGENT',NULL);
INSERT INTO owners VALUES ('${id(100)}','+919000000001');
INSERT INTO agents VALUES ('${id(200)}','test-tenant','+919000000002','employee','active');
INSERT INTO partner_agents VALUES ('${id(300)}','+919000000002','Synthetic employee','ACTIVE',NULL);
INSERT INTO inventory(id,tenant_id,owner_phone,owner_id,referral_partner_id,ownership_type,price) VALUES ('${id(1)}','test-tenant','+919000000001','${id(100)}','${id(300)}','OWNER',1000000),('${id(2)}','test-tenant','+919000000001','${id(100)}','${id(300)}','OWNER',2000000);
INSERT INTO transactions VALUES ('${id(400)}');`;
        assert.equal(sql(g.DATABASE,setup).status,0);passed('synthetic cluster prepared');
        const initial=await cli.schemaHash(db),migrationText=fs.readFileSync(migration,'utf8'),rollbackText=fs.readFileSync(rollback,'utf8');
        assert.notEqual(sql(g.DATABASE,migrationText).status,0);assert.equal(await cli.schemaHash(db),initial);passed('production-name migration refuses missing session approval');
        const expired=`SET rp.contact_expected_cluster='${target.cluster_id}';SET rp.contact_migration_approved='${g.MIGRATION}';SET rp.contact_approval_expires_at='2000-01-01T00:00:00Z';\n`+migrationText;
        assert.notEqual(sql(g.DATABASE,expired).status,0);assert.equal(await cli.schemaHash(db),initial);passed('expired SQL-session approval cannot mutate the schema');
        const directory=path.join(appRoot,'evidence');fs.mkdirSync(directory,{mode:0o700});
        const targetFile=path.join(directory,'target.json');fs.writeFileSync(targetFile,JSON.stringify(target),{mode:0o600});
        assert.equal(sql(g.DATABASE,'CREATE FUNCTION public.synthetic_guard_test() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;').status,0);
        await assert.rejects(evidence.main(['--backend',backend,'--app-root',appRoot,'--directory',directory,'--target',targetFile,'--mode','migration','--migration',migration,'--rollback',rollback]),e=>e.code==='UNEXPECTED_SOURCE_CODE');
        assert.equal(sql(g.DATABASE,'DROP FUNCTION public.synthetic_guard_test();').status,0);passed('custom SQL code blocks automatic restore before copying data');
        await evidence.main(['--backend',backend,'--app-root',appRoot,'--directory',directory,'--target',targetFile,'--mode','migration','--migration',migration,'--rollback',rollback]);
        const first=fs.readdirSync(directory).find(name=>name.startsWith('contact-backup-'));
        assert.equal(secureRead(path.join(directory,first,'rehearsal-proof.json')).value.result,'PASS');passed('target-bound exported-snapshot backup + restore + migration/rollback/reapply');
        const approvedSql=`SET rp.contact_expected_cluster='${target.cluster_id}';SET rp.contact_migration_approved='${g.MIGRATION}';SET rp.contact_approval_expires_at='${new Date(Date.now()+600000).toISOString()}';\n`+migrationText;
        assert.equal(sql(g.DATABASE,approvedSql).status,0);g.schemaReady(await cli.columns(db));passed('exact session/cluster approval permits the reviewed additive SQL');
        assert.notEqual(sql(g.DATABASE,rollbackText).status,0);g.schemaReady(await cli.columns(db));passed('schema downgrade refuses production-name database');
        const name='rp_contact_rehearsal_20261026120000_abc123';
        await db.$executeRawUnsafe(`CREATE DATABASE "${name}" TEMPLATE template0`);const pu=new URL(url);pu.pathname='/'+name;probe=new PrismaClient({datasources:{db:{url:pu.toString()}},log:[]});
        assert.equal(sql(name,'CREATE TABLE contacts(id text);CREATE TABLE inventory(id text);CREATE TABLE transactions(id text);').status,0);
        let release;let ready;
        const held=new Promise(resolve=>{ready=resolve;});const gate=new Promise(resolve=>{release=resolve;});
        const holder=probe.$transaction(async tx=>{const [lock]=await tx.$queryRawUnsafe('SELECT pg_try_advisory_xact_lock(119731,1) AS ok');assert.equal(lock.ok,true);ready();await gate;},{timeout:15000});
        await held;assert.notEqual(sql(name,migrationText).status,0);assert.equal((await cli.columns(probe)).length,0);release();await holder;passed('real advisory lock conflict prevents DDL');
        assert.equal(sql(name,migrationText).status,0);
        assert.equal(sql(name,"INSERT INTO contacts(id,source_label) VALUES('fixture','Do not lose this');").status,0);
        assert.notEqual(sql(name,rollbackText).status,0);g.schemaReady(await cli.columns(probe));passed('non-NULL new data blocks schema downgrade without dropping columns');
        assert.equal(sql(name,'UPDATE contacts SET source_label=NULL;\n'+rollbackText).status,0);assert.equal((await cli.columns(probe)).length,0);
        await probe.$disconnect();probe=null;await db.$executeRawUnsafe(`DROP DATABASE "${name}"`);
        await evidence.main(['--backend',backend,'--app-root',appRoot,'--directory',directory,'--target',targetFile,'--mode','restore']);
        const second=fs.readdirSync(directory).filter(name=>name.startsWith('contact-backup-')).find(name=>name!==first);
        const base=path.join(directory,second),manifest=secureRead(path.join(base,'manifest.json')),proof=secureRead(path.join(base,'rehearsal-proof.json')),receipt=secureRead(path.join(base,'verification-receipt.json')).value;
        // Synthetic-only offsite attestation exercises policy. No production/offsite claim is made.
        receipt.offsite={sha256:manifest.value.sha256,encrypted:true,location_id:'synthetic-test-receipt',verified_at:new Date().toISOString()};
        const sHash=await cli.schemaHash(db),adapter=cli.databaseAdapter(db,r(path.join(backend,'src/utils/phone.ts'))),rows=[];
        await adapter.read(async session=>{for(const n of [1,2])rows.push(await session.row(id(n),'test-tenant'));});
        const now=Date.now(),plan={version:2,mode:'DRY_RUN',tenant:'test-tenant',target,active_revision:'a'.repeat(40),schema_sha256:sHash,captured_at:new Date(now).toISOString(),candidates:rows.map(row=>({inventory_id:row.id,tenant_id:row.tenant_id,expected_updated_at:row.updated_at,
            snapshot_hash:row.snapshot_hash,identity_hash:row.identity_hash,can_propose:true,proposed_changes:{referral_partner_id:null},original_values:{referral_partner_id:row.referral_partner_id}}))};
        const context={target,schemaHash:sHash,activeRevision:plan.active_revision,subjectHash:g.sha256(JSON.stringify(plan)),evidenceBundle:{manifest:manifest.value,proof:proof.value,receipt,
            archiveHash:await cli.hashArchive(manifest.value.archive,manifest.value.bytes),proofHash:g.sha256(proof.bytes)}};
        const approval={version:1,approved:true,operation:'repair-partners',operation_id:crypto.randomUUID(),approved_by:'Synthetic reviewer',reason:'Explicit synthetic-only PostgreSQL transaction test',approved_at:new Date(now).toISOString(),expires_at:new Date(now+600000).toISOString(),
            target,tenant:plan.tenant,active_revision:plan.active_revision,subject_sha256:context.subjectHash,approved_row_ids:[id(1),id(2)]};
        const journals=path.join(appRoot,'journals');fs.mkdirSync(journals,{mode:0o700});
        const journal=new FileJournal(journals,approval.operation_id);
        const result=await g.executeRepair({db:adapter,journal,plan,approved:approval,context});assert.equal(result.changed,2);
        const original=secureRead(journal.filename).value;assert.equal(original.status,'committed');passed('real SELECT FOR UPDATE + serializable transaction + durable journal repair');
        await assert.rejects(g.executeRepair({db:adapter,journal,plan,approved:approval,context}),e=>e.code==='OPERATION_EXISTS');passed('real operation replay cannot repeat writes');
        const rollbackApproval={...approval,operation:'rollback-partners',operation_id:crypto.randomUUID(),subject_sha256:g.sha256(fs.readFileSync(journal.filename))};
        const rollbackContext={...context,subjectHash:rollbackApproval.subject_sha256};
        await db.$executeRawUnsafe('UPDATE inventory SET price=price+1 WHERE id=$1',id(1));
        await assert.rejects(g.executeRollback({db:adapter,journal:new FileJournal(journals,rollbackApproval.operation_id),original,approved:rollbackApproval,context:rollbackContext}),e=>e.code==='ROW_CHANGED');passed('real concurrent price edit without updated_at prevents rollback');
        await db.$executeRawUnsafe('UPDATE inventory SET price=price-1 WHERE id=$1',id(1));
        const undoApproval={...rollbackApproval,operation_id:crypto.randomUUID()};
        await g.executeRollback({db:adapter,journal:new FileJournal(journals,undoApproval.operation_id),original,approved:undoApproval,context:rollbackContext});
        const [restored]=await db.$queryRawUnsafe('SELECT count(*)::integer AS count FROM inventory WHERE referral_partner_id=$1',id(300));assert.equal(restored.count,2);passed('real rollback restores exact links and leaves unrelated fields intact');
        console.log(JSON.stringify({result:'POSTGRES_GUARDS_PASS',cluster:target.cluster_id,production_cluster_not_used:true,checks:flags,offsite_attestation_was_synthetic:true}));
    }finally{if(probe)await probe.$disconnect();await db.$disconnect();}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
