'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {GuardError,requireThat,LIMITS,validId}=require('./contact-guards.cjs');

function privateDirectory(directory) {
    requireThat(process.platform==='linux','LINUX_OPERATOR_REQUIRED','Use the Linux production operator environment');
    requireThat(typeof directory==='string' && path.isAbsolute(directory) && directory!=='/','UNSAFE_PATH','An absolute private operations directory is required');
    const resolved=fs.realpathSync(directory),stat=fs.lstatSync(directory);
    requireThat(resolved===path.resolve(directory) && stat.isDirectory() && !stat.isSymbolicLink() && stat.uid===process.getuid() && (stat.mode&0o777)===0o700,
        'UNSAFE_PATH','Operations directory must be owned by this operator, mode 0700 and not symlinked');
    requireThat(!/\/(?:releases|uploads|node_modules)\//.test(resolved+'/'),'UNSAFE_PATH','Journals must live outside release, uploads and dependency trees');
    return resolved;
}
function secureRead(filename) {
    requireThat(process.platform==='linux','LINUX_OPERATOR_REQUIRED','Use the Linux production operator environment');
    requireThat(typeof filename==='string' && path.isAbsolute(filename),'UNSAFE_PATH','An absolute evidence path is required');
    const descriptor=fs.openSync(filename,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
    try {
        const stat=fs.fstatSync(descriptor);
        requireThat(stat.isFile() && stat.nlink===1 && stat.uid===process.getuid() && (stat.mode&0o077)===0 && stat.size<=LIMITS.documentBytes,
            'UNSAFE_EVIDENCE','Evidence must be a small, private, operator-owned regular file');
        const bytes=fs.readFileSync(descriptor);return {bytes,value:JSON.parse(bytes.toString('utf8'))};
    } finally {fs.closeSync(descriptor);}
}
function syncDirectory(directory) {const fd=fs.openSync(directory,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function writePrivate(filename,value,exclusive=false) {
    const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');
    requireThat(bytes.length<=LIMITS.documentBytes,'JOURNAL_TOO_LARGE','Operation journal exceeds its limit');
    const fd=fs.openSync(filename,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_NOFOLLOW|(exclusive?fs.constants.O_EXCL:fs.constants.O_TRUNC),0o600);
    try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
class FileJournal {
    constructor(directory,id){this.directory=privateDirectory(directory);requireThat(validId(id),'INVALID_OPERATION','Invalid operation UUID');this.id=id;this.filename=path.join(this.directory,id+'.json');}
    async create(value){
        try{
            if(fs.existsSync(this.filename))throw Object.assign(new Error('exists'),{code:'EEXIST'});
            const files=fs.readdirSync(this.directory).filter(name=>/^[a-f0-9-]{36}\.json$/.test(name));
            requireThat(files.length<=10000,'JOURNAL_BUDGET','Archive old completed journals through an approved retention process');
            for(const name of files){const prior=secureRead(path.join(this.directory,name)).value;
                requireThat(prior.version===1&&typeof prior.status==='string','INVALID_JOURNAL','An unreadable journal requires manual review');
                if(['intent','prepared'].includes(prior.status))throw new GuardError('UNRESOLVED_OPERATION','Reconcile interrupted operations before starting another change');
            }
            writePrivate(this.filename,value,true);syncDirectory(this.directory);
        }
        catch(error){if(error.code==='EEXIST')throw new GuardError('OPERATION_EXISTS','Operation UUID already has a journal; reconcile it instead of retrying');throw error;}
    }
    async save(value){
        const current=secureRead(this.filename).value;
        requireThat(current.operation_id===this.id && value.operation_id===this.id,'INVALID_JOURNAL','Journal identity mismatch');
        const temp=path.join(this.directory,'.'+this.id+'.'+crypto.randomUUID()+'.tmp');
        try{writePrivate(temp,value,true);fs.renameSync(temp,this.filename);syncDirectory(this.directory);}
        finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
    }
    async abort(){const current=secureRead(this.filename).value;await this.save({...current,status:'aborted_before_commit'});}
}
module.exports={FileJournal,secureRead,privateDirectory,writePrivate,syncDirectory};
