'use strict';
const crypto = require('node:crypto');

const DATABASE = 'reality_pandit';
const MIGRATION = '20261026093000_property_contact_designations';
const LOCK = [119731, 1];
const LIMITS = Object.freeze({ backupMs: 60 * 60_000, planMs: 15 * 60_000, approvalMs: 15 * 60_000,
    futureMs: 120_000, maxRows: 50, documentBytes: 2 * 1024 * 1024 });
const COLUMNS = Object.freeze([
    ['contacts', 'client_role_label'], ['contacts', 'source_label'],
    ['inventory', 'key_holder_role'], ['inventory', 'key_holder_role_label'],
    ['inventory', 'property_contact_role'], ['inventory', 'property_contact_role_label'],
    ['transactions', 'source_label'],
]);
class GuardError extends Error {
    constructor(code, message) { super(message); this.name = 'GuardError'; this.code = code; }
}
function requireThat(value, code, message) { if (!value) throw new GuardError(code, message); }
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
function canonical(value) {
    if(value instanceof Date)return JSON.stringify(value.toISOString());
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
    return JSON.stringify(value);
}
const equal = (left, right) => canonical(left) === canonical(right);
const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const validRevision = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const validId = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
function timestamp(value, label) {
    const time = typeof value === 'string' && /^\d{4}-\d\d-\d\dT.*Z$/.test(value) ? Date.parse(value) : NaN;
    requireThat(Number.isFinite(time), 'INVALID_TIME', label + ' must be a UTC timestamp'); return time;
}
function fresh(value, maxAge, now, label) {
    const time = timestamp(value, label);
    requireThat(time <= now + LIMITS.futureMs && now - time <= maxAge, 'STALE_EVIDENCE', label + ' is stale or in the future');
    return time;
}
function target(actual, expected, writing = true) {
    for (const value of [actual, expected]) requireThat(value && value.database === DATABASE && /^\d+$/.test(value.cluster_id || '') && /^\d+$/.test(value.database_oid || ''),
        'TARGET_UNPROVEN', 'A database name, cluster identity and database OID are required');
    requireThat(['database', 'cluster_id', 'database_oid'].every(k => actual[k] === expected[k]), 'WRONG_TARGET', 'Database/cluster identity differs from the reviewed target');
    if (writing) requireThat(actual.in_recovery === false && actual.read_only === false, 'READ_ONLY_TARGET', 'Refusing a replica or read-only target');
}
function schemaReady(columns) {
    for (const [table, column] of COLUMNS) {
        const match = columns.filter(c => (c.table || c.table_name) === table && (c.column || c.column_name) === column);
        requireThat(match.length === 1 && (match[0].type || match[0].data_type) === 'text' && (match[0].nullable || match[0].is_nullable) === 'YES' && (match[0].default ?? match[0].column_default ?? null) === null,
            'SCHEMA_NOT_READY', 'Required nullable designation columns are missing or incompatible');
    }
}
function modelContract(datamodel,columns,enums) {
    requireThat(Array.isArray(datamodel?.models)&&datamodel.models.length>0,'CLIENT_UNPROVEN','Generated candidate Prisma model metadata is missing');
    const errors=[],byColumn=new Map(columns.map(c=>[c.table_name+'.'+c.column_name,c]));
    const enumMap=new Map((datamodel.enums||[]).map(e=>[e.name,e]));
    const native={String:['text','varchar','bpchar','uuid','citext','inet','xml'],Boolean:['bool'],Int:['int2','int4'],BigInt:['int8'],Float:['float4','float8'],Decimal:['numeric','money'],DateTime:['date','timestamp','timestamptz','time','timetz'],Json:['json','jsonb'],Bytes:['bytea']};
    for(const model of datamodel.models)for(const field of model.fields){
        if(!['scalar','enum'].includes(field.kind))continue;
        const name=(model.dbName||model.name)+'.'+(field.dbName||field.name),column=byColumn.get(name);
        if(!column){errors.push(name+':missing');continue;}
        const dbType=field.isList?(column.udt_name||'').replace(/^_/,''):column.udt_name;
        if(field.isList&&column.data_type!=='ARRAY'){errors.push(name+':array-type');continue;}
        if(!field.isList&&((field.isRequired&&column.is_nullable!=='NO')||(!field.isRequired&&column.is_nullable!=='YES')))errors.push(name+':nullability');
        if(field.kind==='enum'){
            const definition=enumMap.get(field.type),expected=definition?.dbName||field.type;
            if(dbType!==expected||!definition||!equal(definition.values.map(v=>v.dbName||v.name).sort(),enums.filter(e=>e.typname===expected).map(e=>e.enumlabel).sort()))errors.push(name+':enum-type');
        }else if(!native[field.type]?.includes(dbType))errors.push(name+':scalar-type');
    }
    return errors;
}
function approval(document, context) {
    const now = context.now ?? Date.now();
    requireThat(document?.version === 1 && document.approved === true && document.operation === context.operation,
        'APPROVAL_REQUIRED', 'Explicit approval for this operation is required');
    requireThat(validId(document.operation_id), 'INVALID_OPERATION', 'A unique operation UUID is required');
    requireThat(typeof document.approved_by === 'string' && document.approved_by.trim().length >= 3 && document.approved_by.length<=100 && !/[\x00-\x1f\x7f]/.test(document.approved_by) && typeof document.reason === 'string' && document.reason.trim().length >= 10 && document.reason.length<=500 && !/[\x00-\x1f\x7f]/.test(document.reason),
        'APPROVAL_REQUIRED', 'Reviewer identity and a specific reason are required');
    const approved = fresh(document.approved_at, LIMITS.approvalMs, now, 'Approval');
    const expires = timestamp(document.expires_at, 'Approval expiry');
    requireThat(expires > now && expires > approved && expires - approved <= LIMITS.approvalMs, 'EXPIRED_APPROVAL', 'Approval must expire within fifteen minutes and still be valid');
    requireThat(validRevision(document.active_revision) && document.active_revision === context.activeRevision, 'REVISION_CHANGED', 'The active application revision differs from approval');
    requireThat(validHash(document.subject_sha256) && document.subject_sha256 === context.subjectHash, 'SUBJECT_CHANGED', 'The exact reviewed file bytes differ from approval');
    target(context.target, document.target);
    if (context.tenant) requireThat(document.tenant === context.tenant, 'WRONG_TENANT', 'Approval is for another tenant');
    return document;
}
function evidence(bundle, context) {
    const now = context.now ?? Date.now(), { manifest, proof, receipt } = bundle;
    requireThat(manifest?.version === 2 && proof?.version === 2 && receipt?.version === 2, 'EVIDENCE_VERSION', 'Fresh version-2 target-bound backup/restore evidence is required');
    target(context.target, manifest.target, false); target(context.target, proof.target, false);
    requireThat(manifest.database === DATABASE && manifest.consistent_snapshot===true && manifest.format === 'PostgreSQL custom archive' && Number.isSafeInteger(manifest.bytes) && manifest.bytes > 0,
        'INVALID_BACKUP', 'A non-empty custom-format backup is required');
    fresh(manifest.completed_at, LIMITS.backupMs, now, 'Backup');
    fresh(proof.completed_at, LIMITS.backupMs, now, 'Restore proof');
    requireThat(timestamp(proof.completed_at, 'Restore proof') >= timestamp(manifest.completed_at, 'Backup'), 'INVALID_PROOF', 'Restore proof predates the backup');
    requireThat(validHash(manifest.sha256) && manifest.sha256 === bundle.archiveHash && proof.archive_sha256 === bundle.archiveHash && receipt.archive_sha256 === bundle.archiveHash,
        'BACKUP_CHANGED', 'Backup checksum or proof binding does not match');
    requireThat(receipt.result === 'PASS' && receipt.proof_sha256 === bundle.proofHash && proof.result === 'PASS' && proof.cleanup?.database_absent === true && proof.cleanup?.role_absent === true,
        'INVALID_PROOF', 'Independent successful restore and cleanup evidence is required');
    requireThat(receipt.offsite?.sha256===bundle.archiveHash && receipt.offsite.encrypted===true && typeof receipt.offsite.location_id==='string' && /^[A-Za-z0-9._-]{3,100}$/.test(receipt.offsite.location_id),
        'OFFSITE_RECOVERY_UNPROVEN','An independently verified encrypted off-server copy is required');
    fresh(receipt.offsite.verified_at,LIMITS.backupMs,now,'Off-server copy verification');
    requireThat(timestamp(receipt.offsite.verified_at,'Off-server verification')>=timestamp(manifest.completed_at,'Backup'),'INVALID_PROOF','Off-server verification predates the backup');
    requireThat(proof.steps?.some(s => s.step === 'restore' && s.result === 'PASS') && proof.counts_verified === true,
        'INVALID_PROOF', 'Restored table/data verification is missing');
    requireThat(proof.source_counts && proof.restored_counts && Object.keys(proof.source_counts).length>0 && Object.keys(proof.source_counts).length<=1000 && equal(proof.source_counts,proof.restored_counts) &&
        Object.values(proof.source_counts).every(n=>typeof n==='string'&&/^\d+$/.test(n)), 'INVALID_PROOF','Restored counts must exactly match the exported source snapshot');
    requireThat(validHash(manifest.schema_sha256) && manifest.schema_sha256 === context.schemaHash && proof.source_schema_sha256 === context.schemaHash,
        'SCHEMA_DRIFT', 'Database schema differs from the backed-up/rehearsed schema');
    if (context.operation === 'migration-check') {
        for (const step of ['forward_migration', 'rollback', 'reapply']) requireThat(proof.steps.some(s => s.step === step && s.result === 'PASS'), 'INVALID_PROOF', 'Forward/rollback/reapply rehearsal is incomplete');
        requireThat(proof.migration_sha256 === context.migrationHash && proof.rollback_sha256 === context.rollbackHash,
            'SQL_CHANGED', 'SQL differs from the rehearsed files');
    }
}
function repairSelection(plan, approved, context) {
    const now = context.now ?? Date.now();
    requireThat(plan?.version === 2 && plan.mode === 'DRY_RUN' && plan.tenant === approved.tenant, 'INVALID_PLAN', 'A target-bound v2 dry-run plan for the approved tenant is required');
    fresh(plan.captured_at, LIMITS.planMs, now, 'Repair plan'); target(context.target, plan.target);
    requireThat(plan.active_revision===context.activeRevision && plan.schema_sha256===context.schemaHash,'REVISION_CHANGED','Plan predates the active revision/schema; regenerate it');
    const ids = approved.approved_row_ids;
    requireThat(Array.isArray(ids) && ids.length > 0 && ids.length <= LIMITS.maxRows && ids.every(validId) && new Set(ids).size === ids.length,
        'INVALID_SELECTION', 'Approve 1–50 unique inventory UUIDs explicitly');
    requireThat(Array.isArray(plan.candidates) && new Set(plan.candidates.map(c => c.inventory_id)).size === plan.candidates.length,
        'INVALID_PLAN', 'Duplicate candidate IDs are not allowed');
    const rows = ids.map(id => plan.candidates.find(c => c.inventory_id === id));
    for (const row of rows) {
        requireThat(row && row.tenant_id === approved.tenant && row.can_propose === true && equal(row.proposed_changes, { referral_partner_id: null }) &&
            validId(row.original_values?.referral_partner_id) && validHash(row.snapshot_hash) && validHash(row.identity_hash),
            'AMBIGUOUS_REPAIR', 'Only reviewed staff-partner unlinks are executable; owner replacement is forbidden');
        timestamp(row.expected_updated_at, 'Row version');
    }
    return rows.sort((a, b) => a.inventory_id.localeCompare(b.inventory_id));
}
function liveRepairRow(live, planned, tenant) {
    requireThat(live && live.id === planned.inventory_id && live.tenant_id === tenant, 'ROW_MISSING', 'A reviewed row is missing or belongs to another tenant');
    requireThat(live.snapshot_hash === planned.snapshot_hash && live.identity_hash === planned.identity_hash && live.updated_at === planned.expected_updated_at,
        'ROW_CHANGED', 'A reviewed row or linked identity changed; generate and review a new plan');
    requireThat(live.ownership_type === 'OWNER' && live.contact_exists === true && live.owner_staff === false && live.partner_staff === true && live.referral_partner_id === planned.original_values.referral_partner_id,
        'AMBIGUOUS_REPAIR', 'Live identity no longer qualifies for the reviewed unlink');
    requireThat(live.owner_known===true && validHash(live.preserved_hash) && validHash(live.partner_hash),'AMBIGUOUS_REPAIR','Resolved owner and complete identity snapshots are required');
}
function rollbackSelection(original,approved,context) {
    requireThat(typeof original.tenant==='string'&&original.tenant.length>0&&original.tenant.length<=100,'WRONG_TENANT','A bounded journal tenant is required');
    target(context.target,original.target);
    requireThat(original.version===1 && original.status==='committed' && original.operation==='repair-partners' && validId(original.operation_id),'INVALID_JOURNAL','A committed forward-repair journal is required');
    requireThat(Array.isArray(original.changes) && original.changes.length>0 && original.changes.length<=LIMITS.maxRows && new Set(original.changes.map(c=>c.inventory_id)).size===original.changes.length,'INVALID_JOURNAL','Journal row set is invalid');
    requireThat(equal([...(approved.approved_row_ids||[])].sort(),original.changes.map(c=>c.inventory_id).sort()),'INVALID_SELECTION','Approve the exact original row set for rollback');
    requireThat(approved.operation_id!==original.operation_id,'INVALID_OPERATION','Rollback needs a new operation UUID');
    for(const change of original.changes)requireThat(validId(change.inventory_id)&&validId(change.original_referral_partner_id)&&validHash(change.original_partner_hash)&&validHash(change.after_hash)&&validHash(change.after_identity_hash),'INVALID_JOURNAL','Invalid journal snapshot');
    return [...original.changes].sort((a,b)=>a.inventory_id.localeCompare(b.inventory_id));
}
function liveRollbackRow(live,change,tenant) {
    requireThat(live && live.id===change.inventory_id && live.tenant_id===tenant && live.snapshot_hash===change.after_hash && live.identity_hash===change.after_identity_hash && live.referral_partner_id===null && live.updated_at===change.expected_after_updated_at,
        'ROW_CHANGED','Rollback would overwrite a newer change; manual review is required');
}

