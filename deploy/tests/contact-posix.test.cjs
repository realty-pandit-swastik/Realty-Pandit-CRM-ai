'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const {FileJournal,secureRead}=require('../contact-journal.cjs');
const {operationLock,hashArchive,activeRelease}=require('../contact-change.cjs');
const linux={skip:process.platform!=='linux'};
const op='00000000-0000-4000-8000-000000000001';
function folder(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rp-posix-'));fs.chmodSync(dir,0o700);return dir;}
test('journals are private, exclusive and atomically updated',linux,async()=>{
    const dir=folder();try{
        const journal=new FileJournal(dir,op);await journal.create({version:1,operation_id:op,status:'intent'});
        assert.equal(fs.statSync(journal.filename).mode&0o777,0o600);
        await assert.rejects(journal.create({operation_id:op}),e=>e.code==='OPERATION_EXISTS');
        await journal.save({version:1,operation_id:op,status:'prepared',changes:[{id:'fixture'}]});
        await assert.rejects(new FileJournal(dir,'00000000-0000-4000-8000-000000000002').create({version:1,operation_id:'00000000-0000-4000-8000-000000000002',status:'intent'}),e=>e.code==='UNRESOLVED_OPERATION');
        assert.equal(secureRead(journal.filename).value.status,'prepared');
        assert.deepEqual(fs.readdirSync(dir),[op+'.json']);
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('public files, links, hardlinks and nonprivate journal directories are rejected',linux,()=>{
    const dir=folder();try{
        const file=path.join(dir,'approval.json');fs.writeFileSync(file,'{}',{mode:0o600});
        fs.chmodSync(file,0o644);assert.throws(()=>secureRead(file),e=>e.code==='UNSAFE_EVIDENCE');fs.chmodSync(file,0o600);
        const link=path.join(dir,'link.json');fs.symlinkSync(file,link);assert.throws(()=>secureRead(link));fs.unlinkSync(link);
        fs.linkSync(file,link);assert.throws(()=>secureRead(file),e=>e.code==='UNSAFE_EVIDENCE');fs.unlinkSync(link);
        fs.chmodSync(dir,0o755);assert.throws(()=>new FileJournal(dir,op),e=>e.code==='UNSAFE_PATH');
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('flock stays held on the parent descriptor and serializes other processes',linux,()=>{
    const dir=folder();try{
        fs.writeFileSync(path.join(dir,'.production-change.lock'),'',{mode:0o600});
        const release=operationLock(dir);
        const other=cp.spawnSync('flock',['--nonblock',path.join(dir,'.production-change.lock'),'true']);assert.notEqual(other.status,0);
        release();assert.equal(cp.spawnSync('flock',['--nonblock',path.join(dir,'.production-change.lock'),'true']).status,0);
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('archive verification checks private ownership, header and exact size',linux,async()=>{
    const dir=folder();try{
        const file=path.join(dir,'archive.dump');fs.writeFileSync(file,'PGDMPfixture',{mode:0o600});
        assert.match(await hashArchive(file,12),/^[a-f0-9]{64}$/);
        await assert.rejects(hashArchive(file,11),e=>e.code==='UNSAFE_BACKUP');
        fs.chmodSync(file,0o644);await assert.rejects(hashArchive(file,12),e=>e.code==='UNSAFE_BACKUP');
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('active release identity cannot escape the release root or use an abbreviated SHA',linux,()=>{
    const dir=folder();try{
        const sha='a'.repeat(40),release=path.join(dir,'releases',sha);fs.mkdirSync(release,{recursive:true});fs.writeFileSync(path.join(release,'REVISION'),sha);
        fs.symlinkSync(release,path.join(dir,'current'));assert.equal(activeRelease(dir).revision,sha);
        fs.writeFileSync(path.join(release,'REVISION'),'short');assert.throws(()=>activeRelease(dir),e=>e.code==='REVISION_UNPROVEN');
        fs.unlinkSync(path.join(dir,'current'));fs.symlinkSync(os.tmpdir(),path.join(dir,'current'));assert.throws(()=>activeRelease(dir),e=>e.code==='LAYOUT_UNPREPARED');
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
