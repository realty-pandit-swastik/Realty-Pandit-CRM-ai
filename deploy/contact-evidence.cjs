#!/usr/bin/env node
'use strict';
// Explicit backup + disposable restore. Never migrates the source database.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {createRequire}=require('node:module'),{parseArgs}=require('node:util');
const g=require('./contact-guards.cjs');
const {privateDirectory,secureRead,writePrivate,syncDirectory}=require('./contact-journal.cjs');
const {identity,schemaHash,columns,operationLock,activeRelease,hashArchive,boundedConnection}=require('./contact-change.cjs');
const qi=v=>'"'+String(v).replaceAll('"','""')+'"';
async function counts(db) {
    const tables=await db.$queryRawUnsafe("SELECT schemaname,tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') AND schemaname NOT LIKE 'pg_%' ORDER BY schemaname,tablename");
    g.requireThat(tables.length>0&&tables.length<=1000,'TABLE_BUDGET','Unexpected restore table count');
    const out={};for(const t of tables){const [row]=await db.$queryRawUnsafe(`SELECT count(*)::text AS rows FROM ${qi(t.schemaname)}.${qi(t.tablename)}`);out[t.schemaname+'.'+t.tablename]=row.rows;}
    return out;
}
async function locale(db){const [row]=await db.$queryRawUnsafe("SELECT jsonb_build_object('encoding',pg_encoding_to_char(encoding),'collation',datcollate,'ctype',datctype,'provider',datlocprovider,'locale',coalesce(to_jsonb(d)->>'datlocale',to_jsonb(d)->>'daticulocale')) AS value FROM pg_database d WHERE datname=current_database()");return row.value;}
async function main(argv=process.argv.slice(2)) {
    const {values:a}=parseArgs({args:argv,strict:true,options:{backend:{type:'string'},'app-root':{type:'string'},directory:{type:'string'},target:{type:'string'},mode:{type:'string',default:'restore'},migration:{type:'string'},rollback:{type:'string'},help:{type:'boolean'}}});
    if(a.help){console.log('contact-evidence --backend <installed backend> --app-root <prepared root> --directory <private existing directory> --target <private reviewed target JSON> --mode <restore|migration> [--migration <SQL> --rollback <SQL>]');return;}
    g.requireThat(process.platform==='linux'&&['restore','migration'].includes(a.mode),'INVALID_MODE','Linux operator environment and explicit restore/migration mode required');
    const base=privateDirectory(a.directory),targetReview=secureRead(a.target).value,release=activeRelease(a['app-root']);
    g.requireThat(a.backend&&path.isAbsolute(a.backend)&&process.env.DATABASE_URL,'BACKEND_REQUIRED','Installed backend and explicit operator DATABASE_URL required');
    const url=new URL(process.env.DATABASE_URL),socket=url.searchParams.get('host');
    g.requireThat(socket&&path.isAbsolute(socket),'LOCAL_OPERATOR_REQUIRED','Backup/rehearsal requires a local Unix-socket operator connection');
    const r=createRequire(path.join(fs.realpathSync(a.backend),'package.json')),{PrismaClient}=r('@prisma/client');
    const source=new PrismaClient({datasources:{db:{url:boundedConnection(url.toString())}},log:[]});
    const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('PG'))delete env[key];
    Object.assign(env,{PGHOST:socket,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:g.DATABASE,PGCONNECT_TIMEOUT:'10'});
    const stamp=new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14)+'_'+crypto.randomBytes(3).toString('hex');
    const folder=path.join(base,'contact-backup-'+stamp),database='rp_contact_rehearsal_'+stamp,owner='rp_contact_owner_'+stamp;
    let unlock,clone,created=false,roleCreated=false,proof,manifest;
    function checkpoint(){if(proof){writePrivate(path.join(folder,'rehearsal-proof.json'),proof);syncDirectory(folder);}}
    function run(command,args,extra={}){
        const result=cp.spawnSync(command,args,{env,encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024,...extra});
        if(result.status!==0||result.error){fs.writeFileSync(path.join(folder,'private-command.stderr.log'),result.stderr||result.error?.code||'No stderr',{mode:0o600});throw new g.GuardError('COMMAND_FAILED','Backup/rehearsal command failed; private stderr was retained');}
        return result.stdout||'';
    }
    function cloneSql(filename){
        g.requireThat(database.startsWith('rp_contact_rehearsal_')&&database!==g.DATABASE,'WRONG_TARGET','Unsafe rehearsal name');
        run('psql',['-X','-q','--no-password','-v','ON_ERROR_STOP=1','-f',filename],{env:{...env,PGDATABASE:database,PGOPTIONS:'-c role='+owner+' -c lock_timeout=5000 -c statement_timeout=30000'}});
    }
    try {
        const actual=await identity(source);g.target(actual,targetReview);
        const [role]=await source.$queryRawUnsafe('SELECT rolsuper FROM pg_roles WHERE rolname=current_user');
        g.requireThat(role.rolsuper===true,'OPERATOR_REQUIRED','Use an explicitly authorized local PostgreSQL administrator for disposable resource ownership');
        const [code]=await source.$queryRawUnsafe("SELECT (SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%')+(SELECT count(*)::integer FROM pg_extension WHERE extname<>'plpgsql')+(SELECT count(*)::integer FROM pg_foreign_server) AS total");
        g.requireThat(code.total===0,'UNEXPECTED_SOURCE_CODE','Custom SQL code/extensions/foreign servers require a separately reviewed network-isolated restore');
        if(a.mode==='migration')g.requireThat(a.migration&&a.rollback&&(await columns(source)).length===0,'SQL_REQUIRED','Reviewed SQL files and an unmigrated source schema are required');
        unlock=operationLock(release.root);
        fs.mkdirSync(folder,{mode:0o700});
        proof={version:2,result:'IN_PROGRESS',target:actual,rehearsal_database:database,rehearsal_owner:owner,source_locale:await locale(source),started_at:new Date().toISOString(),steps:[],cleanup:{database_absent:false,role_absent:false}};
        if(a.mode==='migration')for(const name of ['migration','rollback']){
            const bytes=fs.readFileSync(a[name]);fs.writeFileSync(path.join(folder,name+'.sql'),bytes,{mode:0o600,flag:'wx'});proof[name+'_sha256']=g.sha256(bytes);
        }
        checkpoint();
        const disk=fs.statfsSync(folder),[size]=await source.$queryRawUnsafe('SELECT pg_database_size(current_database())::text AS bytes');
        g.requireThat(disk.bavail*disk.bsize>Number(size.bytes)*3+1024**3,'DISK_CAPACITY','Insufficient backup/restore capacity');
        const archive=path.join(folder,'database.dump'),partial=archive+'.partial';
        let sourceCounts,sHash;
        await source.$transaction(async tx=>{
            await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
            const [locked]=await tx.$queryRawUnsafe('SELECT pg_try_advisory_xact_lock($1::integer,$2::integer) AS ok',...g.LOCK);
            g.requireThat(locked.ok,'CHANGE_LOCKED','Another guarded database change is running');
            g.target(await identity(tx),actual,false);sHash=await schemaHash(tx);sourceCounts=await counts(tx);
            const [snapshot]=await tx.$queryRawUnsafe('SELECT pg_export_snapshot()::text AS id');
            run('pg_dump',['--format=custom','--no-owner','--no-acl','--lock-wait-timeout=5s','--snapshot='+snapshot.id,'--file',partial]);
        },{isolationLevel:'RepeatableRead',maxWait:5000,timeout:240000});
        fs.chmodSync(partial,0o600);run('pg_restore',['--list',partial]);run('pg_restore',['--exit-on-error','--file=/dev/null',partial]);fs.renameSync(partial,archive);
        const bytes=fs.statSync(archive).size,checksum=await hashArchive(archive,bytes);
        manifest={version:2,database:g.DATABASE,target:actual,format:'PostgreSQL custom archive',archive,bytes,sha256:checksum,schema_sha256:sHash,consistent_snapshot:true,completed_at:new Date().toISOString()};
        writePrivate(path.join(folder,'manifest.json'),manifest,true);proof.archive_sha256=checksum;proof.source_schema_sha256=sHash;proof.source_counts=sourceCounts;checkpoint();
        const [collision]=await source.$queryRawUnsafe('SELECT (SELECT count(*)::integer FROM pg_database WHERE datname=$1)+(SELECT count(*)::integer FROM pg_roles WHERE rolname=$2) AS total',database,owner);
        g.requireThat(collision.total===0,'RESOURCE_COLLISION','Refusing to reuse a database/role name');
        await source.$executeRawUnsafe(`CREATE ROLE ${qi(owner)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);roleCreated=true;
        await source.$executeRawUnsafe(`CREATE DATABASE ${qi(database)} OWNER ${qi(owner)} TEMPLATE template0 CONNECTION LIMIT 3`);created=true;
        await source.$executeRawUnsafe(`REVOKE ALL ON DATABASE ${qi(database)} FROM PUBLIC`);
        const cloneUrl=new URL(url);cloneUrl.pathname='/'+database;clone=new PrismaClient({datasources:{db:{url:boundedConnection(cloneUrl.toString())}},log:[]});
        g.requireThat(g.equal(await locale(clone),proof.source_locale),'LOCALE_MISMATCH','Scratch database locale/encoding must match the source');
        const schema=run('pg_restore',['--schema-only','--no-owner','--no-acl','--no-comments','--file=-',archive]);
        g.requireThat(!/^(?:CREATE|ALTER|DROP) DATABASE\b|^\\connect\b/m.test(schema),'UNSAFE_RESTORE','Unexpected database-level restore commands');
        if(/^CREATE SCHEMA public;/m.test(schema))await clone.$executeRawUnsafe('DROP SCHEMA public');
        run('pg_restore',['--exit-on-error','--single-transaction','--no-owner','--no-acl','--no-comments','--no-tablespaces','--role='+owner,'--dbname='+database,archive],
            {env:{...env,PGDATABASE:database,PGOPTIONS:'-c lock_timeout=5000 -c statement_timeout=30000'}});
        const restored=await counts(clone);g.requireThat(g.equal(sourceCounts,restored),'RESTORE_MISMATCH','Restored counts differ from the exported backup snapshot');
        g.requireThat(await schemaHash(clone)===sHash,'RESTORE_MISMATCH','Restored logical schema differs from source snapshot');
        proof.restored_counts=restored;proof.counts_verified=true;proof.steps.push({step:'restore',result:'PASS',tables:Object.keys(restored).length});checkpoint();
        if(a.mode==='migration') {
            cloneSql(path.join(folder,'migration.sql'));g.schemaReady(await columns(clone));g.requireThat(g.equal(restored,await counts(clone)),'MIGRATION_DATA_CHANGED','Forward migration changed row counts');
            proof.steps.push({step:'forward_migration',result:'PASS'});checkpoint();
            cloneSql(path.join(folder,'rollback.sql'));g.requireThat(await schemaHash(clone)===sHash&&g.equal(restored,await counts(clone)),'ROLLBACK_MISMATCH','Rollback did not restore the original column schema/counts');
            proof.steps.push({step:'rollback',result:'PASS'});checkpoint();
            cloneSql(path.join(folder,'migration.sql'));g.schemaReady(await columns(clone));g.requireThat(g.equal(restored,await counts(clone)),'MIGRATION_DATA_CHANGED','Reapply changed row counts');
            proof.steps.push({step:'reapply',result:'PASS'});checkpoint();
        }
        g.requireThat(await schemaHash(source)===sHash,'SCHEMA_DRIFT','Source schema changed during the rehearsal');
        g.requireThat(await hashArchive(archive,bytes)===checksum,'BACKUP_CHANGED','Backup changed during rehearsal');proof.result='PASS';
    } catch(error){if(proof){proof.result='FAIL';proof.error_code=error.code||'REHEARSAL_FAILED';}throw error;}
    finally {
        if(clone)await clone.$disconnect();
        try{if(created)await source.$executeRawUnsafe(`DROP DATABASE ${qi(database)}`);
            if(roleCreated)await source.$executeRawUnsafe(`DROP ROLE ${qi(owner)}`);
            if(proof){const [left]=await source.$queryRawUnsafe('SELECT (SELECT count(*)::integer FROM pg_database WHERE datname=$1) AS databases,(SELECT count(*)::integer FROM pg_roles WHERE rolname=$2) AS roles',database,owner);
                proof.cleanup.database_absent=left.databases===0;proof.cleanup.role_absent=left.roles===0;g.requireThat(left.databases===0&&left.roles===0,'CLEANUP_FAILED','Disposable resources remain');}
        }catch{if(proof){proof.result='FAIL';proof.cleanup.error='Manual disposal verification required';}}
        if(proof){proof.completed_at=new Date().toISOString();checkpoint();}
        if(unlock)unlock();await source.$disconnect();
    }
    // Deliberately no automatic off-server assertion. Transfer/encryption must be independently verified.
    const receipt={version:2,result:proof.result,archive_sha256:manifest.sha256,proof_sha256:g.sha256(fs.readFileSync(path.join(folder,'rehearsal-proof.json'))),offsite:null};
    writePrivate(path.join(folder,'verification-receipt.json'),receipt,true);syncDirectory(folder);
    g.requireThat(proof.result==='PASS','CLEANUP_FAILED','Rehearsal cleanup did not complete');
    console.log(JSON.stringify({result:'BACKUP_RESTORE_PASS',folder,tables:Object.keys(proof.source_counts).length,offsite_verification_required:true}));
}
if(require.main===module)main().catch(error=>{console.error(JSON.stringify({result:'BLOCKED',code:error.code||'REHEARSAL_FAILED',message:error instanceof g.GuardError?error.message:'Rehearsal failed; inspect private evidence'}));process.exitCode=1;});
module.exports={main,counts,locale};