/** Adapter owns a real DB transaction and SELECT FOR UPDATE. Journal is durable before COMMIT. */
async function executeRepair({ db, journal, plan, approved, context }) {
    const clock=context.clock||Date.now;
    const check=()=>approval(approved, { ...context, now:clock(), operation: 'repair-partners', tenant: plan.tenant });
    check(); evidence(context.evidenceBundle,{...context,now:clock(),operation:'repair-partners'});
    const selected = repairSelection(plan, approved, {...context,now:clock()});
    await journal.create({ version: 1, status: 'intent', operation: 'repair-partners', operation_id: approved.operation_id,
        tenant: plan.tenant, target: context.target, approval: approved, subject_sha256: context.subjectHash });
    let prepared = false;
    try {
        const result = await db.transaction(async tx => {
            requireThat(await tx.lock(), 'CHANGE_LOCKED', 'Another guarded database change is running');
            target(await tx.target(), context.target);
            requireThat(await tx.schemaHash()===context.schemaHash,'SCHEMA_DRIFT','Schema changed after preflight');
            schemaReady(await tx.columns());
            requireThat(await tx.safeTable(),'UNEXPECTED_DATABASE_BEHAVIOR','Inventory triggers/rules/generated fields/RLS/custom checks require separate review');
            const before = [];
            for (const row of selected) {
                const live = await tx.row(row.inventory_id, plan.tenant, true);
                liveRepairRow(live, row, plan.tenant); before.push(live);
            }
            const changes = [];
            for (const row of before) {
                check();
                const after = await tx.change(row.id, plan.tenant, null, row.snapshot_hash);
                requireThat(after && after.referral_partner_id === null && after.preserved_hash === row.preserved_hash,
                    'UNEXPECTED_WRITE', 'An update changed more than the approved referral link/version');
                changes.push({ inventory_id: row.id, original_referral_partner_id: row.referral_partner_id,
                    original_partner_hash:row.partner_hash,
                    before_hash: row.snapshot_hash, after_hash: after.snapshot_hash, after_identity_hash: after.identity_hash,
                    expected_after_updated_at: after.updated_at });
            }
            const record = { version: 1, status: 'prepared', operation: 'repair-partners', operation_id: approved.operation_id,
                tenant: plan.tenant, target: context.target, approval: approved, subject_sha256: context.subjectHash, changes };
            check();await journal.save(record); prepared = true;
            return record;
        });
        try { await journal.save({ ...result, status: 'committed' }); }
        catch { throw new GuardError('COMMIT_NEEDS_RECONCILIATION', 'Database committed; durable prepared journal must be reconciled before any retry'); }
        return { result: 'COMMITTED', operation_id: approved.operation_id, changed: result.changes.length };
    } catch (error) {
        if (!prepared) await journal.abort?.();
        throw error;
    }
}
async function executeRollback({ db, journal, original, approved, context }) {
    const clock=context.clock||Date.now;
    const check=()=>approval(approved, { ...context,now:clock(), operation: 'rollback-partners', tenant: original.tenant });
    check();evidence(context.evidenceBundle,{...context,now:clock(),operation:'rollback-partners'});
    const selected=rollbackSelection(original,approved,context);
    await journal.create({ version: 1, status: 'intent', operation: 'rollback-partners', operation_id: approved.operation_id,
        tenant: original.tenant, target: context.target, approval: approved, subject_sha256: context.subjectHash });
    let prepared = false;
    try {
        const result = await db.transaction(async tx => {
            requireThat(await tx.lock(), 'CHANGE_LOCKED', 'Another guarded database change is running'); target(await tx.target(), context.target);
            requireThat(await tx.schemaHash()===context.schemaHash,'SCHEMA_DRIFT','Schema changed after preflight');schemaReady(await tx.columns());
            requireThat(await tx.safeTable(),'UNEXPECTED_DATABASE_BEHAVIOR','Inventory triggers/rules/generated fields/RLS/custom checks require separate review');
            const before = [];
            for (const change of selected) {
                const live = await tx.row(change.inventory_id, original.tenant, true);
                liveRollbackRow(live,change,original.tenant);
                requireThat(await tx.partnerUnchanged(change.original_referral_partner_id, original.tenant, change,true), 'IDENTITY_CHANGED', 'Original partner identity cannot be safely restored');
                before.push({ change, live });
            }
            const changes = [];
            for (const {change,live} of before) {
                check();
                const after = await tx.change(live.id, original.tenant, change.original_referral_partner_id, live.snapshot_hash);
                requireThat(after && after.preserved_hash === live.preserved_hash && after.referral_partner_id === change.original_referral_partner_id, 'UNEXPECTED_WRITE', 'Unexpected rollback write');
                changes.push({ inventory_id:live.id,before_hash:live.snapshot_hash,after_hash:after.snapshot_hash,expected_after_updated_at:after.updated_at });
            }
            const record={version:1,status:'prepared',operation:'rollback-partners',operation_id:approved.operation_id,forward_operation_id:original.operation_id,
                tenant:original.tenant,target:context.target,approval:approved,subject_sha256:context.subjectHash,changes};
            check();await journal.save(record);prepared=true;return record;
        });
        try { await journal.save({...result,status:'committed'}); }
        catch { throw new GuardError('COMMIT_NEEDS_RECONCILIATION','Rollback committed; reconcile its prepared journal before any retry'); }
        return {result:'COMMITTED',operation_id:approved.operation_id,changed:result.changes.length};
    } catch(error){if(!prepared)await journal.abort?.();throw error;}
}
function reconciliation(record, rows) {
    requireThat(record?.version===1 && typeof record.tenant==='string' && record.tenant.length>0 && record.tenant.length<=100 && validId(record.operation_id) && ['prepared','committed'].includes(record.status) && ['repair-partners','rollback-partners'].includes(record.operation) &&
        Array.isArray(record.changes) && record.changes.length>0 && record.changes.length<=LIMITS.maxRows && new Set(record.changes.map(c=>c.inventory_id)).size===record.changes.length &&
        record.changes.every(c=>validId(c.inventory_id)&&validHash(c.before_hash)&&validHash(c.after_hash)), 'INVALID_JOURNAL','Complete prepared/committed row snapshots are required; intent-only operations need manual verification');
    const byId=new Map(rows.map(r=>[r.id,r]));
    if(record.changes.every(c=>byId.get(c.inventory_id)?.snapshot_hash===c.after_hash))return 'COMMITTED';
    if(record.status==='prepared'&&record.changes.every(c=>byId.get(c.inventory_id)?.snapshot_hash===c.before_hash))return 'NOT_APPLIED';
    return 'MANUAL_REVIEW_REQUIRED';
}
module.exports={DATABASE,MIGRATION,LOCK,LIMITS,COLUMNS,GuardError,requireThat,sha256,canonical,equal,validHash,validRevision,validId,fresh,target,schemaReady,modelContract,approval,evidence,repairSelection,liveRepairRow,rollbackSelection,liveRollbackRow,executeRepair,executeRollback,reconciliation};
