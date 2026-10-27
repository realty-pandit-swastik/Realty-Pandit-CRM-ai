#!/usr/bin/env node
'use strict';
// Read-only unless repair/rollback/reconcile is explicitly accompanied by --execute.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {createRequire}=require('node:module');
const {parseArgs}=require('node:util');
const g=require('./contact-guards.cjs');
const {FileJournal,secureRead,privateDirectory,writePrivate,syncDirectory}=require('./contact-journal.cjs');

function argumentsFor(argv) {
    const parsed=parseArgs({args:argv,allowPositionals:true,strict:true,options:{
        backend:{type:'string'},'app-root':{type:'string'},tenant:{type:'string'},approval:{type:'string'},plan:{type:'string'},
        'backup-manifest':{type:'string'},proof:{type:'string'},receipt:{type:'string'},'journal-dir':{type:'string'},journal:{type:'string'},
        migration:{type:'string'},rollback:{type:'string'},out:{type:'string'},execute:{type:'boolean',default:false},help:{type:'boolean',default:false},
    }});
    g.requireThat(parsed.positionals.length===1 && ['inspect','schema','plan','check-repair','repair','rollback','reconcile','migration-check'].includes(parsed.positionals[0]),
        'INVALID_COMMAND','Use inspect, schema, plan, check-repair, repair, rollback, reconcile or migration-check');
    const result={command:parsed.positionals[0],...parsed.values};
    g.requireThat(!result.execute||['repair','rollback','reconcile'].includes(result.command),'NO_AUTOMATIC_DDL','Only repair, rollback or journal reconciliation accept --execute');
    return result;
}
function activeRelease(root) {
    g.requireThat(root && path.isAbsolute(root),'APP_ROOT_REQUIRED','An explicit application root is required');
    root=fs.realpathSync(root);
    const current=fs.realpathSync(path.join(root,'current'));
    g.requireThat(path.dirname(current)===path.join(root,'releases'),'LAYOUT_UNPREPARED','Current must target a direct release directory');
    const revision=fs.readFileSync(path.join(current,'REVISION'),'utf8').trim();
    g.requireThat(g.validRevision(revision) && path.basename(current)===revision,'REVISION_UNPROVEN','Active release revision cannot be proved');
    return {root,current,revision};
}
function operationLock(root) {
    const filename=path.join(root,'.production-change.lock');
    // Deployment creates this shared lock first under its authorized filesystem owner.
    const fd=fs.openSync(filename,fs.constants.O_RDWR|fs.constants.O_NOFOLLOW);
    try {
        const stat=fs.fstatSync(fd);
        g.requireThat(stat.isFile() && stat.nlink===1 && (stat.mode&0o007)===0,'UNSAFE_LOCK','Shared change lock must not be public or symlinked');
        const result=cp.spawnSync('flock',['--nonblock','3'],{stdio:['ignore','ignore','pipe',fd],encoding:'utf8',timeout:5000});
        g.requireThat(result.status===0,'CHANGE_LOCKED','A deployment/change is running or shared locking is unavailable');
        return ()=>fs.closeSync(fd);
    } catch(error){fs.closeSync(fd);throw error;}
}
async function hashArchive(filename,expectedBytes) {
    g.requireThat(path.isAbsolute(filename),'UNSAFE_BACKUP','Backup path must be absolute');
    const fd=fs.openSync(filename,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    try {
        const stat=fs.fstatSync(fd),magic=Buffer.alloc(5);
        fs.readSync(fd,magic,0,5,0);
        g.requireThat(stat.isFile() && stat.nlink===1 && stat.uid===process.getuid() && (stat.mode&0o077)===0 && stat.size===expectedBytes && magic.toString()==='PGDMP',
            'UNSAFE_BACKUP','Backup must be the private, non-empty custom archive recorded by its manifest');
        const hash=crypto.createHash('sha256');
        for await(const chunk of fs.createReadStream(filename,{fd,autoClose:false,start:0}))hash.update(chunk);
        return hash.digest('hex');
    } finally{fs.closeSync(fd);}
}
async function loadEvidence(args) {
    for(const key of ['backup-manifest','proof','receipt'])g.requireThat(args[key],'EVIDENCE_REQUIRED','Backup, restore proof and independent receipt paths are required');
    const manifest=secureRead(args['backup-manifest']),proof=secureRead(args.proof),receipt=secureRead(args.receipt);
    const archiveHash=await hashArchive(manifest.value.archive,manifest.value.bytes);
    return {manifest:manifest.value,proof:proof.value,receipt:receipt.value,archiveHash,proofHash:g.sha256(proof.bytes)};
}
async function runtimeRevision(expected,expectedDatabaseFingerprint,instances) {
    g.requireThat(Array.isArray(instances)&&instances.length>0&&instances.length<=8&&new Set(instances).size===instances.length&&instances.every(i=>typeof i==='string'&&/^[A-Za-z0-9_-]{1,32}$/.test(i)),
        'REVISION_UNPROVEN','Verified backend worker identities are required');
    const seen=new Set();let successes=0;
    for(let sample=0;sample<instances.length*8;sample++){
    const response=await fetch('http://127.0.0.1:7071/health',{signal:AbortSignal.timeout(10_000),redirect:'error',headers:{Connection:'close'}});
    g.requireThat(response.ok,'UNHEALTHY_APPLICATION','Application is not healthy');
    const reader=response.body?.getReader();g.requireThat(reader,'UNHEALTHY_APPLICATION','Health response body is missing');
    const parts=[];let size=0;
    for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>65536){await reader.cancel();throw new g.GuardError('HEALTH_RESPONSE_TOO_LARGE','Health response exceeds its budget');}parts.push(Buffer.from(part.value));}
    const health=JSON.parse(Buffer.concat(parts).toString('utf8'));
    g.requireThat(health.status==='ok' && health.db?.status==='connected' && health.redis?.status==='connected' && health.release===expected && health.db.fingerprint===expectedDatabaseFingerprint && instances.includes(health.instance),
        'REVISION_UNPROVEN','Running application revision/dependencies do not match the approved release');
    seen.add(health.instance);successes++;
    if(seen.size===instances.length&&successes>=instances.length*2)return;
    }
    throw new g.GuardError('REVISION_UNPROVEN','Not every backend worker could be verified');
}
const COLUMN_WHERE=g.COLUMNS.map(([table,column])=>`(table_name='${table}' AND column_name='${column}')`).join(' OR ');
async function columns(client) {return client.$queryRawUnsafe(`SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND (${COLUMN_WHERE}) ORDER BY table_name,column_name`);}
async function schemaHash(client) {
    // Preserve logical column order, not physical attnum gaps left by historical DROP COLUMN.
    const rows=await client.$queryRawUnsafe("SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position");
    const constraints=await client.$queryRawUnsafe("SELECT c.relname AS table_name,k.conname,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,k.conname");
    const indexes=await client.$queryRawUnsafe("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname");
    const enums=await client.$queryRawUnsafe("SELECT t.typname,e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder");
    const functions=await client.$queryRawUnsafe("SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p') ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)");
    const triggers=await client.$queryRawUnsafe("SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname");
    const policies=await client.$queryRawUnsafe("SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname");
    return g.sha256(g.canonical({columns:rows,constraints,indexes,enums,functions,triggers,policies}));
}
async function identity(client) {
    try {
        const [row]=await client.$queryRawUnsafe(`SELECT current_database()::text AS database,(SELECT system_identifier::text FROM pg_catalog.pg_control_system()) AS cluster_id,
          (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS database_oid,
          pg_is_in_recovery() AS in_recovery,current_setting('default_transaction_read_only')='on' AS read_only,current_user::text AS operator_role`);
        return row;
    } catch {throw new g.GuardError('TARGET_UNPROVEN','Cannot prove cluster identity; an authorized operator needs read access to pg_control_system()');}
}
async function history(client) {
    const rows=await client.$queryRawUnsafe('SELECT migration_name,checksum,finished_at,rolled_back_at FROM public._prisma_migrations ORDER BY migration_name,started_at');
    return {rows,hash:g.sha256(g.canonical(rows))};
}
function migrationFiles(backend,rows,allowedPending=[]) {
    const folder=path.join(backend,'prisma/migrations'),local=fs.readdirSync(folder,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name);
    g.requireThat(rows.every(row=>row.finished_at||row.rolled_back_at),'MIGRATION_HISTORY_CHANGED','Unfinished migrations require explicit reconciliation');
    const applied=rows.filter(row=>row.finished_at&&!row.rolled_back_at),names=new Set(applied.map(row=>row.migration_name));
    for(const row of applied)g.requireThat(local.includes(row.migration_name)&&g.sha256(fs.readFileSync(path.join(folder,row.migration_name,'migration.sql')))===row.checksum,
        'MIGRATION_HISTORY_CHANGED','Applied migration bytes are missing or differ from the candidate');
    const pending=local.filter(name=>!names.has(name));
    g.requireThat(g.equal(pending.sort(),[...allowedPending].sort()),'UNEXPECTED_MIGRATIONS','Unexpected pending migrations require separate reconciliation');
}
function databaseAdapter(client,phone) {
    function session(tx) {
        let staff;
        const locked=new Map();
        async function employees(tenant,lock) {
            if(!staff)staff=await tx.$queryRawUnsafe('SELECT id,phone,role,status FROM public.agents WHERE tenant_id=$1 ORDER BY id'+(lock?' FOR SHARE':''),tenant);
            return staff;
        }
        function staffFor(all,number){const normalized=phone.normalizePhone(number||'');return normalized?all.filter(a=>phone.normalizePhone(a.phone||'')===normalized):[];}
        function partnerHash(partner,all) {return partner?g.sha256(g.canonical({partner,staff:staffFor(all,partner.phone_number)})):null;}
        async function read(id,tenant,lock=false) {
            if(lock) {
                await tx.$queryRawUnsafe('SELECT id FROM public.inventory WHERE id=$1 AND tenant_id=$2 FOR UPDATE',id,tenant);
                const [links]=await tx.$queryRawUnsafe('SELECT owner_phone,owner_id,referral_partner_id FROM public.inventory WHERE id=$1 AND tenant_id=$2',id,tenant);
                if(!links)return null;
                await tx.$queryRawUnsafe('SELECT phone_number FROM public.contacts WHERE phone_number=$1 OR phone_number=(SELECT contact_phone FROM public.owners WHERE id=$2) FOR SHARE',links.owner_phone,links.owner_id);
                await tx.$queryRawUnsafe('SELECT id FROM public.owners WHERE id=$1 FOR SHARE',links.owner_id);
                if(links.referral_partner_id) {
                    await tx.$queryRawUnsafe('SELECT id FROM public.partner_agents WHERE id=$1 FOR SHARE',links.referral_partner_id);
                    await tx.$queryRawUnsafe('SELECT c.phone_number FROM public.contacts c JOIN public.partner_agents p ON p.phone_number=c.phone_number WHERE p.id=$1 FOR SHARE OF c',links.referral_partner_id);
                }
            }
            const [data]=await tx.$queryRawUnsafe(`SELECT to_jsonb(i)::text AS row_json,i.updated_at AS row_updated_at,(to_jsonb(i)-'referral_partner_id'-'updated_at')::text AS preserved_json,
              CASE WHEN c.phone_number IS NULL THEN NULL ELSE jsonb_build_object('phone_number',c.phone_number,'tenant_id',c.tenant_id,'contact_type',c.contact_type,'client_role',c.client_role) END AS contact,
              CASE WHEN o.id IS NULL THEN NULL ELSE jsonb_build_object('id',o.id,'contact_phone',o.contact_phone,'contact_tenant',oc.tenant_id) END AS owner,
              CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('id',p.id,'phone_number',p.phone_number,'name',p.name,'status',p.status,'managing_agent_id',p.managing_agent_id,'contact_tenant',pc.tenant_id) END AS partner
              FROM public.inventory i LEFT JOIN public.contacts c ON c.phone_number=i.owner_phone LEFT JOIN public.owners o ON o.id=i.owner_id LEFT JOIN public.contacts oc ON oc.phone_number=o.contact_phone
              LEFT JOIN public.partner_agents p ON p.id=i.referral_partner_id LEFT JOIN public.contacts pc ON pc.phone_number=p.phone_number
              WHERE i.id=$1 AND i.tenant_id=$2`,id,tenant);
            if(!data)return null;
            const row=JSON.parse(data.row_json),all=await employees(tenant,lock),normalize=value=>phone.normalizePhone(value||'');
            const ownerKnown=!phone.isUnresolvedPropertyContactPhone(row.owner_phone) && !!data.contact && !!data.owner && data.contact.tenant_id===tenant && data.owner.contact_tenant===tenant &&
                normalize(row.owner_phone)===normalize(data.owner.contact_phone) && (!row.owner_contact_id || normalize(row.owner_contact_id)===normalize(row.owner_phone));
            const pHash=partnerHash(data.partner,all);
            const result={id:row.id,tenant_id:row.tenant_id,updated_at:new Date(data.row_updated_at).toISOString(),ownership_type:row.ownership_type,
                referral_partner_id:row.referral_partner_id,owner_known:ownerKnown,contact_exists:!!data.contact && data.contact.tenant_id===tenant,
                owner_staff:staffFor(all,row.owner_phone).length>0,partner_staff:!!data.partner && data.partner.contact_tenant===tenant && staffFor(all,data.partner.phone_number).length>0,
                snapshot_hash:g.sha256(data.row_json),preserved_hash:g.sha256(data.preserved_json),partner_hash:pHash,
                identity_hash:g.sha256(g.canonical({contact:data.contact,owner:data.owner,owner_staff:staffFor(all,row.owner_phone),partner_hash:pHash})),
                _raw:data.row_json};
            if(lock)locked.set(id,result);return result;
        }
        const advisoryLock=async()=>{const [row]=await tx.$queryRawUnsafe('SELECT pg_try_advisory_xact_lock($1::integer,$2::integer) AS locked',...g.LOCK);return row.locked===true;};
        return {
            advisoryLock,
            lock:async()=>{
                if(!await advisoryLock())return false;
                try{await tx.$executeRawUnsafe('LOCK TABLE public.inventory IN SHARE UPDATE EXCLUSIVE MODE NOWAIT');}
                catch{throw new g.GuardError('CHANGE_LOCKED','Inventory DDL/maintenance is running');}
                return true;
            },
            safeTable:async()=>{
                const [safe]=await tx.$queryRawUnsafe(`SELECT c.relkind='r' AND NOT c.relrowsecurity AND NOT c.relforcerowsecurity
                  AND NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal)
                  AND NOT EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class=c.oid AND rulename<>'_RETURN')
                  AND NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=c.oid AND attgenerated<>'')
                  AND NOT EXISTS(SELECT 1 FROM pg_constraint k JOIN pg_depend d ON d.classid='pg_constraint'::regclass AND d.objid=k.oid JOIN pg_proc p ON d.refclassid='pg_proc'::regclass AND d.refobjid=p.oid JOIN pg_namespace n ON n.oid=p.pronamespace WHERE k.conrelid=c.oid AND n.nspname<>'pg_catalog') AS ok
                  FROM pg_class c WHERE c.oid='public.inventory'::regclass`);
                return safe?.ok===true;
            },
            target:()=>identity(tx),schemaHash:()=>schemaHash(tx),columns:()=>columns(tx),row:read,
            change:async(id,tenant,partner,expectedHash)=>{
                const before=locked.get(id);
                g.requireThat(before && before.snapshot_hash===expectedHash,'ROW_CHANGED','Locked row snapshot is unavailable');
                const changed=await tx.$queryRawUnsafe("UPDATE public.inventory i SET referral_partner_id=$3,updated_at=timezone('UTC',clock_timestamp()) WHERE id=$1 AND tenant_id=$2 AND to_jsonb(i)::text=$4 RETURNING id",id,tenant,partner,before._raw);
                g.requireThat(changed.length===1,'ROW_CHANGED','Conditional inventory update did not match exactly one row');
                return read(id,tenant,false);
            },
            partnerUnchanged:async(id,tenant,change,lock=false)=>{
                if(lock){await tx.$queryRawUnsafe('SELECT id FROM public.partner_agents WHERE id=$1 FOR SHARE',id);
                    await tx.$queryRawUnsafe('SELECT c.phone_number FROM public.contacts c JOIN public.partner_agents p ON p.phone_number=c.phone_number WHERE p.id=$1 FOR SHARE OF c',id);}
                const [partner]=await tx.$queryRawUnsafe("SELECT jsonb_build_object('id',p.id,'phone_number',p.phone_number,'name',p.name,'status',p.status,'managing_agent_id',p.managing_agent_id,'contact_tenant',c.tenant_id) AS value FROM public.partner_agents p LEFT JOIN public.contacts c ON c.phone_number=p.phone_number WHERE p.id=$1",id);
                return !!partner && partner.value.contact_tenant===tenant && partnerHash(partner.value,await employees(tenant,lock))===change.original_partner_hash;
            },
        };
    }
    return {
        transaction:work=>client.$transaction(async tx=>{
            await tx.$executeRawUnsafe("SET LOCAL lock_timeout='2s'");await tx.$executeRawUnsafe("SET LOCAL statement_timeout='10s'");
            await tx.$executeRawUnsafe('SET LOCAL search_path=pg_catalog,public');
            const [mode]=await tx.$queryRawUnsafe("SELECT current_setting('transaction_read_only')='off' AS writable");g.requireThat(mode.writable,'READ_ONLY_TARGET','Transaction is read-only');
            return work(session(tx));
        },{isolationLevel:'Serializable',maxWait:2000,timeout:20000}),
        read:work=>client.$transaction(async tx=>{
            await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');await tx.$executeRawUnsafe("SET LOCAL statement_timeout='20s'");
            await tx.$executeRawUnsafe('SET LOCAL search_path=pg_catalog,public');
            return work(session(tx),tx);
        },{maxWait:5000,timeout:30000}),
    };
}
function boundedConnection(value){const url=new URL(value);for(const [key,number] of [['connection_limit','2'],['connect_timeout','5'],['pool_timeout','5']])url.searchParams.set(key,number);return url.toString();}
async function main(argv=process.argv.slice(2)) {
    if(argv.includes('--help')){console.log('contact-change <inspect|schema|plan|check-repair|repair|rollback|reconcile|migration-check> --backend <absolute backend> [private evidence paths] [--execute]\nDefault is read-only. See docs/runbooks/contact-change-guardrails.md.');return;}
    const args=argumentsFor(argv);
    g.requireThat(args.backend && path.isAbsolute(args.backend),'BACKEND_REQUIRED','An absolute installed backend path is required');
    const backend=fs.realpathSync(args.backend),r=createRequire(path.join(backend,'package.json'));
    if(args.command==='schema'){
        const configured=r('dotenv').parse(fs.readFileSync(path.join(backend,'.env'))).DATABASE_URL;
        g.requireThat(configured,'DATABASE_URL_REQUIRED','Candidate environment must explicitly configure DATABASE_URL');
        g.requireThat(!process.env.DATABASE_URL||process.env.DATABASE_URL===configured,'ENVIRONMENT_DRIFT','Operator environment differs from candidate database configuration');
        process.env.DATABASE_URL=configured;
    }
    g.requireThat(process.env.DATABASE_URL,'DATABASE_URL_REQUIRED','Set DATABASE_URL explicitly in the operator environment');
    const {PrismaClient,Prisma}=r('@prisma/client'),client=new PrismaClient({datasources:{db:{url:boundedConnection(process.env.DATABASE_URL)}},log:[]});
    let unlock;
    try {
        if(args.command==='schema') {
            const schema=fs.readFileSync(path.join(backend,'prisma/schema.prisma'),'utf8');
            const usesCatalog=fs.existsSync(path.join(backend,'src/data/contact_catalog.ts'));
            const needsColumns=/\bproperty_contact_role\s+String\?/.test(schema)||usesCatalog;
            if(!needsColumns){console.log(JSON.stringify({result:'LEGACY_SCHEMA_CONTRACT'}));return;}
            r('ts-node').register({transpileOnly:true,project:path.join(backend,'tsconfig.json')});
            const releaseIdentity=r(path.join(backend,'src/utils/release_identity.ts'));
            const [database]=await client.$queryRawUnsafe(releaseIdentity.DATABASE_IDENTITY_SQL);
            g.requireThat(database.name===g.DATABASE,'WRONG_TARGET','Candidate is configured for another database');g.schemaReady(await columns(client));
            const allColumns=await client.$queryRawUnsafe("SELECT table_name,column_name,data_type,udt_name,is_nullable FROM information_schema.columns WHERE table_schema='public'");
            const allEnums=await client.$queryRawUnsafe("SELECT t.typname,e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder");
            const mismatch=g.modelContract(Prisma?.dmmf?.datamodel,allColumns,allEnums);
            if(mismatch.length)throw Object.assign(new g.GuardError('SCHEMA_NOT_READY','Candidate model contract is incompatible'),{safe_details:mismatch.slice(0,20)});
            migrationFiles(backend,(await history(client)).rows,[]);
            console.log(JSON.stringify({result:'SCHEMA_READY',database_fingerprint:releaseIdentity.databaseFingerprint(database)}));return;
        }
        g.requireThat(process.platform==='linux','LINUX_OPERATOR_REQUIRED','Run operational guards in the Linux operator environment');
        const metadata=await client.$transaction(async tx=>{
            await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');await tx.$executeRawUnsafe("SET LOCAL statement_timeout='20s'");
            return {target:await identity(tx),sHash:await schemaHash(tx),h:await history(tx)};
        },{isolationLevel:'RepeatableRead',maxWait:5000,timeout:30000});
        const {target,sHash,h}=metadata;
        if(args.command==='inspect'){console.log(JSON.stringify({target,schema_sha256:sHash,migration_history_sha256:h.hash,columns:await columns(client)}));return;}
        const release=activeRelease(args['app-root']);
        const context={target,schemaHash:sHash,activeRevision:release.revision};
        if(args.command==='plan') {
            g.requireThat(typeof args.tenant==='string' && args.tenant.length>0 && args.tenant.length<=100,'TENANT_REQUIRED','Explicit tenant required');
            r('ts-node').register({transpileOnly:true,project:path.join(backend,'tsconfig.json')});
            const phone=r(path.join(backend,'src/utils/phone.ts')),db=databaseAdapter(client,phone);
            const plan=await db.read(async(session,tx)=>{
                const ids=await tx.$queryRawUnsafe('SELECT id FROM public.inventory WHERE tenant_id=$1 ORDER BY id LIMIT 10001',args.tenant);
                g.requireThat(ids.length<=10000,'PLAN_TOO_LARGE','Narrow the operational scope before planning more than 10,000 records');
                const candidates=[];
                for(const {id} of ids){const row=await session.row(id,args.tenant);if(!row.owner_staff&&!row.partner_staff)continue;
                    const can=row.owner_known && row.ownership_type==='OWNER' && !row.owner_staff && row.partner_staff;
                    candidates.push({inventory_id:row.id,tenant_id:args.tenant,expected_updated_at:row.updated_at,snapshot_hash:row.snapshot_hash,identity_hash:row.identity_hash,
                        can_propose:can,review_required:true,proposed_changes:can?{referral_partner_id:null}:null,original_values:{referral_partner_id:row.referral_partner_id}});
                }
                return {version:2,mode:'DRY_RUN',tenant:args.tenant,target,active_revision:release.revision,schema_sha256:sHash,captured_at:new Date().toISOString(),scanned:ids.length,candidates};
            });
            g.requireThat(args.out && path.isAbsolute(args.out),'OUTPUT_REQUIRED','A new private output path is required');privateDirectory(path.dirname(args.out));
            writePrivate(args.out,plan,true);syncDirectory(path.dirname(args.out));
            console.log(JSON.stringify({result:'DRY_RUN',scanned:plan.scanned,candidates:plan.candidates.length,proposed:plan.candidates.filter(c=>c.can_propose).length,plan_sha256:g.sha256(fs.readFileSync(args.out)),out:args.out}));return;
        }
        r('ts-node').register({transpileOnly:true,project:path.join(backend,'tsconfig.json')});
        const db=databaseAdapter(client,r(path.join(backend,'src/utils/phone.ts')));
        if(args.command==='reconcile') {
            if(args.execute)unlock=operationLock(release.root);
            g.requireThat(args.journal,'JOURNAL_REQUIRED','A prepared operation journal is required');
            const record=secureRead(args.journal).value;g.target(target,record.target,false);
            const rows=await db.read(async session=>{g.requireThat(await session.advisoryLock(),'CHANGE_LOCKED','An operation is still running; do not classify its journal');const found=[];for(const change of record.changes||[]){const row=await session.row(change.inventory_id,record.tenant);if(row)found.push(row);}return found;});
            const result=g.reconciliation(record,rows);
            const updateJournal=args.execute&&record.status==='prepared'&&result!=='MANUAL_REVIEW_REQUIRED';
            if(updateJournal){
                const journal=new FileJournal(path.dirname(args.journal),record.operation_id);
                g.requireThat(journal.filename===args.journal,'INVALID_JOURNAL','Journal path does not match its operation ID');
                await journal.save({...record,status:result==='COMMITTED'?'committed':'aborted_before_commit',reconciled_at:new Date().toISOString()});
            }
            console.log(JSON.stringify({result,changes:record.changes?.length||0,journal_updated:updateJournal}));return;
        }
        g.requireThat(args.approval,'APPROVAL_REQUIRED','A private, explicit approval document is required');
        const approved=secureRead(args.approval).value;
        context.evidenceBundle=await loadEvidence(args);
        if(args.command==='migration-check') {
            g.requireThat(args.migration&&args.rollback,'SQL_REQUIRED','Exact migration and rollback files are required');
            context.subjectHash=g.sha256(fs.readFileSync(args.migration));context.migrationHash=context.subjectHash;context.rollbackHash=g.sha256(fs.readFileSync(args.rollback));
            g.approval(approved,{...context,operation:'migration-check'});g.evidence(context.evidenceBundle,{...context,operation:'migration-check'});
            g.requireThat(approved.migration_history_sha256===h.hash && h.rows.every(row=>row.finished_at||row.rolled_back_at),'MIGRATION_HISTORY_CHANGED','Migration history differs or contains unfinished work');
            migrationFiles(backend,h.rows,[g.MIGRATION]);
            g.requireThat((await columns(client)).length===0,'SCHEMA_DRIFT','Partial/already-applied contact columns require review');
            g.requireThat(!args.execute,'NO_AUTOMATIC_DDL','This command checks only; production DDL remains a separate approved SQL session');
            console.log(JSON.stringify({result:'READY_FOR_REVIEWED_SQL',migration:g.MIGRATION,sql_sha256:context.migrationHash,cluster_id:target.cluster_id,approval_expires_at:approved.expires_at}));return;
        }
        const rollback=args.command==='rollback',document=secureRead(rollback?args.journal:args.plan);
        context.subjectHash=g.sha256(document.bytes);
        const record=document.value,operation=rollback?'rollback-partners':'repair-partners';
        g.approval(approved,{...context,operation,tenant:record.tenant});g.evidence(context.evidenceBundle,{...context,operation});
        g.schemaReady(await columns(client));
        if(!rollback)g.repairSelection(record,approved,context);
        if(!args.execute || args.command==='check-repair') {
            if(!rollback){await db.read(async session=>{for(const row of g.repairSelection(record,approved,context))g.liveRepairRow(await session.row(row.inventory_id,record.tenant),row,record.tenant);});}
            else{await db.read(async session=>{for(const change of g.rollbackSelection(record,approved,context)){g.liveRollbackRow(await session.row(change.inventory_id,record.tenant),change,record.tenant);
                g.requireThat(await session.partnerUnchanged(change.original_referral_partner_id,record.tenant,change),'IDENTITY_CHANGED','Original partner identity changed');}});}
            console.log(JSON.stringify({result:'CHECK_ONLY',database_mutated:false,operation}));return;
        }
        const releaseIdentity=r(path.join(backend,'src/utils/release_identity.ts'));
        const [databaseIdentity]=await client.$queryRawUnsafe(releaseIdentity.DATABASE_IDENTITY_SQL);
        const verified=JSON.parse(fs.readFileSync(path.join(release.current,'.verified.json'),'utf8'));
        g.requireThat(verified.revision===release.revision,'REVISION_UNPROVEN','Active release lacks matching verification metadata');
        await runtimeRevision(release.revision,releaseIdentity.databaseFingerprint(databaseIdentity),verified.instances);
        unlock=operationLock(release.root);
        g.requireThat(activeRelease(release.root).revision===release.revision,'REVISION_CHANGED','Deployment changed during preflight');
        const journal=new FileJournal(args['journal-dir'],approved.operation_id);
        const result=rollback?await g.executeRollback({db,journal,original:record,approved,context}):await g.executeRepair({db,journal,plan:record,approved,context});
        console.log(JSON.stringify({...result,journal:journal.filename}));
    } finally{if(unlock)unlock();await client.$disconnect();}
}
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({result:'BLOCKED',code:error.code||'OPERATION_FAILED',message:error instanceof g.GuardError?error.message:'Operation failed; inspect private operator evidence without exposing credentials',details:error instanceof g.GuardError?error.safe_details:undefined}));process.exitCode=1;});
module.exports={argumentsFor,activeRelease,operationLock,hashArchive,runtimeRevision,boundedConnection,columns,schemaHash,identity,history,migrationFiles,databaseAdapter,main};
